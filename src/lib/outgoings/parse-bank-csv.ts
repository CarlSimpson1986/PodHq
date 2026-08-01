import Papa from "papaparse";

export interface ColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountMode: "single" | "debitCredit";
  /** Required when amountMode === "single". */
  amountColumn?: string;
  /** Required when amountMode === "single" — which sign represents money out. */
  negativeIsOutgoing?: boolean;
  /** Required when amountMode === "debitCredit". */
  debitColumn?: string;
  /**
   * Optional. Many banks route card payments through a processor, so the
   * "who paid" column is often the processor, not the actual merchant —
   * e.g. Counter Party "Stripe Payments UK Ltd" / Reference "GYMFLOW.IO",
   * or Counter Party "Donate" / Reference "WWW.SAVEAWARRIORUK.ORG". When
   * present and different from the description, it's appended rather than
   * replacing it, since either field alone can be the more useful one
   * depending on the transaction.
   */
  referenceColumn?: string;
}

export interface BankTransactionDraft {
  date: string; // yyyy-MM-dd
  description: string;
  amountGbp: number; // always positive — money out
}

interface ParseResult {
  transactions: BankTransactionDraft[];
  warnings: string[];
}

/**
 * Same ISO/UK-DD-MM-YYYY tolerance as the Meta/GymFlow parsers in
 * lib/marketing/parse.ts — bank exports have shown both.
 */
function parseFlexibleDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const uk = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (uk) {
    const [, d, m, y] = uk;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  return null;
}

/**
 * Bank exports vary wildly in amount formatting — "£1,234.56", "-1234.56",
 * "(1,234.56)" for negative, plain "1234.56". Returns null (not 0) for
 * anything unparseable so the caller can tell "no value" from "zero".
 */
function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[£,\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const num = Number(s);
  if (Number.isNaN(num)) return null;
  return negative ? -num : num;
}

/**
 * No DB write here — this only turns raw CSV text + a caller-supplied
 * column mapping into a typed preview. The mapping is decided by the
 * uploader in the browser (dropdowns populated from the CSV's own header
 * row) since different banks use entirely different column layouts; this
 * function just applies whatever mapping it's given.
 */
export function parseBankCsv(csvText: string, mapping: ColumnMapping): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const transactions: BankTransactionDraft[] = [];
  const warnings: string[] = [];

  for (const row of parsed.data) {
    const date = parseFlexibleDate(row[mapping.dateColumn]);
    if (!date) {
      warnings.push(`Skipped a row with an unreadable date ("${row[mapping.dateColumn] ?? ""}").`);
      continue;
    }

    const baseDescription = (row[mapping.descriptionColumn] ?? "").trim();
    const reference = mapping.referenceColumn ? (row[mapping.referenceColumn] ?? "").trim() : "";
    const description =
      reference && reference.toLowerCase() !== baseDescription.toLowerCase()
        ? `${baseDescription} — ${reference}`
        : baseDescription;

    let amountGbp: number;
    if (mapping.amountMode === "debitCredit") {
      // A blank cell here is the normal case for a credit row in a
      // debit/credit-split export — not a warning-worthy skip.
      const amount = parseAmount(row[mapping.debitColumn!]);
      if (amount === null || amount === 0) continue;
      amountGbp = Math.abs(amount);
    } else {
      const amount = parseAmount(row[mapping.amountColumn!]);
      if (amount === null) {
        warnings.push(`Skipped a row with an unreadable amount ("${row[mapping.amountColumn!] ?? ""}").`);
        continue;
      }
      if (amount === 0) continue;
      const isOutgoing = mapping.negativeIsOutgoing ? amount < 0 : amount > 0;
      if (!isOutgoing) continue; // money coming in — not relevant here, not a warning
      amountGbp = Math.abs(amount);
    }

    transactions.push({ date: date.toISOString().slice(0, 10), description, amountGbp });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  return { transactions, warnings };
}
