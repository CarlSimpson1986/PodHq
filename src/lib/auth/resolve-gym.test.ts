import { describe, it, expect } from "vitest";
import { resolveGym } from "./resolve-gym";

// This exact logic used to be duplicated byte-for-byte across 12 route
// files (found during a 2026-08-16 review, zero tests protecting any of
// them) — it's the mechanism that stops an owner's manipulated `gym`
// query param/body field from ever reaching another gym's data. One
// tested copy now, not twelve untested ones.
describe("resolveGym", () => {
  it("always locks an owner to their own gym, ignoring any client-supplied param", () => {
    const scope = { role: "owner" as const, gym: "Aylesbury Berryfields" as const };

    expect(resolveGym(scope, undefined)).toBe("Aylesbury Berryfields");
    expect(resolveGym(scope, null)).toBe("Aylesbury Berryfields");
    // The actual security property: a manipulated param naming a
    // *different* real gym must still resolve to the owner's own gym,
    // not the spoofed one.
    expect(resolveGym(scope, "Basingstoke")).toBe("Aylesbury Berryfields");
  });

  it("lets an admin use a valid gym param", () => {
    const scope = { role: "admin" as const, gym: null };
    expect(resolveGym(scope, "Milton Keynes")).toBe("Milton Keynes");
  });

  it("returns null for an admin with no gym selected yet", () => {
    const scope = { role: "admin" as const, gym: null };
    expect(resolveGym(scope, undefined)).toBeNull();
    expect(resolveGym(scope, null)).toBeNull();
  });

  it("returns null for an admin with an invalid/unknown gym string", () => {
    const scope = { role: "admin" as const, gym: null };
    expect(resolveGym(scope, "Not A Real Gym")).toBeNull();
    expect(resolveGym(scope, "")).toBeNull();
  });
});
