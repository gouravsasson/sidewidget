import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./copilot.css";
import { get, post } from "./api";
import Conversation, { SessionInfo, StartResult } from "./Conversation";
import Proposals from "./Proposals";
import Setup, { ApprovalModes, PlanBadge, SetupState } from "./Setup";

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

async function startPanelCall(): Promise<StartResult> {
  const { status, data } = await post<SessionInfo>("/api/copilot/panel/session/");
  return status === 200 ? { ok: true, session: data } : { ok: false, message: errorMessage(status, data) };
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
        title={`Ask ${view.shopName}`}
        start={startPanelCall}
        micInline={micInline}
        onTalkByVoice={micInline ? undefined : talkByVoice}
        headerExtra={setup && <PlanBadge plan={setup.plan} onDark />}
        settings={
          setup ? (
            <>
              {setup.can_edit && !setup.onboarded && <Setup state={setup} onChange={setSetup} />}
              <ApprovalModes state={setup} onChange={setSetup} />
            </>
          ) : (
            <p className="p-2 text-sm text-slate-500">
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
    <main className="mx-auto max-w-xl p-6 text-slate-800">
      <h1 className="mb-3 rounded-xl bg-gradient-to-r from-brand-700 to-brand-violet px-4 py-3 text-xl font-semibold text-white">
        Snowie Copilot
      </h1>
      {view.kind === "loading" && <p role="status">Loading…</p>}
      {view.kind === "error" && (
        <p role="alert" className="text-red-700">
          {view.message}
        </p>
      )}
      {view.kind === "connect" && (
        <section className="space-y-3 rounded-xl border border-brand-100 bg-white p-4">
          <h2 className="font-medium">Connect to your Snowie account</h2>
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
              <button
                type="button"
                onClick={confirm}
                disabled={confirming}
                className="rounded-md bg-brand-700 px-4 py-2 text-white hover:bg-brand-800 disabled:opacity-60"
              >
                {confirming ? "Connecting…" : "Confirm"}
              </button>
            </>
          ) : (
            <>
              {view.note && <p className="text-amber-800">{view.note}</p>}
              <p>{CONNECT_HELP}</p>
            </>
          )}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
