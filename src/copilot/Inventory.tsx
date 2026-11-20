import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Box, Loader2, Package, RefreshCw } from "lucide-react";
import { get } from "./api";
import { btn } from "./styles";
import { EmptyState } from "./ui";

interface InventoryItem {
  inventory_item_id: number;
  location_id: number;
  product_title: string;
  variant_title: string;
  available: number;
  status: "out" | "low" | "ok";
  updated_at: string;
}

interface InventorySummary {
  total_tracked: number;
  out_of_stock: number;
  low_stock: number;
  healthy: number;
}

interface InventoryData {
  items: InventoryItem[];
  summary: InventorySummary;
}

const STATUS_STYLE: Record<string, string> = {
  out: "bg-red-100 text-red-800",
  low: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL: Record<string, string> = {
  out: "Out of stock",
  low: "Low stock",
  ok: "In stock",
};

export default function Inventory() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { status, data: result } = await get<InventoryData>("/api/copilot/panel/inventory/");
      if (status === 200) setData(result);
      else setError(result.error || result.message || "Could not load inventory.");
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60 seconds while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Loader2 aria-hidden className="mr-2 h-4 w-4 motion-safe:animate-spin" />
        Loading inventory…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertCircle aria-hidden className="mr-1.5 inline h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!data || data.summary.total_tracked === 0) {
    return (
      <EmptyState icon={<Package className="h-5 w-5" />} title="No inventory data">
        Stock levels appear here once Shopify starts sending inventory updates.
      </EmptyState>
    );
  }

  const { items, summary } = data;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-xs font-medium">
          {summary.out_of_stock > 0 && (
            <span className="flex items-center gap-1 text-red-700">
              <AlertCircle aria-hidden className="h-3.5 w-3.5" />
              {summary.out_of_stock} out
            </span>
          )}
          {summary.low_stock > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
              {summary.low_stock} low
            </span>
          )}
          <span className="text-slate-500">
            {summary.total_tracked} tracked
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh inventory"
          className={`${btn.ghost} h-7 w-7 p-0`}
        >
          <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} />
        </button>
      </div>

      {/* Item list */}
      <ul className="space-y-1.5" role="list">
        {items.map((item) => (
          <li
            key={`${item.inventory_item_id}-${item.location_id}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <Box aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {item.product_title}
              </p>
              {item.variant_title && item.variant_title !== item.product_title && (
                <p className="truncate text-xs text-slate-500">{item.variant_title}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {item.available}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {items.length < summary.total_tracked && (
        <p className="text-center text-xs text-slate-500">
          Showing {items.length} of {summary.total_tracked} items
        </p>
      )}
    </div>
  );
}
