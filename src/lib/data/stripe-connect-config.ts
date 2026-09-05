import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-encryption";
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

// Connect-only — returns null for a standalone gym (Hove/Berryfields),
// since a standalone row's onboarding_complete is always false (see
// upsertStripeStandaloneConfig below). Kept only for the Connect
// onboarding flow itself; every other caller that touches Stripe for a
// specific gym should use getGymStripeContext instead, which also
// handles the standalone case correctly. Found 2026-09-05 wargaming
// production: the refund route (and sales.ts's checkout/comp functions)
// used this + the platform getStripeClient() directly, so any
// Stripe-touching staff action for a standalone gym silently ran
// against the *platform* account instead of that gym's real one —
// broken for Hove/Berryfields specifically since 0084 shipped, no error
// until wargaming actually tried a live refund and got a generic 500.
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

export interface GymStripeContext {
  client: Stripe;
  requestOptions?: Stripe.RequestOptions;
}

// Resolves which Stripe account a gym's payments actually go through —
// checked in order: (1) a standalone gym (Carl's own, e.g. Hove) has its
// own real account and its own key, used directly, no stripeAccount
// header at all; (2) a franchisee gym that's completed Stripe Connect
// onboarding gets the shared platform key + a stripeAccount request
// option; (3) no config at all falls back to the shared platform
// account, exactly as every gym behaved before Connect existed. Ported
// from podhq-client's identical helper (src/lib/data/stripe-config.ts
// there) — every route here that creates or reads a Stripe object for a
// specific gym should go through this, not getStripeAccountId directly.
export async function getGymStripeContext(gym: GymName): Promise<GymStripeContext> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_stripe_config")
    .select("stripe_account_id, onboarding_complete, api_key_encrypted")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;

  if (data?.api_key_encrypted) {
    return { client: new Stripe(decryptSecret(data.api_key_encrypted)) };
  }
  if (data?.onboarding_complete && data.stripe_account_id) {
    return { client: getStripeClient(), requestOptions: { stripeAccount: data.stripe_account_id } };
  }
  return { client: getStripeClient() };
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

// --- Standalone (owned-gym) config — see 0084_gym_stripe_standalone.sql ---
// A completely separate mechanism from Connect above: no account id, no
// stripeAccount header — the gym's own key is used directly. For an owned
// gym like Hove, not a franchisee.

export interface StripeStandaloneConfigSummary {
  hasKey: boolean;
  updatedAt: string | null;
}

/** Masked view for the Setup UI — the real key/secret are never returned here. */
export async function getStripeStandaloneConfigSummary(gym: GymName): Promise<StripeStandaloneConfigSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gym_stripe_config")
    .select("api_key_encrypted, updated_at")
    .eq("gym", gym)
    .maybeSingle();
  if (error) throw error;
  if (!data?.api_key_encrypted) return { hasKey: false, updatedAt: null };
  return { hasKey: true, updatedAt: data.updated_at };
}

export type UpsertStripeStandaloneConfigResult = { status: "ok" } | { status: "error"; message: string };

export async function upsertStripeStandaloneConfig(
  gym: GymName,
  apiKey: string,
  webhookSecret: string,
  updatedBy: string
): Promise<UpsertStripeStandaloneConfigResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("gym_stripe_config").upsert(
    {
      gym,
      api_key_encrypted: encryptSecret(apiKey),
      webhook_secret_encrypted: encryptSecret(webhookSecret),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
      // stripe_account_id is NOT NULL — a standalone gym has no Connect
      // account id, so this stays a harmless placeholder rather than
      // widening the column to nullable just for this one case. Never
      // read for a standalone gym (api_key_encrypted takes priority —
      // see getGymStripeClient in both apps' data layers).
      stripe_account_id: "standalone",
      onboarding_complete: false,
    },
    { onConflict: "gym" }
  );
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}
