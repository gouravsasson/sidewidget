import { useCallback, useEffect, useRef, useState } from "react";
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
/** How a proposal was approved, when not by a tap here. */
const VIA: Record<string, string> = { voice: "Approved by a yes to the copilot", auto: "Applied by auto mode" };

interface Row {
  target: string;
  detail: string;
  field: string;
  before: string;
  after: string;
  margin_after?: string | null;
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
    : "Undo will set these back, unless they were changed in Shopify since:\n" +
  p.changes
    .map((r) => `${r.target}${r.detail ? ` (${r.detail})` : ""}: ${r.field} back to ${r.before}`)
    .join("\n");

/**
 * Changes the copilot proposed. Nothing is written to the store until a staff
 * member taps Approve here; Undo puts back what Snowie changed.
 */
export default function Proposals() {
  const [list, setList] = useState<Proposal[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [working, setWorking] = useState("");
  // The linked proposal when it is not in the list any more (e.g. older than the recent ones).
  const [linked, setLinked] = useState<Proposal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const focused = useRef(false);
  // Granted in this session: the server's record catches up when Shopify reports it.
  const granted = useRef(false);

  const load = useCallback(async () => {
    const { status, data } = await get<{ proposals: Proposal[]; missing_action_scopes: string[] }>(
      "/api/copilot/panel/proposals/",
    );
    if (status === 200) {
      setList(data.proposals);
      setLoaded(true);
      setMissing(granted.current ? [] : data.missing_action_scopes);
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

  const shown = linked && !list.some((p) => p.id === linked.id) ? [linked, ...list] : list;
  if (!shown.length && !missing.length && !error) return null;

  return (
    <section aria-label="Proposed changes" className="mb-3 max-h-[45vh] space-y-3 overflow-y-auto">
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
        <Card key={p.id} proposal={p} busy={working === p.id} onAct={act} focused={p.id === FOCUS} />
      ))}
    </section>
  );
}

/** Single-use codes to hand to customers who agreed to hear from the store. */
function Codes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
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
      <ul aria-label="Discount codes" className="mt-1 max-h-32 overflow-y-auto font-mono text-xs">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

function Card({
  proposal: p,
  busy,
  onAct,
  focused = false,
}: {
  proposal: Proposal;
  busy: boolean;
  onAct: (p: Proposal, a: Action) => void;
  focused?: boolean;
}) {
  const showMargin = p.changes.some((r) => r.margin_after);
  const problems = p.items.filter((i) => i.error || i.status === "sent");
  const button = "rounded-md px-3 py-1.5 disabled:opacity-60";
  return (
    <article
      id={`card-${p.id}`}
      aria-labelledby={`proposal-${p.id}`}
      aria-current={focused ? "true" : undefined}
      className={`rounded-xl border bg-white p-3 text-sm shadow-sm ${
        focused ? "border-brand-600 ring-2 ring-brand-600" : "border-brand-100"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <h2 id={`proposal-${p.id}`} className="font-medium">
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

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Changes: before and after</caption>
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="pr-2 font-normal">Item</th>
              <th scope="col" className="pr-2 font-normal">Field</th>
              <th scope="col" className="pr-2 font-normal">Before</th>
              <th scope="col" className="pr-2 font-normal">After</th>
              {showMargin && <th scope="col" className="font-normal">Margin after</th>}
            </tr>
          </thead>
          <tbody>
            {p.changes.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="pr-2">
                  {r.target}
                  {r.detail && <span className="text-slate-500"> · {r.detail}</span>}
                </td>
                <td className="pr-2">{r.field}</td>
                <td className="pr-2">{r.before}</td>
                <td className="pr-2 font-medium">{r.after}</td>
                {showMargin && <td>{r.margin_after || "unknown"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-800">
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
      {p.error && <p className="mt-2 text-red-700">{p.error}</p>}
      {problems.length > 0 && (
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

      {p.status === "pending" && (
        <div className="mt-3 flex items-center gap-2">
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
