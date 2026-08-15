import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import type { GymName } from "./types";
import { getCatalogItemBySlug } from "./catalog";
import { grantCreditToMember } from "./pods";

export type DiscountMode = "ongoing" | "first_payment_only";

export interface ActiveMembership {
  tierId: string;
  tierName: string;
  creditsPerPeriod: number;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
  isComp: boolean;
}

/** One row per member (memberships.member_id is unique), so "active" is a status filter, not a lookup-then-check. */
export async function getActiveMembershipForMember(memberId: number): Promise<ActiveMembership | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("tier_id, tier_name, credits_per_period, status, current_period_end, stripe_subscription_id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    tierId: data.tier_id,
    tierName: data.tier_name,
    creditsPerPeriod: data.credits_per_period,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    isComp: data.stripe_subscription_id === null,
  };
}

async function verifyMemberGym(gym: GymName, memberId: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("members").select("gym").eq("id", memberId).maybeSingle();
  if (error) throw error;
  return !!data && data.gym === gym;
}

async function getMemberStripeCustomerId(memberId: number): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("members").select("stripe_customer_id").eq("id", memberId).maybeSingle();
  if (error) throw error;
  return data?.stripe_customer_id ?? null;
}

export interface SavedPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/**
 * Whatever card a member last used, if podhq-client's webhook captured a
 * stripe_customer_id for them (from a prior Checkout Session that included
 * one). Read live from Stripe rather than cached locally — the "default"
 * card can change on Stripe's side (e.g. an expired card auto-updated via
 * card account updater) and this only needs to be current at display/charge
 * time, not tracked historically.
 */
export async function getSavedPaymentMethod(memberId: number): Promise<SavedPaymentMethod | null> {
  const customerId = await getMemberStripeCustomerId(memberId);
  if (!customerId) return null;

  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
  if (customer.deleted) return null;

  const pm = customer.invoice_settings?.default_payment_method;
  const paymentMethod = typeof pm === "object" && pm !== null ? pm : null;
  if (!paymentMethod?.card) return null;

  return {
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: paymentMethod.card.exp_month,
    expYear: paymentMethod.card.exp_year,
  };
}

export type CompResult =
  | { status: "ok"; newBalance?: number; membership?: ActiveMembership }
  | { status: "not_found" }
  | { status: "already_active" }
  | { status: "unknown_item" }
  | { status: "error"; message: string };

/** Free credit pack — just a manual_grant credits row, same path the standalone "Grant credit" feature uses, sized to the catalog pack. */
export async function compCreditPack(gym: GymName, memberId: number, packId: string): Promise<CompResult> {
  const pack = await getCatalogItemBySlug(gym, packId);
  if (!pack || pack.type !== "credit_pack") return { status: "unknown_item" };

  const result = await grantCreditToMember(gym, memberId, pack.credits);
  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "error") return { status: "error", message: result.message };
  return { status: "ok", newBalance: result.newBalance };
}

/**
 * Free membership — ledger-only comp, no real Stripe subscription behind
 * it (0027_membership_comp_and_discount.sql widened stripe_subscription_id
 * to nullable for this). Won't auto-renew or auto-bill; endDate is an
 * optional cutoff staff can set, otherwise it stays active until someone
 * changes it by hand. Grants the first period's credits immediately,
 * mirroring what invoice.payment_succeeded does for a real subscription's
 * first invoice.
 */
export async function compMembership(
  gym: GymName,
  memberId: number,
  tierId: string,
  endDate: string | null
): Promise<CompResult> {
  const tier = await getCatalogItemBySlug(gym, tierId);
  if (!tier || tier.type !== "membership") return { status: "unknown_item" };

  const gymMatches = await verifyMemberGym(gym, memberId);
  if (!gymMatches) return { status: "not_found" };

  const existing = await getActiveMembershipForMember(memberId);
  if (existing) return { status: "already_active" };

  const admin = createAdminClient();
  const { error: membershipError } = await admin.from("memberships").upsert(
    {
      member_id: memberId,
      tier_id: tier.itemId,
      tier_name: tier.name,
      credits_per_period: tier.credits,
      stripe_subscription_id: null,
      status: "active",
      current_period_end: endDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" }
  );
  if (membershipError) return { status: "error", message: membershipError.message };

  const { error: creditError } = await admin
    .from("credits")
    .insert({ member_id: memberId, amount: tier.credits, reason: "membership" });
  if (creditError) return { status: "error", message: creditError.message };

  const { data: balance, error: balanceError } = await admin.rpc("get_credit_balance", { p_member_id: memberId });
  if (balanceError) throw balanceError;

  return {
    status: "ok",
    newBalance: (balance as number) ?? 0,
    membership: {
      tierId: tier.itemId,
      tierName: tier.name,
      creditsPerPeriod: tier.credits,
      status: "active",
      currentPeriodEnd: endDate,
      isComp: true,
    },
  };
}

export type CreateCheckoutResult =
  | { status: "ok"; clientSecret: string }
  | { status: "not_found" }
  | { status: "already_active" }
  | { status: "unknown_item" }
  | { status: "error"; message: string };

/** Staff-initiated, but the member completes payment themselves in the embedded form — same "never touch raw card data" principle as every other Stripe flow in this project. */
export async function createPackCheckoutSession(
  gym: GymName,
  memberId: number,
  packId: string,
  priceGBP: number,
  origin: string
): Promise<CreateCheckoutResult> {
  const pack = await getCatalogItemBySlug(gym, packId);
  if (!pack || pack.type !== "credit_pack") return { status: "unknown_item" };

  const gymMatches = await verifyMemberGym(gym, memberId);
  if (!gymMatches) return { status: "not_found" };

  const stripe = getStripeClient();
  try {
    const existingCustomerId = await getMemberStripeCustomerId(memberId);

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_creation: "always" }),
      // Reuses the card for future staff-initiated off-session charges
      // (the "Charge card on file" option) — the member consents to this
      // by completing this real, on-session payment; podhq-client's
      // webhook captures the resulting Customer id back onto this member.
      payment_intent_data: { setup_future_usage: "off_session" },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(priceGBP * 100),
            product_data: { name: `${pack.name} — ${pack.label}` },
          },
        },
      ],
      metadata: { member_id: String(memberId), credits: String(pack.credits) },
      return_url: `${origin}/pods/members/${memberId}?checkout_session_id={CHECKOUT_SESSION_ID}`,
    });

    if (!session.client_secret) return { status: "error", message: "Could not start checkout." };
    return { status: "ok", clientSecret: session.client_secret };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Stripe error." };
  }
}

/**
 * A discount below the tier's listed price can apply to every future
 * payment ("ongoing" — set directly as the recurring price_data amount, no
 * Stripe object needed beyond the subscription itself) or to only the
 * first payment ("first_payment_only" — the subscription's real recurring
 * price stays full price, and a one-time Stripe coupon with duration:
 * 'once' knocks the first invoice down instead, so renewals bill at full
 * price automatically with no follow-up action needed).
 */
export async function createMembershipCheckoutSession(
  gym: GymName,
  memberId: number,
  tierId: string,
  priceGBP: number,
  discountMode: DiscountMode,
  origin: string
): Promise<CreateCheckoutResult> {
  const tier = await getCatalogItemBySlug(gym, tierId);
  if (!tier || tier.type !== "membership") return { status: "unknown_item" };

  const gymMatches = await verifyMemberGym(gym, memberId);
  if (!gymMatches) return { status: "not_found" };

  const existing = await getActiveMembershipForMember(memberId);
  if (existing) return { status: "already_active" };

  const stripe = getStripeClient();
  try {
    const isFirstPaymentDiscount = discountMode === "first_payment_only" && priceGBP < tier.priceGBP;
    const recurringPriceGBP = isFirstPaymentDiscount ? tier.priceGBP : priceGBP;

    let couponId: string | undefined;
    if (isFirstPaymentDiscount) {
      const coupon = await stripe.coupons.create({
        duration: "once",
        amount_off: Math.round((tier.priceGBP - priceGBP) * 100),
        currency: "gbp",
        name: `${tier.name} — one-off staff discount`,
      });
      couponId = coupon.id;
    }

    const existingCustomerId = await getMemberStripeCustomerId(memberId);

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "subscription",
      ...(existingCustomerId ? { customer: existingCustomerId } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(recurringPriceGBP * 100),
            recurring: { interval: "month" },
            product_data: { name: `${tier.name} — ${tier.label}` },
          },
        },
      ],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      subscription_data: {
        metadata: {
          member_id: String(memberId),
          tier_id: tier.itemId,
          tier_name: tier.name,
          credits_per_period: String(tier.credits),
        },
      },
      return_url: `${origin}/pods/members/${memberId}?checkout_session_id={CHECKOUT_SESSION_ID}`,
    });

    if (!session.client_secret) return { status: "error", message: "Could not start checkout." };
    return { status: "ok", clientSecret: session.client_secret };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Stripe error." };
  }
}

export type ChargeSavedCardResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "no_saved_card" }
  | { status: "already_active" }
  | { status: "unknown_item" }
  | { status: "requires_authentication" }
  | { status: "error"; message: string };

/**
 * Off-session charge against a member's saved card — no Checkout, no
 * embedded form, matching GymFlow's "Take Payment" against a stored
 * card. Ledger write happens via podhq-client's webhook
 * (payment_intent.succeeded), same source-of-truth pattern as every other
 * Stripe-funded purchase in this app, not written directly here.
 */
export async function chargeSavedCardForPack(
  gym: GymName,
  memberId: number,
  packId: string,
  priceGBP: number
): Promise<ChargeSavedCardResult> {
  const pack = await getCatalogItemBySlug(gym, packId);
  if (!pack || pack.type !== "credit_pack") return { status: "unknown_item" };

  const gymMatches = await verifyMemberGym(gym, memberId);
  if (!gymMatches) return { status: "not_found" };

  const customerId = await getMemberStripeCustomerId(memberId);
  if (!customerId) return { status: "no_saved_card" };

  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
  const pm = !customer.deleted ? customer.invoice_settings?.default_payment_method : null;
  const paymentMethodId = typeof pm === "object" && pm !== null ? pm.id : typeof pm === "string" ? pm : null;
  if (!paymentMethodId) return { status: "no_saved_card" };

  try {
    await stripe.paymentIntents.create({
      amount: Math.round(priceGBP * 100),
      currency: "gbp",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { member_id: String(memberId), credits: String(pack.credits), source: "staff_saved_card" },
    });
    return { status: "ok" };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "authentication_required") {
      return { status: "requires_authentication" };
    }
    return { status: "error", message: err instanceof Error ? err.message : "Stripe error." };
  }
}

/**
 * A recurring membership can't be a plain PaymentIntent (subscriptions are
 * their own object) — this creates the Subscription directly with the
 * saved card as its payment method, skipping Checkout entirely.
 * payment_behavior: 'error_if_incomplete' makes creation fail synchronously
 * if the first payment doesn't succeed, instead of leaving a dangling
 * incomplete subscription for staff to notice later.
 */
export async function createMembershipWithSavedCard(
  gym: GymName,
  memberId: number,
  tierId: string,
  priceGBP: number,
  discountMode: DiscountMode
): Promise<ChargeSavedCardResult> {
  const tier = await getCatalogItemBySlug(gym, tierId);
  if (!tier || tier.type !== "membership") return { status: "unknown_item" };

  const gymMatches = await verifyMemberGym(gym, memberId);
  if (!gymMatches) return { status: "not_found" };

  const existing = await getActiveMembershipForMember(memberId);
  if (existing) return { status: "already_active" };

  const customerId = await getMemberStripeCustomerId(memberId);
  if (!customerId) return { status: "no_saved_card" };

  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
  const pm = !customer.deleted ? customer.invoice_settings?.default_payment_method : null;
  const paymentMethodId = typeof pm === "object" && pm !== null ? pm.id : typeof pm === "string" ? pm : null;
  if (!paymentMethodId) return { status: "no_saved_card" };

  try {
    const isFirstPaymentDiscount = discountMode === "first_payment_only" && priceGBP < tier.priceGBP;
    const recurringPriceGBP = isFirstPaymentDiscount ? tier.priceGBP : priceGBP;

    let couponId: string | undefined;
    if (isFirstPaymentDiscount) {
      const coupon = await stripe.coupons.create({
        duration: "once",
        amount_off: Math.round((tier.priceGBP - priceGBP) * 100),
        currency: "gbp",
        name: `${tier.name} — one-off staff discount`,
      });
      couponId = coupon.id;
    }

    // Unlike Checkout Sessions, the Subscriptions API's price_data takes a
    // real Product id, not inline product_data — create one on the fly.
    const product = await stripe.products.create({ name: `${tier.name} — ${tier.label}` });

    await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: paymentMethodId,
      payment_behavior: "error_if_incomplete",
      items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: Math.round(recurringPriceGBP * 100),
            recurring: { interval: "month" },
            product: product.id,
          },
        },
      ],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      metadata: {
        member_id: String(memberId),
        tier_id: tier.itemId,
        tier_name: tier.name,
        credits_per_period: String(tier.credits),
      },
    });
    return { status: "ok" };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "authentication_required") {
      return { status: "requires_authentication" };
    }
    return { status: "error", message: err instanceof Error ? err.message : "Stripe error." };
  }
}

export interface CheckoutSessionStatus {
  status: string;
  paid: boolean;
}

/** Read back after the embedded Checkout's return_url redirect — memberId is checked against the session's own metadata so staff can't probe another member's/gym's session by guessing an id in the URL. */
export async function getCheckoutSessionStatus(sessionId: string, memberId: number): Promise<CheckoutSessionStatus | null> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

  const sessionMemberId =
    session.metadata?.member_id ??
    (typeof session.subscription === "object" && session.subscription !== null ? session.subscription.metadata?.member_id : undefined);

  if (Number(sessionMemberId) !== memberId) return null;

  return { status: session.status ?? "unknown", paid: session.payment_status === "paid" || session.status === "complete" };
}
