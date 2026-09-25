// Shared by the server data layer and the client view — kept out of
// door-traffic.ts, which is server-only.
export const DOOR_TRAFFIC_PRESETS = ["last_30_days", "last_90_days", "last_12_months", "all_time"] as const;
export type DoorTrafficPreset = (typeof DOOR_TRAFFIC_PRESETS)[number];

export const DOOR_TRAFFIC_PRESET_LABELS: Record<DoorTrafficPreset, string> = {
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  last_12_months: "Last 12 months",
  all_time: "All time",
};
