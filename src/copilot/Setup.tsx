import { FormEvent, ReactNode, useState } from "react";
import { AlertCircle, ListChecks, Loader2, Lock } from "lucide-react";
import { post } from "./api";
import { btn } from "./styles";

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
  ["all", "All changes (stock, prices, visibility, discounts)"],
  ["everyday", "Everyday discounts only (safest)"],
];

const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm";

/** The plan line, with Shopify's plan page when there is more to get. */
export function PlanBadge({ plan, onDark = false }: { plan: Plan; onDark?: boolean }) {
  return (
    <p className={`flex items-center gap-2 whitespace-nowrap text-xs ${onDark ? "text-white" : "text-slate-600"}`}>
      <span className="sr-only">Plan: </span>
      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium capitalize text-brand-800 ring-1 ring-inset ring-brand-200">
        {plan.plan}
      </span>
      {plan.plan !== "pro" && plan.upgrade_url && (
        <a
          href={plan.upgrade_url}
          target="_top"
          className={
            onDark
              ? "text-white underline hover:text-brand-100 focus-visible:outline-white"
              : "font-medium text-brand-700 hover:text-brand-900 hover:underline"
          }
        >
          See plans
        </a>
      )}
    </p>
  );
}

/** A checkbox drawn as a switch; the whole row is its label. */
function Toggle({
  checked,
  disabled,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-slate-600">{children}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 peer-disabled:opacity-50"
      />
    </label>
  );
}

/**
 * How changes get approved besides a tap: a "yes" said or typed to the copilot (all changes
 * by default, or everyday discounts only), and auto mode (Pro). Only the store owner changes them; others see them.
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
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <input
        type="number"
        min={0}
        defaultValue={s[key]}
        disabled={!edit}
        onBlur={(e) => Number(e.target.value) !== s[key] && void save({ [key]: Number(e.target.value) })}
        className={input}
      />
    </label>
  );

  return (
    <section aria-label="Approvals" className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Approvals</h3>
        {busy && (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <Loader2 aria-hidden className="h-3.5 w-3.5 motion-safe:animate-spin" />
            Saving…
          </span>
        )}
      </div>
      {!state.can_edit && (
        <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Only the store owner can change these.
        </p>
      )}
      <div className={card}>
        <Toggle
          checked={s.voice_approval}
          disabled={!edit}
          onChange={(on) => void save({ voice_approval: on })}
          title="Approve with a “yes”"
        >
          Approve changes by saying or typing “yes” to the copilot.
        </Toggle>
        {s.voice_approval && (
          <fieldset className="mt-3 space-y-2 border-t border-slate-100 pt-3" disabled={!edit}>
            <legend className="sr-only">What a “yes” may approve</legend>
            {SCOPES.map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="voice-approval-scope"
                  value={value}
                  className="mt-0.5 accent-brand-700"
                  checked={(s.voice_approval_scope ?? "all") === value}
                  onChange={() => void save({ voice_approval_scope: value })}
                />
                <span className="text-slate-800">{label}</span>
              </label>
            ))}
            <p className="text-xs text-slate-600">
              {s.voice_approval_scope !== "everyday"
                ? "Ending a discount and cart-recovery codes still need a tap here."
                : "Prices, stock, visibility and bigger changes need a tap here."}
            </p>
          </fieldset>
        )}
      </div>
      <div className={card}>
        <Toggle
          checked={s.auto_mode}
          disabled={!edit || (!s.auto_mode && !inPlan)}
          onChange={(on) => void save({ auto_mode: on })}
          title={
            <>
              Auto mode
              <span className="rounded-full bg-brand-50 px-1.5 py-px text-[11px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-200">
                Pro
              </span>
            </>
          }
        >
          Apply small timed discounts from Snowie's suggestions without asking. You're told after
          each one and can undo it here.{!inPlan && " Needs the Pro plan."}
        </Toggle>
        {s.auto_mode && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            {cap("auto_max_discount_pct", "Max % off")}
            {cap("auto_changes_per_day", "Per day")}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
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
    <label className="block text-xs font-medium text-slate-700">
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
    <section aria-label="Get started" className={`@container ${card} border-brand-200`}>
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"
        >
          <ListChecks className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Get started</h2>
          <p className="text-xs text-slate-600">A few optional settings for your copilot. Leave any of them as they are.</p>
        </div>
      </div>
      {look && (
        <div className="mb-4 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <p className="text-xs text-slate-600">
            {look.period.from} to {look.period.to}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["Orders", String(look.orders)],
              ["Net sales", look.net_sales.display],
              ["Average order", look.average_order_value.display],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-xs text-slate-600">{label}</dt>
                <dd className="truncate text-base font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-600">Ask the copilot anything about it.</p>
        </div>
      )}
      {wa?.configured && !wa.number && (
        <div className="mb-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 font-medium text-slate-900">Morning summary and approval alerts on WhatsApp (optional)</p>
          {codeSent ? (
            <div className="flex items-center gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" className={`${input} mt-0`} />
              <button type="button" disabled={busy} onClick={() => whatsapp({ code })} className={btn.secondary}>
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
                className={`${input} mt-0`}
              />
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-brand-700"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                {wa.opt_in_text}
              </label>
              <button
                type="button"
                disabled={busy || !agreed}
                onClick={() => whatsapp({ number, opt_in: agreed })}
                className={`${btn.secondary} mt-2`}
              >
                Send code
              </button>
            </>
          )}
        </div>
      )}
      {wa?.number && <p className="mb-4 text-slate-600">WhatsApp: {wa.number}</p>}
      <form onSubmit={finish} className="grid gap-3 @md:grid-cols-2">
        {field("max_discount_pct", "Largest discount Snowie may suggest (%)")}
        {field("margin_floor_pct", "Never suggest below this margin (%)")}
        {field("tax_rate_pct", "Tax included in your prices (%)")}
        <label className="block text-xs font-medium text-slate-700">
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
        <div className="flex gap-2 pt-1 @md:col-span-2">
          <button type="submit" disabled={busy} className={btn.primary}>
            Save and finish
          </button>
          <button type="button" disabled={busy} onClick={skip} className={btn.secondary}>
            Skip
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
