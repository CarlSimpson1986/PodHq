import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { confirmBankCsvSchema } from "@/lib/validation/outgoings";
import { insertOutgoingsBatch, insertOutgoingTransactions } from "@/lib/data/outgoings";
import { checkRateLimit } from "@/lib/rate-limit";
import type { OutgoingCategory } from "@/lib/data/types";

export async function POST(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/outgoings/upload-bank-csv");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope) {
      return NextResponse.json(
        { status: "error", message: "No gym or role is assigned to this account." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = confirmBankCsvSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
    }

    let gym;
    if (scope.role === "owner") {
      gym = scope.gym;
    } else {
      if (!parsed.data.gym) {
        return NextResponse.json({ status: "error", message: "A gym must be selected." }, { status: 400 });
      }
      gym = parsed.data.gym;
    }

    // Collapse individual transactions into one row per category+month —
    // gym_outgoings is a monthly-total table, not a transaction ledger (see
    // insertOutgoingsBatch).
    const totals = new Map<string, number>(); // key: `${category}|${month}`
    for (const t of parsed.data.transactions) {
      const month = t.date.slice(0, 7);
      const key = `${t.category}|${month}`;
      totals.set(key, (totals.get(key) ?? 0) + t.amountGbp);
    }
    const entries = [...totals.entries()].map(([key, amountGbp]) => {
      const [category, effectiveFrom] = key.split("|");
      return {
        category: category as OutgoingCategory,
        amountGbp: Math.round(amountGbp * 100) / 100,
        effectiveFrom,
      };
    });

    // Two writes: the aggregated monthly total (drives the P&L figures) and
    // the raw per-transaction detail (drill-down/audit only — see
    // insertOutgoingTransactions). Aggregate first since it's the one that
    // actually matters for the P&L; if the detail log fails the money
    // figures are still safely recorded rather than losing the whole import.
    const count = await insertOutgoingsBatch(gym, entries, user.id);
    await insertOutgoingTransactions(gym, parsed.data.transactions, user.id);

    return NextResponse.json({ status: "ok", count });
  } catch (err) {
    console.error("[api/outgoings/upload-bank-csv]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong saving this data. Try again." },
      { status: 500 }
    );
  }
}
