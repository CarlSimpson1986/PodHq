"use client";

import { useRef, useState } from "react";
import { formatGBP, formatDate } from "@/lib/format";
import type { GymName } from "@/lib/data/types";

const buttonClass =
  "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-card-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50";

interface PreviewWeek {
  weekStarting: string;
  spendGbp: number;
  clicks: number;
  leads: number;
}

interface AdSpendUploadFormProps {
  gym: GymName;
  isAdmin: boolean;
  onSaved: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function AdSpendUploadForm({ gym, isAdmin, onSaved }: AdSpendUploadFormProps) {
  const metaInputRef = useRef<HTMLInputElement>(null);
  const leadsInputRef = useRef<HTMLInputElement>(null);
  const [metaFileName, setMetaFileName] = useState<string | null>(null);
  const [leadsFileName, setLeadsFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewWeek[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetFiles() {
    setMetaFileName(null);
    setLeadsFileName(null);
    if (metaInputRef.current) metaInputRef.current.value = "";
    if (leadsInputRef.current) leadsInputRef.current.value = "";
  }

  async function handleParse() {
    setError(null);
    const metaFile = metaInputRef.current?.files?.[0] ?? null;
    const leadsFile = leadsInputRef.current?.files?.[0] ?? null;

    if (!metaFile && !leadsFile) {
      setError("Choose at least one CSV file.");
      return;
    }

    setParsing(true);
    try {
      const [metaCsv, leadsCsv] = await Promise.all([
        metaFile ? readFileAsText(metaFile) : Promise.resolve(undefined),
        leadsFile ? readFileAsText(leadsFile) : Promise.resolve(undefined),
      ]);

      const res = await fetch("/api/marketing/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaCsv, leadsCsv, ...(isAdmin ? { gym } : {}) }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not read these files.");
        setPreview(null);
        return;
      }
      setPreview(body.weeks);
      setWarnings(body.warnings ?? []);
    } catch {
      setError("Something went wrong reading these files. Try again.");
      setPreview(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!preview || preview.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks: preview, ...(isAdmin ? { gym } : {}) }),
      });
      const body = await res.json();
      if (body.status !== "ok") {
        setError(body.message ?? "Could not save this data.");
        return;
      }
      setPreview(null);
      setWarnings([]);
      resetFiles();
      onSaved();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelPreview() {
    setPreview(null);
    setWarnings([]);
  }

  return (
    <div className="card-glass p-5">
      <p className="text-sm font-semibold text-foreground">Upload ad spend &amp; leads — {gym}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Meta Ads weekly &ldquo;Ad sets&rdquo; export and/or the GymFlow leads export. Either file can be uploaded on
        its own, and a file can contain several weeks at once — useful if a week or two got missed. Re-uploading a
        week overwrites that week&apos;s figures rather than duplicating them.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="meta-csv" className="mb-1 block text-xs text-muted-foreground">
            Meta Ads export (.csv)
          </label>
          <input
            id="meta-csv"
            ref={metaInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setMetaFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
          {metaFileName && <p className="mt-1 text-xs text-muted-foreground">{metaFileName}</p>}
        </div>
        <div>
          <label htmlFor="leads-csv" className="mb-1 block text-xs text-muted-foreground">
            GymFlow leads export (.csv)
          </label>
          <input
            id="leads-csv"
            ref={leadsInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setLeadsFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
          {leadsFileName && <p className="mt-1 text-xs text-muted-foreground">{leadsFileName}</p>}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {!preview && (
        <button type="button" onClick={handleParse} disabled={parsing} className={`${buttonClass} mt-4`}>
          {parsing ? "Reading..." : "Preview"}
        </button>
      )}

      {preview && (
        <div className="mt-4">
          {warnings.length > 0 && (
            <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usable rows found in the file(s) provided.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-card-border bg-card text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Week starting</th>
                    <th className="py-2 pr-3 text-right font-normal">Spend</th>
                    <th className="py-2 pr-3 text-right font-normal">Clicks</th>
                    <th className="py-2 text-right font-normal">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.weekStarting} className="border-b border-card-border last:border-0">
                      <td className="py-2 pr-3 text-foreground">{formatDate(row.weekStarting)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatGBP(row.spendGbp)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.clicks}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{row.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || preview.length === 0}
              className={buttonClass}
            >
              {saving ? "Saving..." : `Confirm & save ${preview.length} week${preview.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={handleCancelPreview} disabled={saving} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
