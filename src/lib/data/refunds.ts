import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GymName } from "./types";

export type RefundableTransactionType = "credit_pack" | "membership" | "gift_voucher";

export interface RefundableTransaction {
  /** `credits.id` for credit_pack/membership, `gift_vouchers.id` for gift_voucher — the two tables' ids aren't unique against each other, so the type must always travel with the id. */
  id: number;
  type: RefundableTransactionType;
  memberId: number;
  memberName: string;
  /** Credits granted (credit_pack/membership) or the voucher's face value in GBP (gift_voucher) — whichever the source row actually stores; there's no shared GBP price column for the first two to show instead. */
  amountLabel: string;
  createdAt: string;
  paymentIntentId: string;
  refunded: boolean;
}

interface CreditRow {
  id: number;
  member_id: number;
  amount: number;
  reason: "purchase" | "membership" | "refund";
  created_at: string;
  stripe_payment_intent_id: string | null;
  members: { name: string } | null;
}

interface GiftVoucherRow {
  id: number;
  purchaser_member_id: number;
  amount_gbp: number;
  credits: number;
  created_at: string;
  stripe_payment_intent_id: string | null;
  refunded_at: string | null;
  members: { name: string } | null;
}

/** Stripe-funded transactions for one member, newest first — the source list for the member profile page's Payments section (moved here from a gym-wide list, since refunds are now issued from an individual member's profile). Only rows with a captured stripe_payment_intent_id can ever be refunded, so rows without one (pre-migration purchases, manual_grant/booking_used/booking_refund credits) are excluded entirely rather than shown as permanently un-refundable. */
export async function getTransactionsForMember(memberId: number): Promise<RefundableTransaction[]> {
  const admin = createAdminClient();

  const [creditsResult, vouchersResult] = await Promise.all([
    admin
      .from("credits")
      .select("id, member_id, amount, reason, created_at, stripe_payment_intent_id, members(name)")
      .eq("member_id", memberId)
      .not("stripe_payment_intent_id", "is", null)
      .in("reason", ["purchase", "membership", "refund"])
      .order("created_at", { ascending: false })
      .returns<CreditRow[]>(),
    admin
      .from("gift_vouchers")
      .select("id, purchaser_member_id, amount_gbp, credits, created_at, stripe_payment_intent_id, refunded_at, members!purchaser_member_id(name)")
      .eq("purchaser_member_id", memberId)
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .returns<GiftVoucherRow[]>(),
  ]);

  if (creditsResult.error) throw creditsResult.error;
  if (vouchersResult.error) throw vouchersResult.error;

  const creditRows = creditsResult.data ?? [];
  const refundedPaymentIntentIds = new Set(
    creditRows.filter((row) => row.reason === "refund" && row.stripe_payment_intent_id).map((row) => row.stripe_payment_intent_id)
  );

  const creditTransactions: RefundableTransaction[] = creditRows
    .filter((row): row is CreditRow & { reason: "purchase" | "membership"; stripe_payment_intent_id: string } =>
      (row.reason === "purchase" || row.reason === "membership") && row.stripe_payment_intent_id !== null
    )
    .map((row) => ({
      id: row.id,
      type: row.reason === "purchase" ? "credit_pack" : "membership",
      memberId: row.member_id,
      memberName: row.members?.name ?? "Unknown member",
      amountLabel: `${row.amount} credit${row.amount === 1 ? "" : "s"}`,
      createdAt: row.created_at,
      paymentIntentId: row.stripe_payment_intent_id,
      refunded: refundedPaymentIntentIds.has(row.stripe_payment_intent_id),
    }));

  const voucherTransactions: RefundableTransaction[] = (vouchersResult.data ?? [])
    .filter((row): row is GiftVoucherRow & { stripe_payment_intent_id: string } => row.stripe_payment_intent_id !== null)
    .map((row) => ({
      id: row.id,
      type: "gift_voucher",
      memberId: row.purchaser_member_id,
      memberName: row.members?.name ?? "Unknown member",
      amountLabel: `£${row.amount_gbp.toFixed(2)} voucher`,
      createdAt: row.created_at,
      paymentIntentId: row.stripe_payment_intent_id,
      refunded: row.refunded_at !== null,
    }));

  return [...creditTransactions, ...voucherTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export type RefundLookupResult =
  | { status: "ok"; paymentIntentId: string; memberGym: GymName }
  | { status: "not_found" }
  | { status: "already_refunded" };

/** Looks up a transaction's payment_intent and owning gym for the refund route to verify against the caller's gym scope before ever calling Stripe — never trusts a client-supplied gym. */
export async function lookupRefundableTransaction(
  type: RefundableTransactionType,
  id: number
): Promise<RefundLookupResult> {
  const admin = createAdminClient();

  if (type === "gift_voucher") {
    const { data, error } = await admin
      .from("gift_vouchers")
      .select("stripe_payment_intent_id, refunded_at, members!purchaser_member_id(gym)")
      .eq("id", id)
      .maybeSingle<{ stripe_payment_intent_id: string | null; refunded_at: string | null; members: { gym: GymName } | null }>();

    if (error) throw error;
    if (!data || !data.stripe_payment_intent_id || !data.members) return { status: "not_found" };
    if (data.refunded_at) return { status: "already_refunded" };
    return { status: "ok", paymentIntentId: data.stripe_payment_intent_id, memberGym: data.members.gym };
  }

  const reason = type === "credit_pack" ? "purchase" : "membership";
  const { data, error } = await admin
    .from("credits")
    .select("stripe_payment_intent_id, members(gym)")
    .eq("id", id)
    .eq("reason", reason)
    .maybeSingle<{ stripe_payment_intent_id: string | null; members: { gym: GymName } | null }>();

  if (error) throw error;
  if (!data || !data.stripe_payment_intent_id || !data.members) return { status: "not_found" };

  const { count, error: refundCheckError } = await admin
    .from("credits")
    .select("id", { count: "exact", head: true })
    .eq("reason", "refund")
    .eq("stripe_payment_intent_id", data.stripe_payment_intent_id);

  if (refundCheckError) throw refundCheckError;
  if (count && count > 0) return { status: "already_refunded" };

  return { status: "ok", paymentIntentId: data.stripe_payment_intent_id, memberGym: data.members.gym };
}
