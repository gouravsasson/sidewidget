/** Persisted shopper id and the LiveKit credentials for one browser tab. */

export const SHOPPER_KEY = "snowie_session_id";
export const ACTIVE_CALL_KEY = "agni_active_webcall_session";
export const CALL_SESSION_KEY = "agni_call_session_id";
export const WIDGET_OPEN_KEY = "agni_widget_open";
export const RESUME_CALL_KEY = "snowie_resume_call";

const MAX_AGE_MS = 60 * 60 * 1000;

export type ActiveCall = {
  livekitUrl: string;
  token: string;
  callSessionId?: string;
  startedAt: number;
};

export function shopperId(): string {
  try {
    const existing = localStorage.getItem(SHOPPER_KEY);
    if (existing) return existing;
    const id = `sn_${crypto.randomUUID()}`;
    localStorage.setItem(SHOPPER_KEY, id);
    return id;
  } catch {
    return `sn_${crypto.randomUUID()}`;
  }
}

export function resumeCallEnabled(): boolean {
  try {
    return localStorage.getItem(RESUME_CALL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setResumeCallEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(RESUME_CALL_KEY, "1");
    else localStorage.removeItem(RESUME_CALL_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function readWidgetOpen(): boolean {
  try {
    return localStorage.getItem(WIDGET_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeWidgetOpen(open: boolean) {
  try {
    localStorage.setItem(WIDGET_OPEN_KEY, open ? "true" : "false");
  } catch {
    /* storage unavailable */
  }
}

export function readActiveCall(): ActiveCall | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_CALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveCall>;
    if (!parsed.livekitUrl || !parsed.token || typeof parsed.startedAt !== "number") {
      sessionStorage.removeItem(ACTIVE_CALL_KEY);
      return null;
    }
    if (Date.now() - parsed.startedAt > MAX_AGE_MS) {
      clearActiveCall();
      return null;
    }
    return {
      livekitUrl: parsed.livekitUrl,
      token: parsed.token,
      callSessionId: parsed.callSessionId,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function writeActiveCall(call: ActiveCall) {
  try {
    sessionStorage.setItem(ACTIVE_CALL_KEY, JSON.stringify(call));
    if (call.callSessionId) localStorage.setItem(CALL_SESSION_KEY, call.callSessionId);
  } catch {
    /* storage unavailable */
  }
}

export function clearActiveCall() {
  try {
    sessionStorage.removeItem(ACTIVE_CALL_KEY);
    localStorage.removeItem(CALL_SESSION_KEY);
    localStorage.removeItem(WIDGET_OPEN_KEY);
    localStorage.removeItem("callId");
  } catch {
    /* storage unavailable */
  }
}
