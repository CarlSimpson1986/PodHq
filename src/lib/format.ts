const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-GB");

export function formatGBP(amount: number): string {
  return gbpFormatter.format(amount);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "3 months ago" style label for an at-risk member's staleness — always in
 *  months since the minimum at-risk threshold is 90 days, so a day-level
 *  label would be spurious precision. */
export function formatDaysAgo(days: number): string {
  const months = Math.round(days / 30);
  if (months <= 1) return "about a month ago";
  return `${months} months ago`;
}

export function customerProfileHref(gym: string, name: string): string {
  return `/members/customer/${encodeURIComponent(gym)}/${encodeURIComponent(name)}`;
}

export function formatMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
