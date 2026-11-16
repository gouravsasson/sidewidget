import { FormEvent, useState } from "react";
import { post } from "./api";

export interface Plan {
  plan: "free" | "growth" | "pro";
  features: string[];
  upgrade_url: string | null;
}

interface WhatsAppStatus {
  configured: boolean;
  number: string | null;
  opt_in_text: string;
}

export interface SetupState {
  plan: Plan;
  can_edit: boolean;
  onboarded: boolean;
  settings: {
    max_discount_pct: number;
    margin_floor_pct: number;
    tax_rate_pct: string | null;
    language: string;
    voice_approval: boolean;
    /** What that "yes" may approve. */
    voice_approval_scope: "everyday" | "all";
    auto_mode: boolean;
    auto_max_discount_pct: number;
    auto_changes_per_day: number;
  };
  whatsapp: WhatsAppStatus | null;
  first_look?: {
    period: { from: string; to: string };
    orders: number;
    net_sales: { display: string };
    average_order_value: { display: string };
  } | null;
}

const LANGUAGES: [string, string][] = [
  ["", "Store language"],
  ["en", "English"],
  ["hi", "Hindi"],
  ["hi-Latn", "Hinglish"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["ar", "Arabic"],
];

const SCOPES: [SetupState["settings"]["voice_approval_scope"], string][] = [
  ["everyday", "Everyday discounts only (safest)"],
  ["all", "All changes (stock, prices, visibility, discounts) — ending a discount still needs a tap"],
];

const input = "w-full rounded-md border border-slate-300 px-2 py-1";
const button = "rounded-md px-3 py-1.5 disabled:opacity-60";

/** The plan line, with Shopify's plan page when there is more to get. */
export function PlanBadge({ plan, onDark = false }: { plan: Plan; onDark?: boolean }) {
  return (
    <p className={`whitespace-nowrap text-xs ${onDark ? "text-white" : "text-slate-600"}`}>
      Plan:{" "}
      <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium capitalize text-brand-900">{plan.plan}</span>
      {plan.plan !== "pro" && plan.upgrade_url && (
        <>
          {" · "}
          <a
            href={plan.upgrade_url}
            target="_top"
            className={onDark ? "text-white underline hover:text-brand-100 focus-visible:outline-white" : "text-brand-700 underline hover:text-brand-900"}
          >
            See plans
          </a>
        </>
      )}
    </p>
  );
}

/**
 * How changes get approved besides a tap: a "yes" said or typed to the copilot (everyday
 * discounts), and auto mode (Pro). Only the store owner changes them; others see them.
 */
export function ApprovalModes({ state, onChange }: { state: SetupState; onChange: (s: SetupState) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = state.settings;
  const edit = state.can_edit && !busy;
  const inPlan = state.plan.features.includes("auto_mode");

  const save = async (body: Partial<SetupState["settings"]>) => {
    setBusy(true);
    setError("");
    try {
      const { status, data } = await post<SetupState & { fields?: Record<string, string> }>(
        "/api/copilot/panel/setup/",
        body,
      );
      if (status === 200) onChange({ ...state, ...data });
      else setError(data.fields ? Object.values(data.fields).join("; ") : data.detail || "That didn't work. Try again.");
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setBusy(false);
    }
  };
  const cap = (key: "auto_max_discount_pct" | "auto_changes_per_day", label: string) => (
    <label className="flex items-center gap-2 text-xs">
      {label}
      <input
        type="number"
        min={0}
        defaultValue={s[key]}
        disabled={!edit}
        onBlur={(e) => Number(e.target.value) !== s[key] && void save({ [key]: Number(e.target.value) })}
        className="w-16 rounded-md border border-slate-300 px-1"
      />
    </label>
  );

  return (
    <section aria-label="Approvals" className="rounded-xl border border-brand-100 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 font-medium">Approvals</h2>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 accent-brand-700"
          checked={s.voice_approval}
          disabled={!edit}
          onChange={(e) => void save({ voice_approval: e.target.checked })}
        />
        <span>Approve changes by saying or typing “yes” to the copilot.</span>
      </label>
      {s.voice_approval && (
        <fieldset className="mt-2 space-y-1.5 pl-6" disabled={!edit}>
          <legend className="sr-only">What a “yes” may approve</legend>
          {SCOPES.map(([value, label]) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name="voice-approval-scope"
                value={value}
                className="mt-0.5 accent-brand-700"
                checked={(s.voice_approval_scope ?? "everyday") === value}
                onChange={() => void save({ voice_approval_scope: value })}
              />
              <span>{label}</span>
            </label>
          ))}
          <p className="text-xs text-slate-500">
            {s.voice_approval_scope === "all"
              ? "Ending a discount and cart-recovery codes still need a tap here."
              : "Prices, stock, visibility and bigger changes need a tap here."}
          </p>
        </fieldset>
      )}
      <label className="mt-2 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 accent-brand-700"
          checked={s.auto_mode}
          disabled={!edit || (!s.auto_mode && !inPlan)}
          onChange={(e) => void save({ auto_mode: e.target.checked })}
        />
        <span>
          Auto mode: apply small timed discounts from Snowie's suggestions without asking. You're
          told after each one and can undo it here.{!inPlan && " Needs the Pro plan."}
        </span>
      </label>
      {s.auto_mode && (
        <div className="mt-1 flex gap-3 pl-6">
          {cap("auto_max_discount_pct", "Max % off")}
          {cap("auto_changes_per_day", "Per day")}
        </div>
      )}
      {!state.can_edit && <p className="mt-2 text-xs text-slate-500">Only the store owner can change these.</p>}
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * First-run checklist for the store owner: limits, language, WhatsApp, and a first look at
 * the store. Each part is optional; "Skip" ends it as well. Changes stay editable in Snowie.
 */
export default function Setup({ state, onChange }: { state: SetupState; onChange: (s: SetupState) => void }) {
  const [form, setForm] = useState({
    max_discount_pct: String(state.settings.max_discount_pct),
    margin_floor_pct: String(state.settings.margin_floor_pct),
    tax_rate_pct: state.settings.tax_rate_pct ?? "",
    language: state.settings.language,
  });
  const [number, setNumber] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const look = state.first_look;
  const wa = state.whatsapp;

  const send = async <T,>(path: string, body: object, then: (data: T) => void) => {
    setBusy(true);
    setError("");
    try {
      const { status, data } = await post<T & { fields?: Record<string, string> }>(path, body);
      if (status === 200) then(data);
      else setError(data.fields ? Object.entries(data.fields).map(([k, v]) => `${k}: ${v}`).join("; ")
        : data.detail || "That didn't work. Try again.");
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setBusy(false);
    }
  };

  const finish = (e: FormEvent) => {
    e.preventDefault();
    // Only what the owner changed; a field left blank stays as it is.
    const body: Record<string, unknown> = { done: true };
    const was = state.settings;
    for (const key of ["max_discount_pct", "margin_floor_pct"] as const) {
      const value = form[key].trim();
      if (value && value !== String(was[key])) body[key] = Number(value);
    }
    const tax = form.tax_rate_pct.trim();
    if (tax && tax !== (was.tax_rate_pct ?? "")) body.tax_rate_pct = tax;
    if (form.language !== was.language) body.language = form.language;
    void send<SetupState>("/api/copilot/panel/setup/", body, onChange);
  };
  const skip = () => void send<SetupState>("/api/copilot/panel/setup/", { done: true }, onChange);
  const whatsapp = (body: object) =>
    void send<WhatsAppStatus>("/api/copilot/panel/setup/whatsapp/", body, (data) => {
      if ("code" in body) onChange({ ...state, whatsapp: data });
      else setCodeSent(true);
    });

  const field = (key: keyof typeof form, label: string) => (
    <label className="block">
      {label}
      <input
        value={form[key]}
        inputMode="decimal"
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={input}
      />
    </label>
  );

  return (
    <section aria-label="Get started" className="rounded-xl border border-brand-300 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 font-medium">Get started</h2>
      {look && (
        <p className="mb-3 rounded bg-brand-50 p-2">
          {look.period.from} to {look.period.to}: {look.orders} orders, {look.net_sales.display} net
          sales, {look.average_order_value.display} average order. Ask the copilot anything about it.
        </p>
      )}
      {wa?.configured && !wa.number && (
        <div className="mb-3">
          <p className="mb-1">Morning summary and approval alerts on WhatsApp (optional)</p>
          {codeSent ? (
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" className={input} />
              <button type="button" disabled={busy} onClick={() => whatsapp({ code })} className={`${button} border border-slate-300`}>
                Confirm
              </button>
            </div>
          ) : (
            <>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+91 98765 43210"
                aria-label="WhatsApp number"
                className={input}
              />
              <label className="mt-1 flex items-start gap-2 text-xs">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                {wa.opt_in_text}
              </label>
              <button
                type="button"
                disabled={busy || !agreed}
                onClick={() => whatsapp({ number, opt_in: agreed })}
                className={`${button} mt-1 border border-slate-300`}
              >
                Send code
              </button>
            </>
          )}
        </div>
      )}
      {wa?.number && <p className="mb-3 text-slate-600">WhatsApp: {wa.number}</p>}
      <form onSubmit={finish} className="grid gap-2 @md:grid-cols-2">
        {field("max_discount_pct", "Largest discount Snowie may suggest (%)")}
        {field("margin_floor_pct", "Never suggest below this margin (%)")}
        {field("tax_rate_pct", "Tax included in your prices (%)")}
        <label className="block">
          Reply language
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            className={input}
          >
            {LANGUAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 @md:col-span-2">
          <button type="submit" disabled={busy} className={`${button} bg-brand-700 text-white hover:bg-brand-800`}>
            Save and finish
          </button>
          <button type="button" disabled={busy} onClick={skip} className={`${button} border border-slate-300`}>
            Skip
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
