import { FormEvent, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import ProductCards, { ProductCard, useProductCards } from "./ProductCards";
import { EndReason, PreviousLine, endedAtLimit, previousLines, shouldContinue } from "./continuation";
import type { Activity, CopilotVoice, Connection, Line } from "./voice";

export interface SessionInfo extends Connection {
  agent_name: string;
  /** The call limit Agni enforces (seconds); the conversation goes on in a new call after it. */
  max_seconds?: number;
}

export type StartResult = { ok: true; session: SessionInfo } | { ok: false; message: string };

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

/**
 * One copilot conversation: transcript, text and mic. Nothing starts (no call, no mic prompt)
 * until the merchant sends a message or taps the mic; each start is one call. When the server
 * ends a call at its time limit, the next call starts by itself with the transcript carried
 * over (continuation.ts), keeping the merchant's mic choice; after MAX_AUTO_CONTINUATIONS, or
 * when that start fails, a Continue button does the same.
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
  /** Release token of the call that ended last: what a Continue carries over. */
  const lastCall = useRef("");
  /** Automatic continuations on this page. */
  const continued = useRef(0);

  useEffect(() => () => void voice.current?.disconnect(), []);

  const addLine = (line: Line) =>
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i === -1) return [...prev, line];
      const next = [...prev];
      next[i] = line; // a transcription segment refined while it is spoken
      return next;
    });

  const carryOver = (): Continuation => ({
    previous: previousLines(linesNow.current),
    continues: lastCall.current,
  });

  const open = async (continuation?: Continuation): Promise<CopilotVoice | null> => {
    setConnecting(true);
    setReconnecting(Boolean(continuation));
    setCanContinue(false);
    setError("");
    try {
      const result = await start(continuation);
      if (!result.ok) {
        setError(result.message);
        if (continuation) setCanContinue(true);
        return null;
      }
      const startedAt = Date.now();
      const maxSeconds = result.session.max_seconds ?? 0;
      const { connect } = await import("./voice");
      const session = await connect(result.session, {
        onLine: addLine,
        onAudioBlocked: setAudioBlocked,
        onActivity: setActivity,
        onEnded: (reason) => {
          voice.current = null;
          lastCall.current = result.session.release_token;
          setLive(false);
          setCall(null);
          setMicOn(false);
          setAudioBlocked(false);
          setActivity(QUIET);
          const ending = { reason, startedAt, endedAt: Date.now(), maxSeconds };
          if (shouldContinue({ ...ending, count: continued.current })) {
            continued.current += 1;
            setAnnouncement("Reconnecting…");
            void ensureSession(carryOver());
            return;
          }
          const atLimit = endedAtLimit(ending);
          setAnnouncement(ENDED[atLimit ? "limit" : reason]);
          if (atLimit) setCanContinue(true);
        },
      });
      voice.current = session;
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
      if (continuation) setCanContinue(true);
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

  /** The Continue button: the next call, with the conversation so far. */
  const continueCall = async () => {
    await ensureSession(carryOver());
  };

  const toggleMic = async () => {
    const session = await ensureSession();
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
    const session = await ensureSession();
    if (!session) return false;
    try {
      await session.send(message);
      addLine({ id: `you-${Date.now()}`, fromAgent: false, text: message });
      return true;
    } catch {
      setError("That message was not sent. Try again.");
      return false;
    }
  };

  const end = async () => {
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

/** The transcript; scrolls itself (not the page) to the newest line. */
export function Transcript({ call, empty }: { call: Call; empty: string }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [call.lines]);
  return (
    <section
      ref={box as RefObject<HTMLElement>}
      aria-label="Conversation"
      aria-live="polite"
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
    >
      {call.lines.length === 0 && (
        <p className="flex h-full min-h-24 items-center justify-center text-center text-sm text-slate-500">
          {call.connecting ? "Connecting…" : call.announcement || empty}
        </p>
      )}
      {call.lines.map((line) => (
        <p
          key={line.id}
          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            line.fromAgent ? "rounded-bl-sm bg-brand-50 text-slate-900" : "ml-auto rounded-br-sm bg-brand-700 text-white"
          }`}
        >
          <span className="sr-only">{line.fromAgent ? call.agentName || "Copilot" : "You"}: </span>
          {line.text}
        </p>
      ))}
    </section>
  );
}

/** Reconnecting, errors, Continue and the "turn on sound" tap, shown above the text box. */
export function CallNotices({ call }: { call: Call }) {
  return (
    <>
      {call.reconnecting && (
        <p className="mb-2 text-sm text-slate-600">Reconnecting…</p>
      )}
      {call.error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {call.error}
        </p>
      )}
      {call.canContinue && !call.connecting && (
        <div className="mb-2 flex flex-wrap items-center gap-2 self-start">
          {!call.error && <span className="text-sm text-slate-600">{call.announcement}</span>}
          <button
            type="button"
            onClick={() => void call.continueCall()}
            className="rounded-md border border-brand-700 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
          >
            Continue
          </button>
        </div>
      )}
      {call.audioBlocked && (
        <button
          type="button"
          onClick={() => void call.voice.current?.startAudio()}
          className="mb-2 flex items-center gap-2 self-start rounded-md border border-brand-700 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-50"
        >
          <Volume2 aria-hidden className="h-4 w-4" />
          Tap to turn on sound
        </button>
      )}
    </>
  );
}

/** Text box and send; `mic` adds the round mic toggle in front of it. */
export function Composer({ call, mic }: { call: Call; mic: boolean }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (message && (await call.send(message))) setText("");
  };
  return (
    <div className="flex items-center gap-3">
      {mic && (
        <button
          type="button"
          onClick={() => void call.toggleMic()}
          disabled={call.connecting}
          aria-pressed={call.micOn}
          aria-label="Microphone"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 disabled:opacity-60 ${
            call.micOn ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
          }`}
        >
          {call.micOn ? <MicOff aria-hidden className="h-5 w-5" /> : <Mic aria-hidden className="h-5 w-5" />}
        </button>
      )}
      <form onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
        <label htmlFor="copilot-question" className="sr-only">
          Ask a question
        </label>
        <input
          id="copilot-question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a question"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
        <button
          type="submit"
          disabled={call.connecting || !text.trim()}
          aria-label="Send"
          className="rounded-md bg-brand-700 px-3 text-white hover:bg-brand-800 disabled:opacity-60"
        >
          <Send aria-hidden className="h-5 w-5" />
        </button>
      </form>
    </div>
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
      className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium ${
        pressed ? "bg-white text-brand-900 shadow-sm" : "text-slate-700 hover:bg-white/60 hover:text-brand-900"
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
      className={`min-w-5 rounded-full px-1.5 text-xs leading-5 ${
        strong ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-900"
      }`}
    >
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export const tabStrip = "gap-1 rounded-lg border border-brand-100 bg-brand-50 p-1";

/** Products from the last answer, or a note that they will show here. */
export function ProductsPanel({ products, linkTarget }: { products: ProductCard[]; linkTarget: "_top" | "_blank" }) {
  return products.length ? (
    <ProductCards products={products} linkTarget={linkTarget} />
  ) : (
    <p className="rounded-xl border border-dashed border-brand-200 bg-white p-4 text-center text-sm text-slate-500">
      Products the copilot talks about show here.
    </p>
  );
}

type SideTab = "changes" | "products" | "settings";
type PhoneTab = "chat" | "side" | "settings";

interface Props {
  title: string;
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
  /** Left column: approvals and first-run setup. */
  settings?: ReactNode;
  /** A dot on the Settings tab where the column is folded away (first-run setup waiting). */
  settingsAttention?: boolean;
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
 * The admin panel: settings left, conversation in the middle, changes and products
 * right. Each column scrolls on its own; the page itself does not scroll.
 * Tablets (md to xl) fold settings into a tab of the right column; phones get one
 * column at a time behind a tab bar.
 */
export default function Conversation({
  title,
  start,
  micInline,
  onTalkByVoice,
  headerExtra,
  settings,
  settingsAttention = false,
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
  const waiting = pending.length;
  const products = call.products;

  // From xl the settings have their own column: the right one goes back to the changes.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 80rem)");
    const reset = () => wide.matches && setSideTab((t) => (t === "settings" ? "changes" : t));
    reset();
    wide.addEventListener("change", reset);
    return () => wide.removeEventListener("change", reset);
  }, []);

  // A new change waiting for approval comes to the front; new products show when nothing waits.
  const waitingBefore = useRef(waiting);
  useEffect(() => {
    if (waiting > waitingBefore.current) setSideTab((t) => (t === "products" ? "changes" : t));
    waitingBefore.current = waiting;
  }, [waiting]);
  useEffect(() => {
    if (products.length && !waitingBefore.current) setSideTab((t) => (t === "changes" ? "products" : t));
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
  const showingChanges = hasChanges && sideTab !== "products";
  // The "waiting" pill: wherever the changes are out of sight.
  const pillShown = sideTab === "products" ? "flex" : sideTab === "settings" ? "flex xl:hidden" : "flex md:hidden";

  const col3 = hasSettings ? "xl:col-[3]" : "";
  // The panel fills the frame exactly; only the columns scroll. Their bottom padding
  // (--copilot-overlay) keeps the last card clear of Shopify's floating Sidekick bar.
  const scroller = "min-h-0 overflow-y-auto overscroll-contain px-1 pt-1 pb-[var(--copilot-overlay)] scroll-pb-[var(--copilot-overlay)]";
  return (
    <div className="copilot-fill copilot-panel mx-auto flex h-dvh max-w-[1440px] flex-col gap-2 overflow-hidden p-2 text-slate-800 md:gap-3 md:p-3">
      <header className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-brand-700 to-brand-violet px-4 py-2 text-white shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="hidden truncate text-xs text-white sm:block">
            Ask about sales, orders, stock or discounts, in your own words and language.
            Nothing in your store changes unless you approve it.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {headerExtra}
          {call.live && (
            <button
              type="button"
              onClick={() => void call.end()}
              className="rounded-md border border-white/70 px-3 py-1 text-sm font-medium hover:bg-white/15 focus-visible:outline-white"
            >
              End
            </button>
          )}
        </div>
      </header>

      <p role="status" className="sr-only">
        {call.announcement}
      </p>

      {/* Phones: one column at a time. */}
      <nav aria-label="Panel sections" className={`flex shrink-0 md:hidden ${tabStrip}`}>
        <Tab pressed={phoneTab === "chat"} onClick={() => setPhoneTab("chat")} controls="copilot-chat">
          Chat
        </Tab>
        {hasChanges && (
          <Tab pressed={phoneTab === "side" && sideTab !== "products"} onClick={() => side("changes")} controls="copilot-side">
            Changes <Count n={waiting} strong label="waiting" />
          </Tab>
        )}
        <Tab pressed={phoneTab === "side" && sideTab === "products"} onClick={() => side("products")} controls="copilot-side">
          Products <Count n={products.length} label="products" />
        </Tab>
        {hasSettings && (
          <Tab pressed={phoneTab === "settings"} onClick={() => setPhoneTab("settings")} controls="copilot-settings">
            Settings
            {settingsAttention && <span aria-label="needs setup" className="h-2 w-2 rounded-full bg-brand-600" />}
          </Tab>
        )}
      </nav>

      {/* The columns: they take the rest of the frame, down to its bottom edge. */}
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_minmax(0,1fr)] md:gap-4 ${
          hasSettings ? "xl:grid-cols-[300px_minmax(0,1fr)_360px]" : "lg:grid-cols-[minmax(0,1fr)_380px]"
        }`}
      >
        {hasSettings && (
          <aside
            id="copilot-settings"
            aria-label="Settings"
            className={`@container col-[1] row-[1] flex-col gap-3 md:col-[2] md:row-[2] xl:col-[1] xl:row-[1/3] ${scroller} ${visibility(
              phoneTab === "settings",
              sideTab === "settings",
            )}`}
          >
            {settings}
          </aside>
        )}

        <main
          id="copilot-chat"
          className={`col-[1] row-[1] min-h-0 flex-col overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm md:row-[1/3] ${
            hasSettings ? "xl:col-[2]" : ""
          } ${visibility(phoneTab === "chat", true)}`}
        >
          <Transcript
            call={call}
            empty={micInline ? "Tap the mic or type a question to start." : "Type a question to start."}
          />
          <div className="flex shrink-0 flex-col border-t border-brand-100 bg-brand-50/50 p-3 pb-[calc(0.75rem+var(--copilot-overlay))]">
            {hasChanges && waiting > 0 && (
              <button
                type="button"
                onClick={showChanges}
                className={`${pillShown} mb-2 items-center gap-2 self-center rounded-full bg-brand-700 px-3 py-1 text-sm font-medium text-white shadow-sm hover:bg-brand-800`}
              >
                <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                {waiting === 1 ? "1 change waiting" : `${waiting} changes waiting`} for approval
              </button>
            )}
            <CallNotices call={call} />
            <Composer call={call} mic={micInline} />
            {onTalkByVoice && (
              <button
                type="button"
                onClick={() => void talkByVoice()}
                className="mt-2 flex items-center justify-center gap-2 rounded-md border border-brand-700 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
              >
                <Mic aria-hidden className="h-4 w-4" />
                Talk by voice (opens a new tab)
              </button>
            )}
          </div>
        </main>

        {/* Right column switcher (tablets and up). */}
        <nav aria-label="Right column" className={`col-[2] row-[1] hidden md:flex ${col3} ${tabStrip}`}>
          {hasChanges && (
            <Tab pressed={sideTab === "changes"} onClick={() => setSideTab("changes")} controls="copilot-side">
              Changes <Count n={waiting} strong label="waiting" />
            </Tab>
          )}
          <Tab pressed={sideTab === "products"} onClick={() => setSideTab("products")} controls="copilot-side">
            Products <Count n={products.length} label="products" />
          </Tab>
          {hasSettings && (
            <Tab
              pressed={sideTab === "settings"}
              onClick={() => setSideTab("settings")}
              controls="copilot-settings"
              className="xl:hidden"
            >
              Settings
              {settingsAttention && <span aria-label="needs setup" className="h-2 w-2 rounded-full bg-brand-600" />}
            </Tab>
          )}
        </nav>

        <div
          id="copilot-side"
          className={`col-[1] row-[1] flex-col md:col-[2] md:row-[2] ${col3} ${scroller} ${visibility(
            phoneTab === "side",
            sideTab !== "settings",
          )}`}
        >
          {hasChanges && <div className={showingChanges ? "" : "hidden"}>{changes}</div>}
          <div className={showingChanges ? "hidden" : ""}>
            <ProductsPanel products={products} linkTarget={linkTarget} />
          </div>
        </div>
      </div>
    </div>
  );
}
