import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Loader2, Lock, MessageCircle, RefreshCw } from "lucide-react";
import { get, post } from "./api";
import { btn } from "./styles";

const PATH = "/api/copilot/panel/setup/whatsapp-store/";
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-500";

interface LinkStatus {
  connected?: boolean;
  logged_in?: boolean;
  qr_pending?: boolean;
  number?: string;
  error?: "key_refused" | "unreachable" | "reconnect";
}

interface State {
  in_plan: boolean;
  can_edit: boolean;
  connected: boolean;
  enabled?: boolean;
  number?: string;
  webhook_url?: string;
  has_secret?: boolean;
  receiving?: boolean;
  last_message_at?: string | null;
  status?: LinkStatus;
}

const STATUS_ERRORS: Record<NonNullable<LinkStatus["error"]>, string> = {
  key_refused: "WhatsAppX no longer accepts the saved API key. Paste a new one below.",
  unreachable: "Couldn't reach WhatsAppX just now. Try again in a minute.",
  reconnect: "Reconnect: paste the API key again.",
};

function linkLine(s: LinkStatus | undefined): { ok: boolean; text: string } | null {
  if (!s) return null;
  if (s.error) return { ok: false, text: STATUS_ERRORS[s.error] };
  if (s.connected && s.logged_in) return { ok: true, text: "Your WhatsApp number is linked in WhatsAppX." };
  if (s.qr_pending) return { ok: false, text: "Scan the QR code in the WhatsAppX app to link your number." };
  return { ok: false, text: "Your number isn't linked in WhatsAppX yet: open WhatsAppX and scan the QR code." };
}

/**
 * The store's own WhatsApp number, on which customers find products, get a checkout link
 * and ask where their order is. Each store links its own WhatsAppX workspace: the API key
 * first (Snowie then shows this store's webhook URL), then the webhook's signing secret.
 */
export default function StoreWhatsApp() {
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    get<State>(`${PATH}?check=1`)
      .then(({ status, data }) => (status === 200 ? setState(data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const send = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const { status, data } = await post<State & { fields?: Record<string, string> }>(PATH, body);
      if (status === 200) {
        setState(data);
        setApiKey("");
        setSecret("");
        setConfirmRemove(false);
      } else {
        setError(data.fields ? Object.values(data.fields).join(" ") : data.detail || "That didn't work. Try again.");
      }
    } catch {
      setError("Could not reach Snowie.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // the field is selectable: copy it by hand
    }
  };

  if (failed) return <p className="text-sm text-slate-600">Store WhatsApp settings could not be loaded.</p>;
  if (!state) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading store WhatsApp…
      </p>
    );
  }

  const edit = state.can_edit && state.in_plan && !busy;
  const link = linkLine(state.status);
  const connectKey = (e: FormEvent) => {
    e.preventDefault();
    void send({ api_key: apiKey.trim() });
  };
  const saveSecret = (e: FormEvent) => {
    e.preventDefault();
    void send({ webhook_secret: secret.trim() });
  };

  return (
    <section aria-label="Customers order on WhatsApp" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <MessageCircle className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            Customers order on WhatsApp
            {!state.in_plan && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                <Lock aria-hidden className="h-3 w-3" /> Pro
              </span>
            )}
          </h2>
          <p className="text-slate-600">
            Customers message your store's WhatsApp number: Snowie shows products with photos, builds their cart, sends a
            checkout link, and answers "where is my order?".
          </p>
        </div>
      </div>

      {!state.in_plan && <p className="text-slate-600">This is part of the Pro plan.</p>}
      {state.in_plan && !state.can_edit && !state.connected && (
        <p className="text-slate-600">The store owner can connect the store's WhatsApp number here.</p>
      )}

      {state.in_plan && state.can_edit && !state.connected && (
        <form onSubmit={connectKey} className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li>
              Create a workspace at{" "}
              <a href="https://whatsappx.si" target="_blank" rel="noreferrer" className={btn.link}>
                whatsappx.si
              </a>{" "}
              and link your store's WhatsApp number by scanning the QR code there.
            </li>
            <li>In WhatsAppX, open API keys, create a key with write access and paste it here.</li>
          </ol>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-inset ring-amber-200">
            Use a number only for your store: everyone who messages it gets Snowie's shopping assistant.
          </p>
          <label className="block text-xs font-medium text-slate-700">
            WhatsAppX API key
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pk_live_…"
              autoComplete="off"
              spellCheck={false}
              className={input}
            />
          </label>
          <button type="submit" disabled={!edit || !apiKey.trim()} className={btn.primary}>
            {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            Connect
          </button>
        </form>
      )}

      {state.connected && (
        <div className="space-y-3">
          {link && (
            <p className={`flex items-start gap-2 ${link.ok ? "text-emerald-800" : "text-amber-900"}`}>
              {link.ok ? <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {link.text}
                {state.number ? ` Number: +${state.number}.` : ""}
              </span>
            </p>
          )}

          {!state.has_secret && state.can_edit && (
            <form onSubmit={saveSecret} className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <p className="font-medium text-slate-900">Last step: send your customers' messages to Snowie</p>
              <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                <li>In WhatsAppX, open Webhooks and add a webhook with this URL:</li>
              </ol>
              <div className="flex items-center gap-2">
                <input readOnly value={state.webhook_url} onFocus={(e) => e.target.select()} aria-label="Webhook URL" className={`${input} mt-0 font-mono text-xs`} />
                <button type="button" onClick={() => void copy(state.webhook_url ?? "")} className={btn.secondary}>
                  {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <ol start={2} className="list-decimal space-y-1 pl-5 text-slate-700">
                <li>WhatsAppX shows the webhook's signing secret once. Paste it here.</li>
              </ol>
              <label className="block text-xs font-medium text-slate-700">
                Signing secret
                <input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="whsec_…"
                  autoComplete="off"
                  spellCheck={false}
                  className={input}
                />
              </label>
              <button type="submit" disabled={!edit || !secret.trim()} className={btn.primary}>
                {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </form>
          )}

          {state.has_secret && (
            <p className="text-slate-700">
              {state.receiving
                ? `Receiving customer messages${state.last_message_at ? `, last at ${new Date(state.last_message_at).toLocaleString()}` : ""}.`
                : "Ready. Send a message to your store's number to test it."}
            </p>
          )}

          {state.has_secret && state.can_edit && (
            <label className="flex items-center justify-between gap-4">
              <span className="font-medium text-slate-900">Answer customers</span>
              <input
                type="checkbox"
                role="switch"
                className="h-4 w-4 accent-brand-700"
                checked={Boolean(state.enabled)}
                disabled={!edit}
                onChange={(e) => void send({ enabled: e.target.checked })}
              />
            </label>
          )}

          {state.can_edit && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => void send({ check: true })} className={btn.secondary}>
                <RefreshCw aria-hidden className="h-4 w-4" /> Check status
              </button>
              {confirmRemove ? (
                <>
                  <span className="text-slate-700">Disconnect this number?</span>
                  <button type="button" disabled={busy} onClick={() => void send({ disconnect: true })} className={btn.secondary}>
                    Yes, disconnect
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className={btn.ghost}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirmRemove(true)} className={btn.ghost}>
                  Disconnect
                </button>
              )}
            </div>
          )}

          {state.can_edit && state.status?.error && (
            <form onSubmit={connectKey} className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                New WhatsAppX API key
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="pk_live_…" autoComplete="off" className={input} />
              </label>
              <button type="submit" disabled={!edit || !apiKey.trim()} className={btn.primary}>
                Save key
              </button>
            </form>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
