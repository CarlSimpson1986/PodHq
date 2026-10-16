import { describe, it, expect, vi, afterEach } from "vitest";
import { addToAccessGroup } from "@/lib/pdk";

// Regression test for 2026-10-16: PDK answers a re-add of a holder already
// in the group with 400 "Group already contains holder." rather than a
// no-op 2xx. Treating that as a failure broke every Hove unlock after a
// member's first tap (second door, retries). Mocks fetch — the group
// lookup first, then the PUT.
function mockPdk(putStatus: number, putBody: string) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "group-1", name: "Booking Access" }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(putBody, { status: putStatus }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("addToAccessGroup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("succeeds when the holder is added", async () => {
    mockPdk(200, "");
    await expect(addToAccessGroup("sys", "token", "holder")).resolves.toBeUndefined();
  });

  it("treats 'Group already contains holder' as success", async () => {
    mockPdk(400, JSON.stringify({ message: "Group already contains holder." }));
    await expect(addToAccessGroup("sys", "token", "holder")).resolves.toBeUndefined();
  });

  it("still throws on any other 400", async () => {
    mockPdk(400, JSON.stringify({ message: "Holder not found." }));
    await expect(addToAccessGroup("sys", "token", "holder")).rejects.toThrow("PDK add-to-group failed: 400");
  });

  it("still throws on a server error", async () => {
    mockPdk(500, "boom");
    await expect(addToAccessGroup("sys", "token", "holder")).rejects.toThrow("PDK add-to-group failed: 500");
  });
});
