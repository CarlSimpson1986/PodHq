import { NextResponse, type NextRequest } from "next/server";
import { generateMissingDigests } from "@/lib/assist/digest";

// Vercel Cron invokes this with a GET request and an Authorization header
// set to `Bearer ${CRON_SECRET}` (the env var it reads automatically) —
// this is Vercel's own documented way to keep a cron-only route from
// being a public, unauthenticated URL anyone could hit to spend LLM
// tokens or spam writes. No session/role check here on purpose: this path
// never represents a real user, only the scheduled job itself.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  try {
    const results = await generateMissingDigests();
    return NextResponse.json({ status: "ok", results });
  } catch (err) {
    console.error("[api/assist/digest]", { error: err instanceof Error ? err.message : err });
    return NextResponse.json({ status: "error", message: "Digest generation failed." }, { status: 500 });
  }
}
