// Top-level voice page (copilot-voice.html), opened from the Shopify admin
// panel because embedded apps get no microphone. No App Bridge, no cookies or
// storage: the only credential is the one-time handoff token in the URL
// fragment, exchanged once for this page's call.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./copilot.css";
import { SNOWIE_API_ORIGIN } from "../config";
import type { SessionInfo, StartResult } from "./Conversation";
import VoiceView from "./VoiceView";

const handoff = decodeURIComponent(window.location.hash.slice(1));
history.replaceState(null, "", window.location.pathname); // not kept in history
const EXPIRED = "This voice link has expired. Go back to Shopify and choose Talk by voice again.";

let used = false;

async function startVoiceCall(): Promise<StartResult> {
  if (!handoff || used) return { ok: false, message: EXPIRED };
  used = true;
  try {
    const response = await fetch(`${SNOWIE_API_ORIGIN}/api/copilot/panel/call/`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, session: data as SessionInfo };
    return { ok: false, message: data.detail || EXPIRED };
  } catch {
    return { ok: false, message: "Could not reach Snowie. Check your connection." };
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VoiceView title="Snowie Copilot — voice" start={startVoiceCall} />
  </StrictMode>,
);
