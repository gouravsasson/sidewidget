import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./copilot.css";
import { get, post } from "./api";
import Conversation, { Continuation, SessionInfo, StartResult } from "./Conversation";
import Proposals from "./Proposals";
import Setup, { ApprovalModes, PlanBadge, SetupState } from "./Setup";
import { btn } from "./styles";
import { BrandMark } from "./ui";
import { AlertCircle, Loader2 } from "lucide-react";

interface ShopSession {
  shop: string;
  linked: boolean;
  link_preview: { company_name: string } | null;
  profile: { name?: string } | null;
}

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "connect"; company?: string; ownerOnly?: boolean; note?: string }
  | { kind: "ready"; shopName: string };

const query = new URLSearchParams(window.location.search);
const linkToken = query.get("link_token") || undefined;
/** Shopify's plan page sends the merchant back with ``plan_handle``: read the new plan now. */
const SETUP_PATH = `/api/copilot/panel/setup/${query.has("plan_handle") ? "?refresh_plan=1" : ""}`;

const CONNECT_HELP =
  "In the Snowie dashboard, open your copilot agent's Merchant Copilot tab and choose " +
  "\"Connect a Shopify store\". It brings you back here to confirm.";
const OFFLINE = "Could not reach Snowie. Check your connection.";

/**
 * Shopify admin does not grant the microphone to embedded apps, so voice runs
 * in its own tab unless this frame was explicitly allowed the microphone.
 */
const micAllowedHere = (): boolean => {
  const policy = (document as { featurePolicy?: { allowsFeature(f: string): boolean } })
    .featurePolicy;
  return Boolean(policy?.allowsFeature("microphone"));
};

function errorMessage(status: number, data: { detail?: string }): string {
  if (status === 401) return "Your Shopify session expired. Reload the app.";
  if (status === 503) return data.detail || "Shopify or Snowie is not responding. Try again soon.";
  return data.detail || "Something went wrong. Reload the app.";
}

async function loadSession(confirm = false): Promise<View> {
  const { status, data } = await post<ShopSession>("/api/shopify/session/", {
    ...(linkToken ? { link_token: linkToken } : {}),
    ...(confirm ? { confirm: true } : {}),
  });
  if (status === 403 && data.error === "link_failed") {
    return { kind: "connect", ownerOnly: true };
  }
  if (status === 400 && data.error === "link_failed") {
    // A stale or used link token: the shop may already be linked.
    const retry = await post<ShopSession>("/api/shopify/session/");
    if (retry.status === 200 && retry.data.linked) return ready(retry.data);
    return { kind: "connect", note: `This connect link can't be used (${data.detail}).` };
  }
  if (status !== 200) return { kind: "error", message: errorMessage(status, data) };
  if (data.linked) return ready(data);
  if (data.link_preview) return { kind: "connect", company: data.link_preview.company_name };
  return { kind: "connect" };
}

function ready(data: ShopSession): View {
  return { kind: "ready", shopName: data.profile?.name || data.shop };
}

/** A call for the in-panel chat; `continuation` goes on with the conversation after a call
 *  reached its time limit. */
async function startPanelCall(continuation?: Continuation): Promise<StartResult> {
  const { status, data } = await post<SessionInfo>("/api/copilot/panel/session/", continuation ?? {});
  return status === 200
    ? { ok: true, session: data }
    : { ok: false, message: errorMessage(status, data), code: data.error };
}

/**
 * Opens the top-level voice page with a one-time, 60-second handoff token. Resolves to
 * what to tell the merchant when it could not (shown in the panel, not an alert).
 */
async function talkByVoice(endCall: () => Promise<void>): Promise<string | null> {
  const tab = window.open("about:blank", "_blank"); // inside the click, so it is not blocked
  if (tab) tab.opener = null;
  try {
    await endCall(); // one open call per person: hand it over
    const { status, data } = await post<{ handoff_token: string }>(
      "/api/copilot/panel/session/",
      { handoff: true },
    );
    if (status !== 200) throw new Error(errorMessage(status, data));
    // In the fragment, so the token never reaches a server log or a Referer header.
    const url = `${window.location.origin}/copilot-voice.html#${encodeURIComponent(data.handoff_token)}`;
    if (!tab) return "Allow pop-ups for this page to talk by voice.";
    tab.location.href = url;
    return null;
  } catch (error) {
    tab?.close();
    return error instanceof Error && error.message ? error.message : OFFLINE;
  }
}

function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const [pending, setPending] = useState<string[]>([]);

  useEffect(() => {
    loadSession().then(setView, () => setView({ kind: "error", message: OFFLINE }));
  }, []);

  useEffect(() => {
    if (view.kind !== "ready") return;
    get<SetupState>(SETUP_PATH)
      .then(({ status, data }) => (status === 200 ? setSetup(data) : setSetupFailed(true)))
      .catch(() => setSetupFailed(true)); // the chat and proposals still work without it
  }, [view.kind]);

  const confirm = async () => {
    setConfirming(true);
    try {
      setView(await loadSession(true));
    } catch {
      setView({ kind: "error", message: OFFLINE });
    } finally {
      setConfirming(false);
    }
  };

  if (view.kind === "ready") {
    const micInline = micAllowedHere();
    return (
      <Conversation
        title="Snowie Copilot"
        subtitle={view.shopName}
        start={startPanelCall}
        micInline={micInline}
        onTalkByVoice={micInline ? undefined : talkByVoice}
        headerExtra={setup && <PlanBadge plan={setup.plan} />}
        checklist={setup?.can_edit && !setup.onboarded ? <Setup state={setup} onChange={setSetup} /> : undefined}
        settings={
          setup ? (
            <ApprovalModes state={setup} onChange={setSetup} />
          ) : (
            <p className="text-sm text-slate-600">
              {setupFailed ? "Settings could not be loaded. Reload the app to try again." : "Loading settings…"}
            </p>
          )
        }
        settingsAttention={Boolean(setup?.can_edit && !setup.onboarded)}
        changes={<Proposals onPending={setPending} />}
        pending={pending}
        startOnChanges={query.has("proposal")}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-4 text-slate-800 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandMark />
          <h1 className="text-base font-semibold text-slate-900">Snowie Copilot</h1>
        </div>
        {view.kind === "loading" && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
            Loading…
          </p>
        )}
        {view.kind === "error" && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {view.message}
          </p>
        )}
        {view.kind === "connect" && (
          <section className="space-y-3 text-sm leading-relaxed">
            <h2 className="text-lg font-semibold text-slate-900">Connect to your Snowie account</h2>
            {view.ownerOnly ? (
              <p>Only the store owner can connect this store. Ask the store owner to connect it.</p>
            ) : view.company ? (
              <>
                <p>
                  Connect this store to the Snowie account <strong>{view.company}</strong>? Its
                  admins will be able to set up a copilot that reads your sales, stock and
                  discounts. It proposes changes; nothing changes until a staff member approves
                  (here, or by saying yes to the copilot), or in auto mode if the store owner
                  turns it on.
                </p>
                <button type="button" onClick={confirm} disabled={confirming} className={`${btn.primary} px-4 py-2`}>
                  {confirming ? "Connecting…" : "Confirm"}
                </button>
              </>
            ) : (
              <>
                {view.note && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{view.note}</p>
                )}
                <p className="text-slate-700">{CONNECT_HELP}</p>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
