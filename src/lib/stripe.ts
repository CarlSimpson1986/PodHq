import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client, staff-side refund actions only. Deliberately a
 * separate env var from podhq-client's STRIPE_SECRET_KEY, not the same
 * value reused across both apps — this app should hold a restricted key
 * (Charges: read, Refunds: write) rather than the full-access key that can
 * also create checkout sessions and subscriptions, same principle CLAUDE.md
 * already applies to KISI_API_KEY.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}
