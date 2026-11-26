import { ChangeEvent, useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { upload } from "./api";
import { btn } from "./styles";

const TEMPLATE = "/snowie-products-template.csv";

/**
 * Upload an Excel (.xlsx) or CSV file of products. Snowie reads it and prepares one change
 * (new products, and new prices and stock for ones already in the store), which then waits
 * below in the Changes list for approval like any other change.
 */
export default function ImportProducts({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be chosen again after fixing it
    if (!file) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { status, data } = await upload<{ proposal?: { summary?: string }; skipped?: number }>(
        "/api/copilot/panel/import/",
        form,
      );
      if (status === 200) {
        setNote(
          `${data.proposal?.summary ?? "Ready"}. Review it below and approve.` +
            (data.skipped ? ` ${data.skipped} row(s) were skipped; the change lists why.` : ""),
        );
        onDone();
      } else {
        setError(data.detail || data.message || "That file couldn't be imported.");
      }
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <FileSpreadsheet className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Import products from Excel</p>
            <p className="text-slate-600">New products go live on your store after you approve.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn.primary}>
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Upload aria-hidden className="h-4 w-4" />}
            {busy ? "Reading file…" : "Upload file"}
          </button>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={btn.ghost}>
            Columns
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => void choose(e)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {open && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-slate-700 ring-1 ring-inset ring-slate-200">
          <p>
            One row per product, or one row per size/colour (rows with the same title become one product). Needed:{" "}
            <b>Title</b> and <b>Price</b>. Optional: Description, Size, Color, MRP (shown as the old price), SKU, Stock, Image URL
            (https links, several separated by commas), Brand, Category, Tags.
          </p>
          <p>
            A product already in your store (same SKU or same name) gets its price and stock updated; nothing on it is deleted.
            Shopify's own product export file works too.
          </p>
          <a href={TEMPLATE} download className={btn.link}>
            <Download aria-hidden className="h-4 w-4" /> Download the template
          </a>
        </div>
      )}

      {note && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-inset ring-emerald-200">{note}</p>}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
