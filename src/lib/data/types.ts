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
