import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { get, post } from "./api";

const IN_FLIGHT = ["approved", "applying", "undoing"];
const STATUS: Record<string, string> = {
  pending: "Waiting for approval",
  approved: "Queued",
  applying: "Applying…",
  applied: "Applied",
  partially_applied: "Partly applied",
  failed: "Not applied",
  rejected: "Rejected",
  expired: "Expired",
  undoing: "Undoing…",
  undone: "Undone",
  undo_partial: "Partly undone",
};
/** Changes that did not (fully) go through: why, in a box right under the title. */
const REASON: Record<string, { title: string; box: string }> = {
  failed: { title: "Why it was not applied", box: "border-red-200 bg-red-50 text-red-900" },
  partially_applied: { title: "Why it was only partly applied", box: "border-amber-300 bg-amber-50 text-amber-900" },
  expired: { title: "Why it expired", box: "border-amber-300 bg-amber-50 text-amber-900" },
  undo_partial: { title: "Why it was only partly undone", box: "border-amber-300 bg-amber-50 text-amber-900" },
};
/** How a proposal was approved, when not by a tap here. */
const VIA: Record<string, string> = { voice: "Approved by a yes to the copilot", auto: "Applied by auto mode" };

interface Row {
  target: string;
  detail: string;
  field: string;
  before: string;
  after: string;
  margin_after?: string | null;
  /** The whole value when `before`/`after` is cut short (website text): what is written. */
  before_full?: string;
  after_full?: string;
}

interface Item {
  idx: number;
  target: string;
  status: string;
  verified: boolean | null;
  error: string | null;
}

interface Proposal {
  id: string;
  kind: string;
  version: number;
  status: string;
  summary: string;
  changes: Row[];
  warnings: string[];
  expires_at: string;
  error: string | null;
  items: Item[];
  progress: { applied: number; total: number };
  undoable: boolean;
  approved_via: string | null;
  /** Discount codes Shopify created (cart recovery), once applied. */
  codes: string[];
  /** Cart recovery: how many codes the proposal makes (shown or not to this staff member). */
  code_count?: number | null;
  /** Once applied: the changed products, to open in Shopify admin. */
  products?: { id: string; title: string; url: string }[];
  /** An applied website draft: the copy's preview and theme editor links. */
  theme?: { name: string; preview_url: string; editor_url: string } | null;
}

type Action = "approve" | "reject" | "undo";

/** `?proposal=<id>`: opened from a WhatsApp alert. Only an id; approving still happens here. */
const FOCUS = (() => {
  const id = new URLSearchParams(window.location.search).get("proposal") || "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : "";
})();

/** What Undo will do, for the confirmation the merchant taps through. */
const undoText = (p: Proposal) =>
  p.kind === "recovery_codes"
    ? `All ${p.code_count ?? ""} codes stop working, including any already given to customers.`
    : p.kind === "theme_draft"
      ? "Undo deletes the draft copy of your theme, unless it has been published since. Your live website is not affected."
      : p.kind === "publish_theme"
        ? "Undo makes your previous theme live again, unless the live theme was changed in Shopify since. The draft stays in your theme library: delete it in Online Store > Themes if you don't want it."
        : "Undo will set these back, unless they were changed in Shopify since:\n" +
  p.changes
    .map((r) => `${r.target}${r.detail ? ` (${r.detail})` : ""}: ${r.field} back to ${r.before}`)
    .join("\n");

/**
 * Changes the copilot proposed. Nothing is written to the store until a staff
 * member taps Approve here; Undo puts back what Snowie changed.
 */
export default function Proposals({ onPending }: { onPending?: (ids: string[]) => void }) {
  const [list, setList] = useState<Proposal[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  // Theme scopes: offered only once the merchant asked the copilot for a website edit.
  const [missingTheme, setMissingTheme] = useState<string[]>([]);
  const themeGranted = useRef(false);
  const [error, setError] = useState("");
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [working, setWorking] = useState("");
  // The linked proposal when it is not in the list any more (e.g. older than the recent ones).
  const [linked, setLinked] = useState<Proposal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const focused = useRef(false);
  // Granted in this session: the server's record catches up when Shopify reports it.
  const granted = useRef(false);
  // Ids seen so far: a pending one not among them is new, and is highlighted for a while.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const reported = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { status, data } = await get<{
      proposals: Proposal[];
      missing_action_scopes: string[];
      missing_theme_scopes?: string[];
    }>("/api/copilot/panel/proposals/");
    if (status === 200) {
      setList(data.proposals);
      setLoaded(true);
      setMissing(granted.current ? [] : data.missing_action_scopes);
      setMissingTheme(themeGranted.current ? [] : data.missing_theme_scopes ?? []);
    } else setError(data.detail || "Could not load proposed changes.");
  }, []);

  // Poll fast while a change is being applied, slowly otherwise (new proposals from the chat).
  // Scroll to the linked proposal once, after the first load.
  useEffect(() => {
    if (!FOCUS || focused.current || !loaded) return;
    focused.current = true;
    if (list.some((p) => p.id === FOCUS)) {
      document.getElementById(`card-${FOCUS}`)?.scrollIntoView({ block: "center" });
      return;
    }
    void get<Proposal>(`/api/copilot/panel/proposals/${FOCUS}/`)
      .then(({ status, data }) => status === 200 && setLinked(data))
      .catch(() => undefined);
  }, [list, loaded]);

  const inFlight = list.some((p) => IN_FLIGHT.includes(p.status));
  useEffect(() => {
    const refresh = () => void load().catch(() => setError("Could not reach Snowie."));
    refresh();
    const timer = window.setInterval(() => document.hidden || refresh(), inFlight ? 2000 : 10000);
    return () => window.clearInterval(timer);
  }, [load, inFlight]);

  const turnOn = async () => {
    try {
      const { result } = await shopify.scopes.request(missing);
      if (result === "granted-all") {
        granted.current = true;
        setMissing([]);
      }
    } catch {
      setError("Could not turn on actions. Try again.");
    }
  };

  const turnOnTheme = async () => {
    try {
      const { result } = await shopify.scopes.request(missingTheme);
      if (result === "granted-all") {
        themeGranted.current = true;
        setMissingTheme([]);
      }
    } catch (failure) {
      // Usually: the app version live in Shopify doesn't list read_themes/write_themes as
      // optional scopes yet (the app config was not deployed with `shopify app deploy`).
      console.warn("Snowie: website editing scope request failed", failure);
      setError(
        "Shopify didn't offer the website editing permission. The Snowie app needs its latest " +
          "settings released in Shopify first; if it still fails after that, try again.",
      );
    }
  };

  const act = async (proposal: Proposal, action: Action) => {
    if (action === "undo" && !window.confirm(undoText(proposal))) return;
    setWorking(proposal.id);
    setError("");
    setUpgradeUrl(null);
    try {
      const { status, data } = await post<Proposal>(
        `/api/copilot/panel/proposals/${proposal.id}/${action}/`,
      );
      if (status !== 200) {
        setError(data.detail || "That didn't work. Refresh and try again.");
        setUpgradeUrl(data.upgrade_url || null);
      }
      await load();
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setWorking("");
    }
  };

  const merged = linked && !list.some((p) => p.id === linked.id) ? [linked, ...list] : list;
  // Waiting for approval first; otherwise as the server sent them (newest first).
  const shown = [...merged].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  const pendingKey = shown.filter((p) => p.status === "pending").map((p) => p.id).join(",");

  useEffect(() => {
    if (!loaded) return;
    const ids = pendingKey ? pendingKey.split(",") : [];
    if (reported.current !== pendingKey) {
      reported.current = pendingKey;
      onPending?.(ids);
    }
    const before = seen.current;
    seen.current = new Set([...(before ?? []), ...ids]);
    const added = before ? ids.filter((id) => !before.has(id)) : [];
    if (!added.length) return;
    setFresh((f) => [...f, ...added]);
    const first = shown.find((p) => p.id === added[0]);
    setAnnouncement(`New change waiting for approval: ${first?.summary ?? ""}`);
    window.setTimeout(() => document.getElementById(`card-${added[0]}`)?.scrollIntoView({ block: "nearest" }), 0);
    window.setTimeout(() => setFresh((f) => f.filter((id) => !added.includes(id))), 8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, loaded]);

  return (
    <section aria-label="Proposed changes" className="space-y-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {loaded && !shown.length && !error && (
        <p className="rounded-xl border border-dashed border-brand-200 bg-white p-4 text-center text-sm text-slate-500">
          No changes yet. Ask the copilot to prepare one.
        </p>
      )}
      {!loaded && !error && <p className="p-2 text-sm text-slate-500">Loading changes…</p>}
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>
            Turn on actions to let the copilot propose discounts, campaigns, price, stock, status
            and tag changes.
            Nothing changes in your store until you approve it here.
          </p>
          <button
            type="button"
            onClick={() => void turnOn()}
            className="mt-2 rounded-md bg-brand-700 px-3 py-1.5 text-white hover:bg-brand-800"
          >
            Turn on actions
          </button>
        </div>
      )}
      {missingTheme.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>
            Turn on website editing to let the copilot prepare theme changes on a draft copy of
            your theme. Your live website changes only when you approve publishing it.
          </p>
          <button
            type="button"
            onClick={() => void turnOnTheme()}
            className="mt-2 rounded-md bg-brand-700 px-3 py-1.5 text-white hover:bg-brand-800"
          >
            Turn on website editing
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
          {upgradeUrl && (
            <a href={upgradeUrl} target="_top" className="ml-1 text-brand-700 underline hover:text-brand-900">
              See plans
            </a>
          )}
        </p>
      )}
      {shown.map((p) => (
        <Card
          key={p.id}
          proposal={p}
          busy={working === p.id}
          onAct={act}
          focused={p.id === FOCUS}
          fresh={fresh.includes(p.id)}
        />
      ))}
    </section>
  );
}

const CODES_SHOWN = 8;

/** Single-use codes to hand to customers who agreed to hear from the store. */
function Codes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const [all, setAll] = useState(false); // no scroll box inside a card: fold the long list
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-600">{codes.length} single-use codes</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
        >
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>
      <ul aria-label="Discount codes" className="mt-1 font-mono text-xs">
        {(all ? codes : codes.slice(0, CODES_SHOWN)).map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {codes.length > CODES_SHOWN && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="mt-1 text-xs font-medium text-brand-700 hover:text-brand-900 hover:underline"
        >
          {all ? "Show fewer" : `Show all ${codes.length}`}
        </button>
      )}
    </div>
  );
}

function Card({
  proposal: p,
  busy,
  onAct,
  focused = false,
  fresh = false,
}: {
  proposal: Proposal;
  busy: boolean;
  onAct: (p: Proposal, a: Action) => void;
  focused?: boolean;
  fresh?: boolean;
}) {
  const showMargin = p.changes.some((r) => r.margin_after);
  // Item reasons already said in the proposal's own error are not repeated.
  const problems = p.items.filter(
    (i) => (i.error && !(p.error && p.error.includes(i.error))) || (!i.error && i.status === "sent"),
  );
  const why = REASON[p.status];
  const showWhy = Boolean(why && (p.error || problems.length));
  const button = "rounded-md px-3 py-1.5 disabled:opacity-60";
  return (
    <article
      id={`card-${p.id}`}
      aria-labelledby={`proposal-${p.id}`}
      aria-current={focused ? "true" : undefined}
      tabIndex={-1}
      className={`scroll-m-2 rounded-xl border bg-white p-4 text-sm shadow-sm transition-shadow ${
        focused
          ? "border-brand-600 ring-2 ring-brand-600"
          : fresh
            ? "border-brand-600 ring-4 ring-brand-200"
            : p.status === "pending"
              ? "border-brand-300"
              : "border-brand-100"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <h2 id={`proposal-${p.id}`} className="font-medium text-slate-900">
          {fresh && (
            <span className="mr-1.5 rounded bg-brand-700 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">
              New
            </span>
          )}
          {p.summary}
          {p.version > 1 && <span className="text-slate-500"> (version {p.version})</span>}
        </h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            p.status === "pending" ? "bg-brand-100 text-brand-900" : "bg-slate-100 text-slate-800"
          }`}
        >
          {STATUS[p.status] || p.status}
        </span>
      </header>
      {p.approved_via && VIA[p.approved_via] && <p className="text-xs text-slate-500">{VIA[p.approved_via]}</p>}

      {showWhy && why && (
        <div className={`mt-2 rounded-lg border px-3 py-2 ${why.box}`}>
          <p className="font-medium">{why.title}</p>
          {p.error && <p className="mt-0.5 break-words">{p.error}</p>}
          {problems.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 break-words">
              {problems.map((i) => (
                <li key={i.idx}>
                  {i.target}: {i.error || "Shopify may or may not have made this change; check it."}
                  {i.verified === false && (
                    <span className="ml-1 rounded bg-white/70 px-1 text-xs">Check in Shopify</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {p.status === "failed" && (
            <p className="mt-1 text-xs opacity-90">To try again, ask the copilot to propose it again.</p>
          )}
        </div>
      )}

      <ul aria-label="Changes: before and after" className="mt-3 divide-y divide-slate-100 rounded-lg bg-slate-50 text-xs">
        {p.changes.map((r, i) => (
          <li key={i} className="px-3 py-2">
            <p className="font-medium text-slate-900">
              {r.target}
              {r.detail && <span className="font-normal text-slate-500"> · {r.detail}</span>}
            </p>
            <p className="mt-0.5 text-slate-700">
              {r.field}: <span className="sr-only">from </span>
              <span className="text-slate-600">{r.before}</span>
              <span aria-hidden> → </span>
              <span className="sr-only"> to </span>
              <strong className="font-semibold text-slate-900">{r.after}</strong>
            </p>
            {(r.before_full || r.after_full) && (
              <details className="mt-1 text-slate-700">
                <summary className="cursor-pointer text-brand-700 hover:text-brand-900">Show the full text</summary>
                {r.before_full && (
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    <span className="font-medium">Before:</span> {r.before_full}
                  </p>
                )}
                {r.after_full && (
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    <span className="font-medium">After:</span> {r.after_full}
                  </p>
                )}
              </details>
            )}
            {showMargin && <p className="mt-0.5 text-slate-600">Margin after: {r.margin_after || "unknown"}</p>}
          </li>
        ))}
      </ul>

      {p.warnings.length > 0 && (
        <ul className="mt-3 list-disc rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-amber-900">
          {p.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {IN_FLIGHT.includes(p.status) && (
        <p role="status" className="mt-2 text-slate-600">
          {p.progress.applied} of {p.progress.total} changes applied…
        </p>
      )}
      {!showWhy && p.error && <p className="mt-2 text-red-700">{p.error}</p>}
      {!showWhy && problems.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-slate-700">
          {problems.map((i) => (
            <li key={i.idx}>
              {i.target}: {i.error || "Shopify may or may not have made this change; check it."}
              {i.verified === false && (
                <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">Check in Shopify</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {p.codes.length > 0 && <Codes codes={p.codes} />}

      {!!p.products?.length && (
        <ul aria-label="Changed products" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {p.products.map((product) => (
            <li key={product.id}>
              <a
                href={`shopify://admin/products/${product.id.split("/").pop()}`}
                target="_top"
                className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-900 hover:underline"
              >
                {product.title}
                <ExternalLink aria-hidden className="h-3 w-3" />
                <span className="sr-only"> (open in Shopify)</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {p.theme && (
        <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs">
          <p className="text-slate-700">
            Draft “{p.theme.name}” is ready. Customers don't see it until it is published.
          </p>
          <ul aria-label="Website draft" className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {[
              { href: p.theme.preview_url, label: "Preview" },
              { href: p.theme.editor_url, label: "Open in theme editor" },
            ].map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-900 hover:underline"
                >
                  {link.label}
                  <ExternalLink aria-hidden className="h-3 w-3" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.status === "pending" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(p, "approve")}
            className={`${button} bg-brand-700 text-white hover:bg-brand-800`}
          >
            {busy ? "Checking…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(p, "reject")}
            className={`${button} border border-slate-300 hover:bg-slate-100`}
          >
            Reject
          </button>
          <span className="text-xs text-slate-500">Expires {p.expires_at}</span>
        </div>
      )}
      {p.undoable && (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(p, "undo")}
            className={`${button} border border-slate-300 hover:bg-slate-100`}
          >
            Undo
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Undo puts back the values from before Snowie's change. Anything changed in Shopify
            since then is left as it is.
          </p>
        </div>
      )}
    </article>
  );
}
