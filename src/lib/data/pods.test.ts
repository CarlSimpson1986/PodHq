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
// Mocks the Supabase admin client rather than hitting a real DB — this is
// a unit test of the ownership-check branch specifically, not an
// integration test of create_booking() itself.
const maybeSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
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
    maybeSingleMock.mockReset();
    rpcMock.mockReset();
  });

  it("refuses to book a member into a gym they don't belong to", async () => {
    // The looked-up member genuinely belongs to a different gym than the
    // one the caller is trying to book them into.
    maybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Basingstoke" }, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    // The whole point of the fix: create_booking() must never even be
    // called once the ownership check has already failed.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses to book a member id that doesn't exist at all", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 999, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "not_found" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("proceeds to book when the member genuinely belongs to that gym", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: 42, gym: "Aylesbury Berryfields" }, error: null });
    rpcMock.mockResolvedValue({ data: 123, error: null });

    const result = await createManualBooking("Aylesbury Berryfields", 42, "2026-08-20T09:00:00.000Z");

    expect(result).toEqual({ status: "ok", bookingId: 123 });
    expect(rpcMock).toHaveBeenCalledWith("create_booking", {
      p_member_id: 42,
      p_gym: "Aylesbury Berryfields",
      p_slot_start: "2026-08-20T09:00:00.000Z",
    });
  });
});
