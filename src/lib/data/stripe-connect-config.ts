import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import type { GymName } from "./types";

export interface StripeConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
}

export async function getStripeConnectStatus(gym: GymName): Promise<StripeConnectStatus> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_stripe_config")
    .select("onboarding_complete")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, onboardingComplete: false };
  return { connected: true, onboardingComplete: data.onboarding_complete };
}

export type StartOnboardingResult = { status: "ok"; url: string } | { status: "error"; message: string };

// Reuses the gym's existing connected account (if the admin left mid-flow
// and came back) rather than creating a second acct_ every time this is
// called — Stripe accounts aren't free to abandon cleanly, and a gym
// should only ever have one.
export async function startStripeConnectOnboarding(
  gym: GymName,
  returnUrl: string,
  refreshUrl: string,
  updatedBy: string
): Promise<StartOnboardingResult> {
  const admin = createAdminClient();
  const stripe = getStripeClient();

  const { data: existing, error: lookupError } = await admin
    .from("gym_stripe_config")
    .select("stripe_account_id")
    .eq("gym", gym)
    .maybeSingle();
  if (lookupError) return { status: "error", message: lookupError.message };

  let accountId = existing?.stripe_account_id ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({ type: "standard" });
    accountId = account.id;

    const { error: insertError } = await admin.from("gym_stripe_config").insert({
      gym,
      stripe_account_id: accountId,
      onboarding_complete: false,
      updated_by: updatedBy,
    });
    if (insertError) return { status: "error", message: insertError.message };
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return { status: "ok", url: accountLink.url };
}

// Used by the refund route to know which Stripe account a payment was
// actually processed on — null means the platform account (every gym
// today, until it's been through onboarding above).
export async function getStripeAccountId(gym: GymName): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_stripe_config")
    .select("stripe_account_id, onboarding_complete")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.onboarding_complete) return null;
  return data.stripe_account_id;
}

export type CompleteReturnResult =
  | { status: "ok"; onboardingComplete: boolean }
  | { status: "error"; message: string };

// Stripe's return_url redirect doesn't guarantee onboarding actually
// finished (the account holder may have exited early) — details_submitted
// on the real Account object is the source of truth, not the redirect
// itself, same "don't trust the redirect, check the real state" reasoning
// podhq-client's Stripe Checkout success_url already documents.
export async function completeStripeConnectReturn(gym: GymName): Promise<CompleteReturnResult> {
  const admin = createAdminClient();
  const stripe = getStripeClient();

  const { data, error: lookupError } = await admin
    .from("gym_stripe_config")
    .select("stripe_account_id")
    .eq("gym", gym)
    .maybeSingle();
  if (lookupError) return { status: "error", message: lookupError.message };
  if (!data) return { status: "error", message: "No Stripe Connect onboarding was started for this gym." };

  const account = await stripe.accounts.retrieve(data.stripe_account_id);

  const { error: updateError } = await admin
    .from("gym_stripe_config")
    .update({ onboarding_complete: account.details_submitted, updated_at: new Date().toISOString() })
    .eq("gym", gym);
  if (updateError) return { status: "error", message: updateError.message };

  return { status: "ok", onboardingComplete: account.details_submitted };
}
