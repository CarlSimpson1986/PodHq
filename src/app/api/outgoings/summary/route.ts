import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPnlSummary, getOutgoingsHistory, getOutgoingTransactions, getOutgoingsMonthlyHistory } from "@/lib/data/outgoings";
import { getOtherIncomeHistory, getOtherIncomeMonthlyHistory } from "@/lib/data/other-income";
import { getDefaultReportMonth } from "@/lib/data/dashboard";
import { pnlSummaryQuerySchema } from "@/lib/validation/outgoings";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/outgoings/summary");
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

    const { searchParams } = request.nextUrl;
    const parsed = pnlSummaryQuerySchema.safeParse({
      month: searchParams.get("month") ?? undefined,
      gym: searchParams.get("gym") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    // Security: an owner only ever sees their own gym, regardless of what a
    // client sends — only an admin's gym selection is actually honoured.
    const gymFilter = scope.role === "owner" ? null : (parsed.data.gym ?? null);

    const defaultMonth = getDefaultReportMonth();
    const requestedMonth = parsed.data.month ?? defaultMonth;
    const month = requestedMonth > defaultMonth ? defaultMonth : requestedMonth;

    const summary = await getPnlSummary(scope, gymFilter, month);

    // History/entry-form/transaction-log/chart only make sense for a single
    // gym in view.
    const historyGym = scope.role === "owner" ? scope.gym : gymFilter;
    const [history, transactions, monthlyHistory, otherIncomeHistory, otherIncomeMonthlyHistory] = historyGym
      ? await Promise.all([
          getOutgoingsHistory(historyGym),
          getOutgoingTransactions(historyGym),
          getOutgoingsMonthlyHistory(historyGym),
          getOtherIncomeHistory(historyGym),
          getOtherIncomeMonthlyHistory(historyGym),
        ])
      : [null, null, null, null, null];

    return NextResponse.json({
      status: "ok",
      role: scope.role,
      gym: historyGym,
      summary,
      history,
      transactions,
      monthlyHistory,
      otherIncomeHistory,
      otherIncomeMonthlyHistory,
    });
  } catch (err) {
    console.error("[api/outgoings/summary]", { userId: user.id, error: err instanceof Error ? err.message : err });
    return NextResponse.json(
      { status: "error", message: "Something went wrong loading P&L data. Try again." },
      { status: 500 }
    );
  }
}
