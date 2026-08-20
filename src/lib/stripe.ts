import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client — staff refunds, sell/comp packs & memberships,
 * and Stripe Connect account management (src/lib/data/stripe-connect-config.ts).
 * Deliberately a separate env var from podhq-client's STRIPE_SECRET_KEY, not
 * the same value reused across both apps — this app should hold a
 * restricted key (Checkout Sessions, Coupons, Payment Intents, Products,
 * Subscriptions, Refunds all Write; Customers Read; Accounts and Account
 * Links Write, with the Connect-column permission also enabled for every
 * resource above except Accounts/Account Links, since every one of them can
 * run against a connected account via src/lib/data/sales.ts) rather than the
 * full-access key, same principle CLAUDE.md already applies to KISI_API_KEY.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}
