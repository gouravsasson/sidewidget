// When a copilot call should go on in a new call by itself, and what of the
// conversation it carries over. Agni ends every call at the copilot's call limit
// (`max_seconds` in the start answer); when a call the server ended ran that long,
// the panel and the voice page start the next one without a tap, passing the last
// lines of the transcript (`previous`) so the copilot continues where it stopped.
// A call the merchant ended, or one that ended after quiet minutes, never continues;
// nor one nobody attended (calls are billed): the merchant must have spoken (a final
// speech segment) or typed within MERCHANT_ACTIVE_MS, with the page visible. Otherwise
// the merchant gets a Continue button.
//
// Pure and import-free: tests/merchant_copilot/test_continuation.py runs it with node.

/** Who ended a call: the merchant (End, or leaving), the quiet timer, or the server/agent. */
export type EndReason = "user" | "idle" | "closed";

/** Automatic continuations per page session; after that the merchant taps Continue. */
export const MAX_AUTO_CONTINUATIONS = 6;
/** The merchant spoke or typed this recently: someone is there. */
export const MERCHANT_ACTIVE_MS = 2 * 60 * 1000;
/** A call that lasted this close to the limit was ended by it. */
export const LIMIT_MARGIN_SECONDS = 30;
/** What the server accepts as `previous` (it trims too, keeping the newest lines). */
export const PREVIOUS_LINES = 40;
export const PREVIOUS_LINE_CHARS = 500;
export const PREVIOUS_CHARS = 6000;

export interface PreviousLine {
  from: "agent" | "merchant";
  text: string;
}

export interface Ending {
  reason: EndReason;
  /** Milliseconds (Date.now()) when the call started and ended. */
  startedAt: number;
  endedAt: number;
  /** The call limit from the start answer; 0 or missing: unknown, never continue. */
  maxSeconds: number;
}

/** True when the server ended the call at its time limit. */
export function endedAtLimit({ reason, startedAt, endedAt, maxSeconds }: Ending): boolean {
  if (reason !== "closed" || !(maxSeconds > 0)) return false;
  return (endedAt - startedAt) / 1000 >= maxSeconds - LIMIT_MARGIN_SECONDS;
}

export interface Attendance {
  /** Automatic continuations so far on this page. */
  count: number;
  /** Date.now() of the merchant's last final speech segment or typed message (0: none). */
  lastMerchantAt: number;
  /** Whether the page is visible (document.visibilityState). */
  visible: boolean;
}

/** Start the next call by itself: ended at the limit, continuations are left, and the
 *  merchant is there (spoke or typed lately, page visible). */
export function shouldContinue(ending: Ending & Attendance): boolean {
  return (
    ending.count < MAX_AUTO_CONTINUATIONS &&
    ending.visible &&
    ending.lastMerchantAt > 0 &&
    ending.endedAt - ending.lastMerchantAt <= MERCHANT_ACTIVE_MS &&
    endedAtLimit(ending)
  );
}

/** The newest transcript lines, oldest first, within what the server accepts. */
export function previousLines(lines: ReadonlyArray<{ fromAgent: boolean; text: string }>): PreviousLine[] {
  const out: PreviousLine[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0 && out.length < PREVIOUS_LINES; i--) {
    const text = lines[i].text.trim().slice(0, PREVIOUS_LINE_CHARS);
    if (!text) continue;
    total += text.length + 10; // the "Merchant: " label and line break the server adds
    if (total > PREVIOUS_CHARS) break;
    out.unshift({ from: lines[i].fromAgent ? "agent" : "merchant", text });
  }
  return out;
}
