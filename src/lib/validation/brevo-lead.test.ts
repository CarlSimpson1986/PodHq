import { describe, expect, it } from "vitest";
import { brevoLeadSchema } from "./brevo-lead";

describe("brevoLeadSchema", () => {
  it("accepts an add with names and normalises the email", () => {
    const parsed = brevoLeadSchema.parse({ action: "add", gym: "Hove", email: " A@B.com ", firstName: "Sam", lastName: "" });
    expect(parsed.email).toBe("a@b.com");
  });

  it("accepts a remove with just gym and email", () => {
    expect(brevoLeadSchema.safeParse({ action: "remove", gym: "Hove", email: "a@b.com" }).success).toBe(true);
  });

  it("rejects an unknown gym", () => {
    expect(brevoLeadSchema.safeParse({ action: "remove", gym: "Brighton", email: "a@b.com" }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(brevoLeadSchema.safeParse({ action: "remove", gym: "Hove", email: "a@b.com", listId: 5 }).success).toBe(false);
  });
});
