import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the Critical finding from the 2026-08-16 OWASP audit:
// createManualBooking took a client-supplied memberId and passed it
// straight into create_booking() with no check that the member actually
// belongs to the gym being booked for — an owner (or a compromised admin
// session) could book, and therefore spend a credit against, a member who
// belongs to a completely different gym. Every sibling function
// (grantCreditToMember, cancelBookingAsStaff) already did this ownership
// check; this one didn't, until it was fixed the same session.
//
// Extended 2026-08-17 (multiple bookable resources per gym): the same
// ownership check now also applies to resourceId — a resource from a
// different gym than the caller's selected gym must be rejected too,
// since create_booking() itself derives gym from the resource and has no
// way to know the caller's intended gym was different.
//
// Mocks the Supabase admin client rather than hitting a real DB — this is
// a unit test of the ownership-check branch specifically, not an
// integration test of create_booking() itself.
const memberMaybeSingleMock = vi.fn();
const resourceMaybeSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: table === "members" ? memberMaybeSingleMock : resourceMaybeSingleMock,
        }),
      }),
    }),
    rpc: rpcMock,
  }),
}));

vi.mock("@/lib/audit", () => ({ logAuthEvent: vi.fn() }));

import { createManualBooking } from "./pods";

describe("createManualBooking", () => {
  beforeEach(() => {
    memberMaybeSingleMock.mockReset();
    resourceMaybeSingleMock.mockReset();
    rpcMock.mockReset();
    // Default: a resource that genuinely belongs to the gym under test —
    // individual tests override this when the resource itself is the
    // thing under test.
    resourceMaybeSingleMock.mockResolvedValue({ data: { id: 7, gym: "Aylesbury Berryfields" }, error: null });
  });

  it("refuses to book a member into a gym they don't belong to", async () => {
    // The looked-up member genuinely belongs to a different gym than the
    // one the caller is trying to book them into.
    memberMaybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Basingstoke" }, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 7, 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    // The whole point of the fix: create_booking() must never even be
    // called once the ownership check has already failed.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses to book a member id that doesn't exist at all", async () => {
    memberMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 7, 999, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses to book against a resource that belongs to a different gym", async () => {
    memberMaybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Aylesbury Berryfields" }, error: null });
    resourceMaybeSingleMock.mockResolvedValue({ data: { id: 7, gym: "Basingstoke" }, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 7, 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses to book against a resource id that doesn't exist at all", async () => {
    memberMaybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Aylesbury Berryfields" }, error: null });
    resourceMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 999, 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("proceeds to book when both the member and resource genuinely belong to that gym", async () => {
    memberMaybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Aylesbury Berryfields" }, error: null });
    resourceMaybeSingleMock.mockResolvedValue({ data: { id: 7, gym: "Aylesbury Berryfields" }, error: null });
    rpcMock.mockResolvedValue({ data: 123, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 7, 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "ok", bookingId: 123 });
    expect(rpcMock).toHaveBeenCalledWith("create_booking", {
      p_member_id: 42,
      p_resource_id: 7,
      p_slot_start: "2026-08-20T09:00:00.000Z",
    });
  });
});
