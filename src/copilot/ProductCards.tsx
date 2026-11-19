import { useEffect, useRef, useState } from "react";
import { ExternalLink, Package } from "lucide-react";
import { SNOWIE_API_ORIGIN } from "../config";

/** A product the copilot's last answer was about (display fields only). */
export interface ProductCard {
  id: string;
  title: string;
  status: string;
  stock: number | null;
  price: string | null;
  image: string | null;
  image_alt: string;
  url: string;
  /** Set when the card shows a change just applied, e.g. "10% off · until 23 Nov". */
  badge?: string;
  /** The price customers pay now, under a discount just applied. */
  sale_price?: string | null;
}

const POLL_MS = 10000;
/** After the agent speaks, the tool it used has just answered. */
const NUDGE_MS = 800;

const NONE = { v: "", products: [] as ProductCard[] };

/**
 * Cards for the open call, fetched with its release token (the backend resolves the room
 * from it). Polls while the call is open and the page is visible, and soon after each new
 * agent line (`nudge`). A new call starts with no cards; a failed fetch keeps what is shown.
 */
export function useProductCards(call: string | null, nudge: number): ProductCard[] {
  const [shown, setShown] = useState(NONE);
  const load = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!call) return; // an ended call's cards stay until the next call starts
    setShown(NONE);
    let stopped = false;
    load.current = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`${SNOWIE_API_ORIGIN}/api/copilot/panel/display/`, {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call }),
        });
        if (!response.ok || stopped) return;
        const data = await response.json();
        const next = typeof data?.v === "string" && Array.isArray(data.products) ? data : NONE;
        // Same answer, but its cards may have been read again (stock settles a moment after
        // a change): replace them only when something in them changed.
        if (!stopped)
          setShown((prev) =>
            prev.v === next.v && JSON.stringify(prev.products) === JSON.stringify(next.products)
              ? prev
              : { v: next.v, products: next.products },
          );
      } catch {
        // no cards this time
      }
    };
    load.current();
    const timer = window.setInterval(() => load.current(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      load.current = () => undefined;
    };
  }, [call]);

  useEffect(() => {
    if (!nudge) return;
    const timer = window.setTimeout(() => load.current(), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [nudge]);

  return shown.products;
}

const STATUS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  draft: "bg-white text-slate-700 ring-1 ring-inset ring-slate-200",
  archived: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200",
};

/** How long a card whose data just changed stays highlighted. */
const HIGHLIGHT_MS = 6000;

const signature = (p: ProductCard) => JSON.stringify([p.title, p.status, p.stock, p.price, p.sale_price, p.image, p.badge]);

/**
 * Ids of cards whose data changed since the last list (a new `v` after a change was
 * applied), or that newly carry a badge; each stays in the set for `HIGHLIGHT_MS`.
 */
function useUpdated(products: ProductCard[]): Set<string> {
  const before = useRef<Map<string, string>>(new Map());
  const [updated, setUpdated] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = before.current;
    const changed = products
      .filter((p) => {
        const was = prev.get(p.id);
        return was ? was !== signature(p) : Boolean(p.badge);
      })
      .map((p) => p.id);
    before.current = new Map(products.map((p) => [p.id, signature(p)]));
    if (!changed.length) return;
    setUpdated((u) => new Set([...u, ...changed]));
    // Not cleared by a newer list: each highlight ends on its own time.
    window.setTimeout(
      () => setUpdated((u) => new Set([...u].filter((id) => !changed.includes(id)))),
      HIGHLIGHT_MS,
    );
  }, [products]);

  return updated;
}

/** At or under this many left, stock shows as low. */
const LOW_STOCK = 5;

function stockText(stock: number | null): string {
  if (stock === null) return "Stock not tracked";
  return stock <= 0 ? "Out of stock" : `${stock} in stock`;
}

function stockTone(stock: number | null): string {
  if (stock === null) return "bg-slate-50 text-slate-700 ring-slate-200";
  if (stock <= 0) return "bg-red-50 text-red-700 ring-red-200";
  if (stock <= LOW_STOCK) return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-emerald-50 text-emerald-800 ring-emerald-200";
}

/**
 * `linkTarget`: `_top` inside Shopify admin, where App Bridge opens `shopify://admin/...`
 * links in the admin; `_blank` on the voice page (a new tab on the admin URL).
 */
export default function ProductCards({
  products,
  linkTarget,
}: {
  products: ProductCard[];
  linkTarget: "_top" | "_blank";
}) {
  const updated = useUpdated(products);
  if (!products.length) return null;
  const announced = products.filter((p) => updated.has(p.id));
  return (
    <section aria-label="Products in the last answer">
      <p role="status" className="sr-only">
        {announced.map((p) => `Updated: ${p.title}${p.badge ? `, ${p.badge}` : ""}.`).join(" ")}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {products.map((p) => (
          <li
            key={p.id}
            className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-xs shadow-sm transition-shadow duration-500 hover:shadow-md ${
              updated.has(p.id) ? "border-brand-600 ring-4 ring-brand-200" : "border-slate-200"
            }`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
              {p.image ? (
                <img src={p.image} alt={p.image_alt} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                  <Package aria-hidden className="h-8 w-8" />
                </div>
              )}
              {p.status && (
                <span
                  className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize shadow-sm ${STATUS[p.status] || STATUS.draft}`}
                >
                  {p.status}
                </span>
              )}
            </div>
            {p.badge && (
              <p className="bg-brand-700 px-2.5 py-1 text-xs font-semibold leading-snug text-white">{p.badge}</p>
            )}
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900">{p.title}</p>
              {p.price &&
                (p.sale_price && p.sale_price !== p.price ? (
                  <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-sm font-semibold text-brand-800">{p.sale_price}</span>
                    <s className="text-slate-500">
                      <span className="sr-only">was </span>
                      {p.price}
                    </s>
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-slate-900">{p.price}</p>
                ))}
              <span className={`self-start rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${stockTone(p.stock)}`}>
                {stockText(p.stock)}
              </span>
              <a
                href={linkTarget === "_top" ? `shopify://admin/products/${p.id.split("/").pop()}` : p.url}
                target={linkTarget}
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-1.5 font-medium text-brand-700 hover:text-brand-900 hover:underline"
              >
                Open in Shopify
                <ExternalLink aria-hidden className="h-3 w-3" />
                <span className="sr-only">: {p.title}</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
