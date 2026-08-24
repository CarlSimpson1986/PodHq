export const GYM_NAMES = [
  "Aylesbury Berryfields",
  "Basingstoke",
  "Berkhamsted",
  "Crewe",
  "Fairford Leys",
  "Hackney",
  "Hove",
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

// pod_resources.equipment — gates which exercises podhq-client's AI Coach
// can prescribe at a given pod. Duplicated verbatim in podhq-client's
// src/lib/coach/types.ts, same cross-repo convention as GYM_NAMES above
// (that file's src/lib/gym.ts comment: "must match podHq's GYM_NAMES
// exactly"). One "cable_machine" category deliberately covers both dual-
// and single-pulley setups — see that file's own comment.
export const EQUIPMENT_TYPES = ["barbell_rack", "cable_machine", "dumbbells", "leg_extension_curl_machine"] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

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
