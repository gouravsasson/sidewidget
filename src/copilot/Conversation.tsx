import { FormEvent, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Loader2, Mic, MicOff, Package, PhoneOff, Settings2, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import ProductCards, { ProductCard, useProductCards } from "./ProductCards";
import { btn, surface } from "./styles";
import { AppHeader, Drawer, EmptyState, StatusDot } from "./ui";
import { EndReason, PreviousLine, endedAtLimit, previousLines, shouldContinue } from "./continuation";
import type { Activity, CopilotVoice, Connection, Line } from "./voice";

export interface SessionInfo extends Connection {
  agent_name: string;
  /** The call limit Agni enforces (seconds); the conversation goes on in a new call after it. */
  max_seconds?: number;
}

/** `code`: the server's error code (e.g. "call_active" while the last call is still closing). */
export type StartResult =
  | { ok: true; session: SessionInfo }
  | { ok: false; message: string; code?: string };

/** What a start sends to go on with the conversation: its last lines, and the release token
 *  of the call they came from (the server takes them only for the same staff member). */
export interface Continuation {
  previous: PreviousLine[];
  continues: string;
}

export type StartCall = (continuation?: Continuation) => Promise<StartResult>;

const ENDED: Record<EndReason | "limit", string> = {
  user: "You ended the call.",
  idle: "The call ended after two quiet minutes.",
  closed: "The call ended.",
  limit: "The call reached its time limit.",
};

const QUIET: Activity = { agentState: null, agentSpeaking: false, userSpeaking: false };

/** How long a continuation waits before trying once more when the last call is still closing. */
const RETRY_BUSY_MS = 2000;
const STILL_CLOSING = "The last call is still closing. Tap Continue in a moment.";

/**
 * One copilot conversation: transcript, text and mic. Nothing starts (no call, no mic prompt)
 * until the merchant sends a message or taps the mic; each start is one call. When the server
 * ends a call at its time limit while the merchant is there, the next call starts by itself
 * with the transcript carried over (continuation.ts), keeping the merchant's mic choice;
 * otherwise -- or after MAX_AUTO_CONTINUATIONS, or when that start fails -- a Continue button,
 * a typed message or the mic does the same. Ending the call (End, leaving the page) stops it.
 */
export function useCall(start: StartCall, autoMic = false) {
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [live, setLive] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [agentName, setAgentName] = useState("");
  const [call, setCall] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity>(QUIET);
  const voice = useRef<CopilotVoice | null>(null);
  const pending = useRef<Promise<CopilotVoice | null> | null>(null);
  const products = useProductCards(call, lines.filter((l) => l.fromAgent).length);
  const linesNow = useRef(lines);
  linesNow.current = lines;
  /** The merchant's mic choice (null: not made yet), kept across continued calls. */
  const micWanted = useRef<boolean | null>(null);
  /** Release token of the call that ended last: what a continuation carries over. */
  const lastCall = useRef("");
  /** Automatic continuations on this page. */
  const continued = useRef(0);
  /** The page is gone: nothing may start or stay connected. */
  const mounted = useRef(true);
  /** The merchant ended the call: nothing restarts by itself until they start again. */
  const stopped = useRef(false);
  /** The last call ended at its limit: the merchant's next start goes on with the conversation. */
  const continuable = useRef(false);
  /** When the merchant last spoke (a final segment) or typed. */
  const lastMerchantAt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    stopped.current = false;
    return () => {
      mounted.current = false;
      stopped.current = true;
      void voice.current?.disconnect();
    };
  }, []);

  const addLine = (line: Line) => {
    if (!line.fromAgent && line.final) lastMerchantAt.current = Date.now();
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i === -1) return [...prev, line];
      const next = [...prev];
      next[i] = line; // a transcription segment refined while it is spoken
      return next;
    });
  };

  const carryOver = (): Continuation => ({
    previous: previousLines(linesNow.current),
    continues: lastCall.current,
  });

  // A continuation right after a call ended may find its hold not yet released: once more.
  const startCall = async (continuation?: Continuation): Promise<StartResult> => {
    const result = await start(continuation);
    if (result.ok || !continuation || result.code !== "call_active") return result;
    await new Promise((done) => window.setTimeout(done, RETRY_BUSY_MS));
    if (!mounted.current || stopped.current) return result;
    const again = await start(continuation);
    return again.ok || again.code !== "call_active" ? again : { ...again, message: STILL_CLOSING };
  };

  const open = async (continuation?: Continuation): Promise<CopilotVoice | null> => {
    setConnecting(true);
    setReconnecting(Boolean(continuation));
    setCanContinue(false);
    setError("");
    const offerContinue = () => {
      if (continuation && !stopped.current) setCanContinue(true);
    };
    try {
      const result = await startCall(continuation);
      if (!result.ok) {
        setError(result.message);
        offerContinue();
        return null;
      }
      const startedAt = Date.now();
      const maxSeconds = result.session.max_seconds ?? 0;
      let mine: CopilotVoice | null = null;
      const { connect } = await import("./voice");
      const session = await connect(result.session, {
        onLine: addLine,
        onAudioBlocked: setAudioBlocked,
        onActivity: setActivity,
        onDisconnected: () => {
          if (voice.current && voice.current !== mine) return; // a newer call is live
          voice.current = null;
          setLive(false);
          setCall(null);
          setMicOn(false);
          setAudioBlocked(false);
          setActivity(QUIET);
        },
        onEnded: (reason) => {
          lastCall.current = result.session.release_token;
          // Gone, or the merchant already started another call: nothing to decide here.
          if (!mounted.current || voice.current || pending.current) return;
          const ending = { reason, startedAt, endedAt: Date.now(), maxSeconds };
          const atLimit = endedAtLimit(ending) && !stopped.current;
          continuable.current = atLimit;
          const attended = {
            count: continued.current,
            lastMerchantAt: lastMerchantAt.current,
            visible: document.visibilityState === "visible",
          };
          if (atLimit && shouldContinue({ ...ending, ...attended })) {
            continued.current += 1;
            setAnnouncement("Reconnecting…");
            void ensureSession(carryOver());
            return;
          }
          setAnnouncement(ENDED[atLimit ? "limit" : reason]);
          setCanContinue(atLimit);
        },
      });
      if (!mounted.current || stopped.current) {
        await session.disconnect(); // ended or left while it was connecting
        return null;
      }
      mine = session;
      voice.current = session;
      continuable.current = false;
      setAgentName(result.session.agent_name);
      setCall(result.session.release_token);
      setLive(true);
      setAnnouncement("Connected.");
      // A continued call keeps the merchant's mic choice; a new one follows `autoMic`.
      const mic = continuation && micWanted.current !== null ? micWanted.current : autoMic;
      if (mic) {
        await session.setMic(true);
        setMicOn(true);
        micWanted.current = true;
      }
      return session;
    } catch {
      setError("Could not connect to the copilot. Check your connection and try again.");
      offerContinue();
      return null;
    } finally {
      setConnecting(false);
      setReconnecting(false);
    }
  };

  // One call at a time: a double tap or a second Enter waits for the first start.
  const ensureSession = (continuation?: Continuation): Promise<CopilotVoice | null> => {
    if (voice.current) return Promise.resolve(voice.current);
    pending.current ??= open(continuation).finally(() => {
      pending.current = null;
    });
    return pending.current;
  };

  /** A start by the merchant (typing, the mic): after a call that hit its limit, it goes on
   *  with the conversation. */
  const begin = () => {
    stopped.current = false;
    return ensureSession(continuable.current ? carryOver() : undefined);
  };

  /** The Continue button: the next call, with the conversation so far. */
  const continueCall = async () => {
    stopped.current = false;
    await ensureSession(carryOver());
  };

  const toggleMic = async () => {
    const session = await begin();
    if (!session) return;
    try {
      await session.setMic(!micOn);
      setMicOn(!micOn);
      micWanted.current = !micOn;
    } catch {
      setError("The microphone could not be turned on. Check your browser's microphone setting.");
    }
  };

  /** Resolves true when the message went out. */
  const send = async (message: string): Promise<boolean> => {
    const session = await begin();
    if (!session) return false;
    try {
      await session.send(message);
      lastMerchantAt.current = Date.now();
      addLine({ id: `you-${Date.now()}`, fromAgent: false, text: message });
      return true;
    } catch {
      setError("That message was not sent. Try again.");
      return false;
    }
  };

  const end = async () => {
    stopped.current = true;
    continuable.current = false;
    setCanContinue(false);
    await voice.current?.disconnect();
  };

  return {
    connecting,
    reconnecting,
    canContinue,
    live,
    lines,
    micOn,
    audioBlocked,
    error,
    setError,
    announcement,
    agentName,
    activity,
    products,
    voice,
    toggleMic,
    send,
    end,
    continueCall,
  };
}

export type Call = ReturnType<typeof useCall>;

/** What a merchant might ask first: one tap sends it. */
const SUGGESTIONS = [
  "What's out of stock?",
  "Sales this week",
  "Top products this month",
  "Suggest a discount",
  "Make my website better",
];

/** The agent is working on an answer: its own state, or the merchant's last line unanswered. */
function isThinking(call: Call): boolean {
  if (!call.live) return false;
  const { agentState, agentSpeaking, userSpeaking } = call.activity;
  if (agentSpeaking || userSpeaking || agentState === "speaking") return false;
  if (agentState === "thinking") return true;
  const last = call.lines[call.lines.length - 1];
  return Boolean(last && !last.fromAgent && last.final !== false);
}

function AgentAvatar() {
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-violet text-white shadow-sm"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

/** Three dots in a bubble while the agent works on its answer. */
function Thinking({ name }: { name: string }) {
  return (
    <div className="mt-3 flex items-end gap-2.5 motion-safe:animate-fade-in">
      <AgentAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-slate-500 motion-safe:animate-typing"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <span className="sr-only">{name} is thinking…</span>
      </div>
    </div>
  );
}

/** Before the first line: a greeting, one line of help, and questions to tap. */
function ChatEmpty({
  call,
  title,
  help,
  suggestions,
  compact,
}: {
  call: Call;
  title: string;
  help: string;
  suggestions: string[];
  compact: boolean;
}) {
  const note = call.connecting ? "Connecting…" : call.announcement;
  return (
    <div className="my-auto flex flex-col items-center px-2 py-6 text-center">
      {!compact && (
        <span
          aria-hidden
          className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-violet text-white shadow-md shadow-brand-600/20"
        >
          <Sparkles className="h-6 w-6" />
        </span>
      )}
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{note || help}</p>
      {suggestions.length > 0 && (
        <ul aria-label="Suggested questions" className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={call.connecting}
                onClick={() => void call.send(s)}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900 disabled:opacity-60"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The conversation; scrolls itself (not the page) to the newest line. Before the first line
 * it shows `title`, `help` (or the call's state) and `suggestions` that send themselves.
 * `lead` (the first-run checklist) sits above it all.
 */
export function Transcript({
  call,
  title = "What can I help you with?",
  help,
  suggestions = SUGGESTIONS,
  lead,
}: {
  call: Call;
  title?: string;
  help: string;
  suggestions?: string[];
  lead?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const thinking = isThinking(call);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [call.lines, thinking]);
  const name = call.agentName || "Copilot";
  return (
    <div ref={box as RefObject<HTMLDivElement>} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
      {lead && <div className="mx-auto mb-4 w-full max-w-2xl">{lead}</div>}
      {call.lines.length === 0 && <ChatEmpty call={call} title={title} help={help} suggestions={suggestions} compact={Boolean(lead)} />}
      <section aria-label="Conversation" aria-live="polite" className="mx-auto flex w-full max-w-3xl flex-col">
        {call.lines.map((line, i) => {
          const first = i === 0 || call.lines[i - 1].fromAgent !== line.fromAgent;
          const who = line.fromAgent ? name : "You";
          const draft = line.final === false ? "opacity-75" : "";
          return line.fromAgent ? (
            <div key={line.id} className={`flex items-end gap-2.5 ${first ? (i ? "mt-4" : "") : "mt-1"}`}>
              {first ? <AgentAvatar /> : <span aria-hidden className="w-7 shrink-0" />}
              <div className="flex min-w-0 max-w-[85%] flex-col items-start">
                {first && (
                  <span aria-hidden className="mb-1 text-xs font-medium text-slate-600">
                    {who}
                  </span>
                )}
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm leading-relaxed text-slate-900 ${draft}`}
                >
                  <span className="sr-only">{who}: </span>
                  {line.text}
                </p>
              </div>
            </div>
          ) : (
            <div key={line.id} className={`flex flex-col items-end ${first ? (i ? "mt-4" : "") : "mt-1"}`}>
              {first && (
                <span aria-hidden className="mb-1 text-xs font-medium text-slate-600">
                  {who}
                </span>
              )}
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2 text-sm leading-relaxed text-white ${draft}`}
              >
                <span className="sr-only">{who}: </span>
                {line.text}
              </p>
            </div>
          );
        })}
      </section>
      {thinking && (
        <div className="mx-auto w-full max-w-3xl">
          <Thinking name={name} />
        </div>
      )}
    </div>
  );
}

/** Reconnecting, errors, Continue and the "turn on sound" tap, shown above the text box. */
export function CallNotices({ call }: { call: Call }) {
  return (
    <>
      {call.reconnecting && (
        <p className="mb-2 inline-flex items-center gap-2 self-start text-sm text-slate-600">
          <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
          Reconnecting…
        </p>
      )}
      {call.error && (
        <p role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{call.error}</span>
        </p>
      )}
      {call.canContinue && !call.connecting && (
        <div className="mb-2 flex flex-wrap items-center gap-2 self-start">
          {!call.error && <span className="text-sm text-slate-600">{call.announcement}</span>}
          <button
            type="button"
            onClick={() => void call.continueCall()}
            className={btn.secondary}
          >
            Continue
          </button>
        </div>
      )}
      {call.audioBlocked && (
        <button type="button" onClick={() => void call.voice.current?.startAudio()} className={`${btn.secondary} mb-2 self-start`}>
          <Volume2 aria-hidden className="h-4 w-4" />
          Tap to turn on sound
        </button>
      )}
    </>
  );
}

/** Text box and send; `mic` adds the mic toggle beside the send button. */
export function Composer({ call, mic }: { call: Call; mic: boolean }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (message && (await call.send(message))) setText("");
  };
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm transition-shadow focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-200"
    >
      <label htmlFor="copilot-question" className="sr-only">
        Ask a question
      </label>
      <input
        id="copilot-question"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask about sales, stock, discounts…"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus-visible:outline-none"
      />
      {mic && (
        <button
          type="button"
          onClick={() => void call.toggleMic()}
          disabled={call.connecting}
          aria-pressed={call.micOn}
          aria-label="Microphone"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg disabled:opacity-60 ${
            call.micOn ? "bg-red-600 text-white hover:bg-red-700" : "text-slate-700 hover:bg-slate-100 hover:text-brand-800"
          }`}
        >
          {call.micOn ? <MicOff aria-hidden className="h-4.5 w-4.5" /> : <Mic aria-hidden className="h-4.5 w-4.5" />}
        </button>
      )}
      <button
        type="submit"
        disabled={call.connecting || !text.trim()}
        aria-label="Send"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-white shadow-sm hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
      >
        {call.connecting ? (
          <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <ArrowUp aria-hidden className="h-4.5 w-4.5" />
        )}
      </button>
    </form>
  );
}

/**
 * Grid placement: `flex`/`hidden` per breakpoint for a column that shows on phones when
 * `phone` is true, on tablets (md to xl) when `tablet` is true, and always from xl.
 * Literal strings, so Tailwind sees every class.
 */
export function visibility(phone: boolean, tablet: boolean): string {
  if (phone) return tablet ? "flex" : "flex md:hidden xl:flex";
  return tablet ? "hidden md:flex" : "hidden xl:flex";
}

/** One segment of a segmented control (`tabStrip`). */
export function Tab({
  pressed,
  onClick,
  children,
  className = "",
  controls,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  controls?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-controls={controls}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        pressed ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Count({ n, strong = false, label }: { n: number; strong?: boolean; label: string }) {
  if (!n) return null;
  return (
    <span
      className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${
        strong ? "bg-brand-700 text-white" : "bg-slate-200 text-slate-700"
      }`}
    >
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export const tabStrip = "shrink-0 gap-1 rounded-xl bg-slate-200/60 p-1";

/** Products from the last answer, or a note that they will show here. */
export function ProductsPanel({
  products,
  linkTarget,
  bare = false,
}: {
  products: ProductCard[];
  linkTarget: "_top" | "_blank";
  /** Already inside a card: no card of its own, centred in it. */
  bare?: boolean;
}) {
  return products.length ? (
    <ProductCards products={products} linkTarget={linkTarget} />
  ) : (
    <EmptyState icon={<Package className="h-5 w-5" />} title="No products yet" className={bare ? "h-full" : `${surface} py-10`}>
      Products the copilot talks about show here, with price and stock.
    </EmptyState>
  );
}

type SideTab = "changes" | "products";
type PhoneTab = "chat" | "side";

interface Props {
  /** The header's title (the product), with `subtitle` (the store) under it. */
  title: string;
  subtitle?: string;
  /** Starts a billed call; called on the first message or mic tap only, and to go on
   *  with the conversation after a call reached its time limit. */
  start: StartCall;
  /** Show the in-page mic toggle (only where the browser allows the microphone). */
  micInline: boolean;
  /** Where the mic is not allowed: open voice elsewhere, after ending this page's call.
   *  Resolves to a message to show when that did not work. */
  onTalkByVoice?: (endCall: () => Promise<void>) => Promise<string | null>;
  /** Next to the title (the plan). */
  headerExtra?: ReactNode;
  /** The settings drawer, opened from the header: approvals. */
  settings?: ReactNode;
  /** A dot on the settings button (setup waiting). */
  settingsAttention?: boolean;
  /** Above the conversation: the first-run checklist. */
  checklist?: ReactNode;
  /** Right column: the proposed changes. */
  changes?: ReactNode;
  /** Ids of changes waiting for approval, first one first. */
  pending?: string[];
  /** Open on the changes (a link to one proposal). */
  startOnChanges?: boolean;
  /** How product links open: `_top` inside Shopify admin, `_blank` elsewhere. */
  linkTarget?: "_top" | "_blank";
}

/**
 * The admin panel: conversation left, changes and products right; settings in a drawer
 * from the header. Each column scrolls on its own; the page itself does not scroll.
 * Phones get one column at a time behind a tab bar.
 */
export default function Conversation({
  title,
  subtitle,
  start,
  micInline,
  onTalkByVoice,
  headerExtra,
  settings,
  settingsAttention = false,
  checklist,
  changes,
  pending = [],
  startOnChanges = false,
  linkTarget = "_top",
}: Props) {
  const call = useCall(start);
  const hasSettings = Boolean(settings);
  const hasChanges = Boolean(changes);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>(startOnChanges ? "side" : "chat");
  const [sideTab, setSideTab] = useState<SideTab>(hasChanges ? "changes" : "products");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const waiting = pending.length;
  const products = call.products;

  // A new change waiting for approval comes to the front; new products show when nothing waits.
  const waitingBefore = useRef(waiting);
  useEffect(() => {
    if (waiting > waitingBefore.current) setSideTab("changes");
    waitingBefore.current = waiting;
  }, [waiting]);
  useEffect(() => {
    if (products.length && !waitingBefore.current) setSideTab("products");
  }, [products]);

  const showChanges = () => {
    setPhoneTab("side");
    setSideTab("changes");
    window.setTimeout(() => {
      const card = document.getElementById(`card-${pending[0]}`);
      card?.scrollIntoView({ block: "nearest" });
      card?.focus({ preventScroll: true });
    }, 0);
  };

  const talkByVoice = async () => {
    call.setError("");
    const message = await onTalkByVoice?.(call.end);
    if (message) call.setError(message);
  };

  const side = (tab: SideTab) => {
    setSideTab(tab);
    setPhoneTab("side");
  };
  const showingChanges = hasChanges && sideTab === "changes";
  // The "waiting" pill: wherever the changes are out of sight.
  const pillShown = sideTab === "products" ? "flex" : "flex md:hidden";
  const status = call.live ? "live" : call.connecting ? "connecting" : "idle";

  // The panel fills the frame exactly; only the columns scroll. Their bottom padding
  // (--copilot-overlay) keeps the last card clear of Shopify's floating Sidekick bar.
  const scroller = "min-h-0 overflow-y-auto overscroll-contain px-0.5 pt-0.5 pb-[var(--copilot-overlay)] scroll-pb-[var(--copilot-overlay)]";
  return (
    <div className="copilot-fill copilot-panel mx-auto flex h-dvh max-w-[1440px] flex-col gap-2 overflow-hidden p-2 text-slate-800 md:gap-3 md:p-3">
      <AppHeader
        title={title}
        subtitle={subtitle}
        badges={headerExtra}
        actions={
          <>
            <StatusDot status={status} compact />
            {call.live && (
              <button type="button" onClick={() => void call.end()} className={`${btn.secondary} px-2.5 py-1`}>
                <PhoneOff aria-hidden className="h-3.5 w-3.5" />
                End
              </button>
            )}
            {hasSettings && (
              <button
                ref={settingsButton}
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
                aria-label={settingsAttention ? "Settings (needs setup)" : "Settings"}
                className={`${btn.ghost} relative h-8 w-8 p-0`}
              >
                <Settings2 aria-hidden className="h-4.5 w-4.5" />
                {settingsAttention && (
                  <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" />
                )}
              </button>
            )}
          </>
        }
      />

      <p role="status" className="sr-only">
        {call.announcement}
      </p>

      {/* Phones: one column at a time. */}
      <nav aria-label="Panel sections" className={`flex md:hidden ${tabStrip}`}>
        <Tab pressed={phoneTab === "chat"} onClick={() => setPhoneTab("chat")} controls="copilot-chat">
          Chat
        </Tab>
        {hasChanges && (
          <Tab pressed={phoneTab === "side" && sideTab === "changes"} onClick={() => side("changes")} controls="copilot-side">
            Changes <Count n={waiting} strong label="waiting" />
          </Tab>
        )}
        <Tab pressed={phoneTab === "side" && sideTab === "products"} onClick={() => side("products")} controls="copilot-side">
          Products <Count n={products.length} label="products" />
        </Tab>
      </nav>

      {/* The columns: they take the rest of the frame, down to its bottom edge. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <main
          id="copilot-chat"
          className={`col-[1] row-[1] min-h-0 flex-col overflow-hidden md:row-[1/3] ${surface} ${visibility(phoneTab === "chat", true)}`}
        >
          <Transcript
            call={call}
            lead={checklist}
            help={
              micInline
                ? "Ask about sales, orders, stock or discounts. Type, or tap the mic and talk."
                : "Ask about sales, orders, stock or discounts, in your own words and language."
            }
          />
          <div className="flex shrink-0 flex-col border-t border-slate-200 bg-slate-50/60 px-3 pt-3 pb-[calc(0.75rem+var(--copilot-overlay))] sm:px-4">
            {hasChanges && waiting > 0 && (
              <button
                type="button"
                onClick={showChanges}
                className={`${pillShown} mb-2 items-center gap-2 self-center rounded-full bg-brand-700 px-3 py-1 text-sm font-medium text-white shadow-sm hover:bg-brand-800`}
              >
                <span className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
                {waiting === 1 ? "1 change waiting" : `${waiting} changes waiting`} for approval
              </button>
            )}
            <CallNotices call={call} />
            <Composer call={call} mic={micInline} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="flex items-center gap-1.5 text-xs text-slate-600">
                <ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                Nothing in your store changes unless you approve it.
              </p>
              {onTalkByVoice && (
                <button type="button" onClick={() => void talkByVoice()} className={`${btn.secondary} px-2.5 py-1 text-xs`}>
                  <Mic aria-hidden className="h-3.5 w-3.5" />
                  Talk by voice (opens a new tab)
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Right column switcher (tablets and up). */}
        <nav aria-label="Right column" className={`col-[2] row-[1] hidden md:flex ${tabStrip}`}>
          {hasChanges && (
            <Tab pressed={sideTab === "changes"} onClick={() => setSideTab("changes")} controls="copilot-side">
              Changes <Count n={waiting} strong label="waiting" />
            </Tab>
          )}
          <Tab pressed={sideTab === "products"} onClick={() => setSideTab("products")} controls="copilot-side">
            Products <Count n={products.length} label="products" />
          </Tab>
        </nav>

        <div
          id="copilot-side"
          className={`col-[1] row-[1] flex-col md:col-[2] md:row-[2] ${scroller} ${visibility(phoneTab === "side", true)}`}
        >
          {hasChanges && <div className={showingChanges ? "" : "hidden"}>{changes}</div>}
          <div className={showingChanges ? "hidden" : ""}>
            <ProductsPanel products={products} linkTarget={linkTarget} />
          </div>
        </div>
      </div>

      {hasSettings && (
        <Drawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Settings"
          description="How changes the copilot proposes get approved."
          returnFocus={settingsButton as RefObject<HTMLElement>}
        >
          {settings}
        </Drawer>
      )}
    </div>
  );
}
