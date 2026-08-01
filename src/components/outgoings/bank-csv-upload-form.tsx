"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { formatGBP, formatDate } from "@/lib/format";
import { OUTGOING_CATEGORIES, type GymName, type OutgoingCategory } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";
const inputClass =
  "w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none";

interface BankTransactionPreview {
  date: string;
  description: string;
  amountGbp: number;
}

interface CategorizedTransaction extends BankTransactionPreview {
  category: OutgoingCategory | "";
}

type AmountMapping =
  | {
      dateColumn: string;
      descriptionColumn: string;
      referenceColumn?: string;
      amountMode: "single";
      amountColumn: string;
      negativeIsOutgoing: boolean;
    }
  | { dateColumn: string; descriptionColumn: string; referenceColumn?: string; amountMode: "debitCredit"; debitColumn: string };

interface BankCsvUploadFormProps {
  gym: GymName;
  isAdmin: boolean;
  onSaved: () => void;
}

/**
 * Picks the first header matching any keyword (case-insensitive), skipping
 * anything matching `exclude` — e.g. "Balance (GBP)" contains neither
 * "debit" nor "credit" but does contain nothing excludable either, while a
 * literal "Amount" column shouldn't be confused with a running "Balance"
 * column. Falls back to null so the caller can pick a positional default.
 */
function guessColumn(headers: string[], keywords: string[], exclude: string[] = []): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw) && !exclude.some((ex) => h.includes(ex)));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

type Stage = "idle" | "mapping" | "review";

export function BankCsvUploadForm({ gym, isAdmin, onSaved }: BankCsvUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);

  const [dateColumn, setDateColumn] = useState("");
  const [descriptionColumn, setDescriptionColumn] = useState("");
  const [referenceColumn, setReferenceColumn] = useState(""); // "" = none
  const [amountMode, setAmountMode] = useState<"single" | "debitCredit">("single");
  const [amountColumn, setAmountColumn] = useState("");
  const [negativeIsOutgoing, setNegativeIsOutgoing] = useState(true);
  const [debitColumn, setDebitColumn] = useState("");

  const [transactions, setTransactions] = useState<CategorizedTransaction[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetAll() {
    setStage("idle");
    setFileName(null);
    setCsvText("");
    setHeaders([]);
    setDateColumn("");
    setDescriptionColumn("");
    setReferenceColumn("");
    setAmountMode("single");
    setAmountColumn("");
    setNegativeIsOutgoing(true);
    setDebitColumn("");
    setTransactions([]);
    setWarnings([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Shared by both the auto-detected path and the manual-mapping form.
   * `isAutoAttempt` controls what happens on an empty result: a manual
   * submission just shows "no transactions found" (the mapping is right
   * there to fix), but an auto-attempt that comes back empty most likely
   * means a wrong guess (commonly the sign convention) — silently showing
   * an empty review screen would leave a franchisee with zero explanation,
   * so that case falls back to the mapping screen instead.
   */
  async function runParse(mapping: AmountMapping, csv: string, isAutoAttempt: boolean) {
    setError(null);
    setParsing(true);
    try {
      const res = await fetch("/api/outgoings/parse-bank-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mapping, ...(isAdmin ? { gym } : {}) }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not read this file.");
        setStage("mapping");
        return;
      }
      if (isAutoAttempt && body.transactions.length === 0) {
        setError("Couldn't automatically match this file's columns — check the mapping below.");
        setStage("mapping");
        return;
      }
      setTransactions(body.transactions.map((t: BankTransactionPreview) => ({ ...t, category: "" as const })));
      setWarnings(body.warnings ?? []);
      setStage("review");
    } catch {
      setError("Something went wrong reading this file. Try again.");
      setStage("mapping");
    } finally {
      setParsing(false);
    }
  }

  async function handleFileChange(file: File | null) {
    setError(null);
    if (!file) return;

    const text = await readFileAsText(file);
    // Header row only, read client-side — just to populate the mapping
    // dropdowns and drive the auto-detect guess. The authoritative parse
    // (with whatever mapping is actually used) happens server-side.
    const firstRow = (Papa.parse<string[]>(text, { preview: 1 }).data[0] ?? []) as string[];
    if (firstRow.length === 0) {
      setError("Could not read any columns from this file.");
      return;
    }

    // Guess from the actual column names, not position — a real Starling
    // export ends in "Notes", so a last-column guess for Amount silently
    // picked that instead of the "Amount (GBP)" column sitting right there.
    const foundDate = guessColumn(firstRow, ["date"]);
    const foundDescription = guessColumn(firstRow, [
      "description",
      "narrative",
      "counter party",
      "counterparty",
      "payee",
      "details",
      "reference",
    ]);
    const foundDebit = guessColumn(firstRow, ["debit"]);
    const foundCredit = guessColumn(firstRow, ["credit"]);
    const foundAmount = guessColumn(firstRow, ["amount"], ["balance"]);
    // A separate "Reference" column, distinct from whatever won the
    // description slot above — banks often route card payments through a
    // processor (Counter Party "Stripe Payments UK Ltd"), leaving the real
    // merchant only in Reference ("GYMFLOW.IO"). Not required for
    // confidence — it's an enrichment, description alone still works fine
    // without it.
    const foundReferenceRaw = guessColumn(firstRow, ["reference"]);
    const foundReference = foundReferenceRaw && foundReferenceRaw !== foundDescription ? foundReferenceRaw : null;

    const guessedMode: "single" | "debitCredit" = foundDebit && foundCredit ? "debitCredit" : "single";
    // Only auto-skip the mapping screen when every required column was
    // actually matched by name — not a positional fallback. A franchisee
    // with a normally-labelled export never has to see column mapping at
    // all; anything unusual falls back to letting them confirm it.
    const confident = Boolean(foundDate && foundDescription && (guessedMode === "debitCredit" ? foundDebit : foundAmount));

    const finalDate = foundDate ?? firstRow[0];
    const finalDescription = foundDescription ?? firstRow[1] ?? firstRow[0];
    const finalAmount = foundAmount ?? firstRow[firstRow.length - 1];
    const finalDebit = foundDebit ?? finalAmount;

    setFileName(file.name);
    setCsvText(text);
    setHeaders(firstRow);
    setDateColumn(finalDate);
    setDescriptionColumn(finalDescription);
    setReferenceColumn(foundReference ?? "");
    setAmountMode(guessedMode);
    setAmountColumn(finalAmount);
    setNegativeIsOutgoing(true);
    setDebitColumn(finalDebit);

    if (confident) {
      const mapping: AmountMapping =
        guessedMode === "single"
          ? {
              dateColumn: finalDate,
              descriptionColumn: finalDescription,
              referenceColumn: foundReference ?? undefined,
              amountMode: "single",
              amountColumn: finalAmount,
              negativeIsOutgoing: true,
            }
          : {
              dateColumn: finalDate,
              descriptionColumn: finalDescription,
              referenceColumn: foundReference ?? undefined,
              amountMode: "debitCredit",
              debitColumn: finalDebit,
            };
      await runParse(mapping, text, true);
    } else {
      setStage("mapping");
    }
  }

  function handleParse() {
    const mapping: AmountMapping =
      amountMode === "single"
        ? {
            dateColumn,
            descriptionColumn,
            referenceColumn: referenceColumn || undefined,
            amountMode: "single",
            amountColumn,
            negativeIsOutgoing,
          }
        : {
            dateColumn,
            descriptionColumn,
            referenceColumn: referenceColumn || undefined,
            amountMode: "debitCredit",
            debitColumn,
          };
    runParse(mapping, csvText, false);
  }

  function updateCategory(index: number, category: OutgoingCategory | "") {
    setTransactions((prev) => prev.map((t, i) => (i === index ? { ...t, category } : t)));
  }

  const categorized = transactions.filter((t) => t.category !== "");
  const totalToImport = categorized.reduce((sum, t) => sum + t.amountGbp, 0);

  async function handleConfirm() {
    if (categorized.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/outgoings/upload-bank-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: categorized.map((t) => ({
            date: t.date,
            description: t.description,
            amountGbp: t.amountGbp,
            category: t.category,
          })),
          ...(isAdmin ? { gym } : {}),
        }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save these entries.");
        return;
      }
      resetAll();
      onSaved();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Upload bank statement — {gym}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload a CSV export from your bank. You&apos;ll match its columns, then assign a category to each
        transaction before anything is saved — nothing is imported automatically, and every bank&apos;s export
        looks different so this works with whatever columns yours provides.
      </p>

      {stage === "idle" && (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={parsing}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground disabled:opacity-50"
          />
          {parsing && <p className="mt-2 text-sm text-muted-foreground">Reading your statement...</p>}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      {stage === "mapping" && (
        <div className="mt-4 space-y-4">
          {fileName && (
            <p className="text-xs text-muted-foreground">
              {fileName} — {headers.length} columns found
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date column</label>
              <select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} className={inputClass}>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Description column</label>
              <select
                value={descriptionColumn}
                onChange={(e) => setDescriptionColumn(e.target.value)}
                className={inputClass}
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Reference column (optional)
            </label>
            <select
              value={referenceColumn}
              onChange={(e) => setReferenceColumn(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Card payments are often routed through a processor, so the description alone can be the processor
              rather than the actual merchant. If your bank has a separate reference/details column, it&apos;s
              appended to the description when different.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Amount format</p>
            <div className="flex flex-wrap gap-4 text-sm text-foreground">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={amountMode === "single"} onChange={() => setAmountMode("single")} />
                One amount column
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={amountMode === "debitCredit"}
                  onChange={() => setAmountMode("debitCredit")}
                />
                Separate debit column
              </label>
            </div>
          </div>

          {amountMode === "single" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Amount column</label>
                <select value={amountColumn} onChange={(e) => setAmountColumn(e.target.value)} className={inputClass}>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={negativeIsOutgoing}
                    onChange={(e) => setNegativeIsOutgoing(e.target.checked)}
                  />
                  Negative amounts are money out
                </label>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Debit / money-out column</label>
              <select value={debitColumn} onChange={(e) => setDebitColumn(e.target.value)} className={inputClass}>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={handleParse} disabled={parsing} className={buttonClass}>
              {parsing ? "Reading..." : "Preview transactions"}
            </button>
            <button type="button" onClick={resetAll} disabled={parsing} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "review" && (
        <div className="mt-4">
          {warnings.length > 0 && (
            <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usable transactions found with this column mapping.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Assign a category to each transaction you want to import. Rows left as &ldquo;Skip&rdquo; won&apos;t
                be saved.
              </p>
              <div className="mt-2 max-h-96 overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Date</th>
                      <th className="py-2 pr-3 font-normal">Description</th>
                      <th className="py-2 pr-3 text-right font-normal">Amount</th>
                      <th className="py-2 font-normal">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => (
                      <tr key={i} className="border-b border-card-border last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground">{formatDate(t.date)}</td>
                        <td className="py-2 pr-3 text-foreground">{t.description}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                          {formatGBP(t.amountGbp)}
                        </td>
                        <td className="py-2">
                          <select
                            value={t.category}
                            onChange={(e) => updateCategory(i, e.target.value as OutgoingCategory | "")}
                            className="rounded-md border border-card-border bg-background px-2 py-1 text-xs text-foreground"
                          >
                            <option value="">Skip</option>
                            {OUTGOING_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || categorized.length === 0}
              className={buttonClass}
            >
              {saving
                ? "Saving..."
                : `Confirm & save ${categorized.length} transaction${categorized.length === 1 ? "" : "s"} (${formatGBP(totalToImport)})`}
            </button>
            <button type="button" onClick={resetAll} disabled={saving} className={secondaryButtonClass}>
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
