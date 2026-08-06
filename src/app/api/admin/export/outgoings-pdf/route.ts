import { createElement, type ReactElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getPnlFiguresForRange, getOutgoingTransactionsForRange } from "@/lib/data/outgoings";
import { resolveDateRange } from "@/lib/data/revenue";
import { pnlExportQuerySchema } from "@/lib/validation/outgoings";
import { checkRateLimit } from "@/lib/rate-limit";
import { PnlExportDocument } from "@/lib/pdf/pnl-export-document";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, "/api/admin/export/outgoings-pdf");
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: "error", message: "Too many requests." }, { status: 429 });
  }

  try {
    const scope = await getGymScope(user.id);
    if (!scope || scope.role !== "admin") {
      return NextResponse.json({ status: "error", message: "Admins only." }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const parsed = pnlExportQuerySchema.safeParse({
      preset: searchParams.get("preset") ?? undefined,
      year: searchParams.get("year") ?? undefined,
      gym: searchParams.get("gym") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
    }

    const { range, label } = resolveDateRange(parsed.data.preset, parsed.data.year);
    const [figures, transactions] = await Promise.all([
      getPnlFiguresForRange(parsed.data.gym, range),
      getOutgoingTransactionsForRange(parsed.data.gym, range),
    ]);

    const generatedAt = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const document = createElement(PnlExportDocument, {
      gym: parsed.data.gym,
      range,
      rangeLabel: label,
      figures,
      transactions,
      generatedAt,
    }) as unknown as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(document);

    const gymSlug = parsed.data.gym.replace(/\s+/g, "-");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="PodHQ-PnL-${gymSlug}-${range.start}-to-${range.end}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[api/admin/export/outgoings-pdf]", {
      userId: user.id,
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json({ status: "error", message: "Could not generate this PDF. Try again." }, { status: 500 });
  }
}
