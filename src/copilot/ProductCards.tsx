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
        if (!stopped) setShown((prev) => (prev.v === next.v ? prev : { v: next.v, products: next.products }));
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
  active: "bg-emerald-50 text-emerald-800",
  draft: "bg-slate-100 text-slate-700",
  archived: "bg-amber-50 text-amber-900",
};

function stockText(stock: number | null): string {
  if (stock === null) return "Stock not tracked";
  return stock <= 0 ? "Out of stock" : `${stock} in stock`;
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
  if (!products.length) return null;
  return (
    <section aria-label="Products in the last answer">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {products.map((p) => (
          <li
            key={p.id}
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-brand-100 bg-white text-xs shadow-sm"
          >
            {p.image ? (
              <img src={p.image} alt={p.image_alt} loading="lazy" className="h-28 w-full object-cover" />
            ) : (
              <div className="flex h-28 items-center justify-center bg-brand-50 text-brand-700">
                <Package aria-hidden className="h-8 w-8" />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1 p-2">
              {p.badge && (
                <span className="self-start rounded bg-brand-700 px-1.5 py-0.5 font-medium text-white">
                  {p.badge}
                </span>
              )}
              <p className="line-clamp-2 font-medium text-slate-900">{p.title}</p>
              {p.price && <p className="text-slate-800">{p.price}</p>}
              <p className={p.stock !== null && p.stock <= 0 ? "text-red-700" : "text-slate-600"}>
                {stockText(p.stock)}
              </p>
              {p.status && (
                <span className={`self-start rounded px-1.5 py-0.5 capitalize ${STATUS[p.status] || STATUS.draft}`}>
                  {p.status}
                </span>
              )}
              <a
                href={linkTarget === "_top" ? `shopify://admin/products/${p.id.split("/").pop()}` : p.url}
                target={linkTarget}
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-1 font-medium text-brand-700 hover:text-brand-900 hover:underline"
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
