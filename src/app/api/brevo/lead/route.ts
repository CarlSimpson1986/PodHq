import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { brevoLeadSchema } from "@/lib/validation/brevo-lead";
import { addAppLeadToBrevo, removeAppLeadFromBrevo } from "@/lib/marketing/brevo";

// Internal server-to-server endpoint for podhq-client's lead nurture:
// "add" when a member who ticked marketing consent confirms their email,
// "remove" on their first real purchase. The gym's Brevo key stays in
// podHQ only (gym_brevo_config), same reasoning as /api/pdk/unlock.
// result "no_config" = that gym has no Brevo set up; not an error.
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = brevoLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }

  const input = parsed.data;
  const result =
    input.action === "add"
      ? await addAppLeadToBrevo(input.gym, { email: input.email, firstName: input.firstName, lastName: input.lastName })
      : await removeAppLeadFromBrevo(input.gym, input.email);

  if (result === "failed") {
    return NextResponse.json({ status: "error", message: "Brevo request failed." }, { status: 502 });
  }
  return NextResponse.json({ status: "ok", result });
}
