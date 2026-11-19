// Top-level voice page (copilot-voice.html), opened from the Shopify admin
// panel because embedded apps get no microphone. No App Bridge and no cookies.
// The first call uses the one-time handoff token from the URL fragment; every
// call's answer carries a single-use resume token for the next one, kept in this
// tab's sessionStorage only (gone when the tab closes), so a call that ended
// (quiet, the agent's time limit, a reload) can be started again from here.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./copilot.css";
import { SNOWIE_API_ORIGIN } from "../config";
import type { Continuation, SessionInfo, StartResult } from "./Conversation";
import VoiceView from "./VoiceView";

const RESUME_KEY = "snowie-copilot-resume";
const EXPIRED = "This voice link has expired. Go back to Shopify and choose Talk by voice again.";

const read = (): string => {
  try {
    return sessionStorage.getItem(RESUME_KEY) || "";
  } catch {
    return "";
  }
};
const write = (token: string) => {
  try {
    if (token) sessionStorage.setItem(RESUME_KEY, token);
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* storage blocked: the in-memory copy still works until a reload */
  }
};

let handoff = decodeURIComponent(window.location.hash.slice(1));
history.replaceState(null, "", window.location.pathname); // not kept in history
let resume = handoff ? "" : read(); // a fresh link from Shopify wins over an old token

/** The first call (handoff) or the next one (resume); `continuation` goes on with the
 *  conversation after a call reached its time limit (only with a resume token). */
async function startVoiceCall(continuation?: Continuation): Promise<StartResult> {
  const used = { handoff, resume };
  const body = handoff ? { handoff } : resume ? { resume, ...continuation } : null;
  if (!body) return { ok: false, message: EXPIRED };
  handoff = ""; // single use either way
  resume = "";
  write("");
  try {
    const response = await fetch(`${SNOWIE_API_ORIGIN}/api/copilot/panel/call/`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (typeof data.resume_token === "string") {
      resume = data.resume_token;
      write(resume);
    } else if (!response.ok && !data.error && !resume) {
      // Not Snowie's refusal (a proxy or server error): the token was not spent; keep it.
      // Snowie's own refusals without a token (expired, access removed) mean it is done.
      resume = used.resume;
      write(resume);
    }
    if (response.ok) return { ok: true, session: data as SessionInfo };
    return { ok: false, message: data.detail || EXPIRED, code: data.error };
  } catch {
    // Never reached Snowie (or its answer was lost): the token may still be good; keep it.
    if (!resume) {
      resume = used.handoff ? "" : used.resume;
      handoff = used.handoff;
      write(resume);
    }
    return { ok: false, message: "Could not reach Snowie. Check your connection." };
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VoiceView title="Snowie Copilot — voice" start={startVoiceCall} />
  </StrictMode>,
);
