export const GYM_NAMES = [
  "Aylesbury Berryfields",
  "Basingstoke",
  "Berkhamsted",
  "Crewe",
  "Fairford Leys",
  "Hackney",
  "Kingston upon Thames",
  "Milton Keynes",
  "Oxford East",
] as const;

export type GymName = (typeof GYM_NAMES)[number];

export const OUTGOING_CATEGORIES = [
  "Rent/Lease",
  "Staff Wages",
  "Utilities",
  "Insurance",
  "Equipment (purchase/maintenance)",
  "Software/Subscriptions",
  "Cleaning",
  "Card/Merchant Processing Fees",
  "Other",
] as const;

export type OutgoingCategory = (typeof OUTGOING_CATEGORIES)[number];

// Recurring categories carry forward month to month (same convention as
// OUTGOING_CATEGORIES) until a new value is entered — a fixed
// rental/contract/commission amount that's genuinely the same most months.
// One-off categories are looked up for the exact month only; no entry means
// £0 that month, since this income is expected to vary and a stale
// carried-forward figure would overstate a quiet month.
export const OTHER_INCOME_CATEGORIES = [
  "Room / Space Rental",
  "Vending Commission",
  "Corporate / Wellness Contract",
  "Other Recurring Income",
  "Personal Training",
  "Retail Sales",
  "Event Income",
  "Other One-off Income",
] as const;

export type OtherIncomeCategory = (typeof OTHER_INCOME_CATEGORIES)[number];

export const RECURRING_INCOME_CATEGORIES: ReadonlySet<OtherIncomeCategory> = new Set([
  "Room / Space Rental",
  "Vending Commission",
  "Corporate / Wellness Contract",
  "Other Recurring Income",
]);

export const LEAD_STATUSES = ["new_lead", "contacted", "trial"] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface RevenueRow {
  id: number;
  gym: string;
  date: string;
  item: string;
  quantity_sold: number;
  amount_inc_tax: number;
  category: "MEMBERSHIP" | "CREDIT_PACK";
  sold_to: string;
  report_month: string;
  created_at: string;
}

export interface AttendanceRow {
  id: number;
  gym: string;
  user_member_id: string;
  first_name: string;
  last_name: string;
  attendance: number;
  last_attended: string | null;
  report_month: string;
  created_at: string;
}

export interface AdSpendRow {
  id: number;
  gym: string;
  week_starting: string;
  spend_gbp: number;
  clicks: number;
  leads: number;
  uploaded_by: string | null;
  created_at: string;
}
