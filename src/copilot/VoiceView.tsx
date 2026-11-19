import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, ShieldCheck } from "lucide-react";
import {
  Call,
  CallNotices,
  Composer,
  Count,
  ProductsPanel,
  StartCall,
  Tab,
  Transcript,
  tabStrip,
  useCall,
  visibility,
} from "./Conversation";
import { surface } from "./styles";
import { AppHeader, StatusDot } from "./ui";

type Phase = "idle" | "connecting" | "ready" | "muted" | "listening" | "thinking" | "speaking";

const LABEL: Record<Phase, string> = {
  idle: "Tap the mic to talk",
  connecting: "Connecting…",
  ready: "Listening…",
  muted: "Mic off",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** The line under the state: what the merchant can do now. */
const HINT: Record<Phase, string> = {
  idle: "Ask in your own words and language, or type below.",
  connecting: "Getting your copilot ready.",
  ready: "Go ahead, ask anything about your store.",
  muted: "Tap the mic to talk, or type below.",
  listening: "Take your time.",
  thinking: "Looking at your store…",
  speaking: "You can interrupt any time.",
};

/** Examples that send themselves from the empty transcript. */
const EXAMPLES = ["What's out of stock?", "How were sales this week?", "Top products this month", "Suggest a discount"];

/**
 * What the orb shows. The agent's own state (`lk.agent.state`) when it publishes one;
 * otherwise who LiveKit hears speaking, and "thinking" while the merchant's last line
 * has no answer yet.
 */
function phaseOf(call: Call): Phase {
  if (!call.live) return call.connecting ? "connecting" : "idle";
  const { agentState, agentSpeaking, userSpeaking } = call.activity;
  if (agentState === "speaking" || agentSpeaking) return "speaking";
  if (userSpeaking) return "listening";
  if (agentState === "thinking") return "thinking";
  if (agentState === "initializing") return "connecting";
  if (!agentState && call.lines.length && !call.lines[call.lines.length - 1].fromAgent) return "thinking";
  return call.micOn ? "ready" : "muted";
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The voice orb. Scales with the live audio level of whoever is talking (read every
 * frame from LiveKit, written straight to the element, no re-render); breathes, ripples
 * or spins by phase. With reduced motion it only changes colour and label.
 */
function Orb({ call, phase }: { call: Call; phase: Phase }) {
  const core = useRef<HTMLDivElement>(null);
  const talking = phase === "speaking" || phase === "listening";
  const working = phase === "thinking" || phase === "connecting";

  useEffect(() => {
    const el = core.current;
    if (!el || !talking || reducedMotion()) return;
    let level = 0;
    let frame = 0;
    const tick = () => {
      const levels = call.voice.current?.levels();
      const target = levels ? (phase === "speaking" ? levels.agent : levels.user) : 0;
      level += (Math.min(1, target * 1.6) - level) * 0.2; // smoothed: LiveKit updates a few times a second
      el.style.transform = `scale(${1 + level * 0.35})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [talking, phase, call.voice]);

  const colour =
    phase === "speaking"
      ? "from-brand-500 via-brand-violet to-brand-900"
      : phase === "listening" || phase === "ready"
        ? "from-brand-300 via-brand-600 to-brand-800"
        : phase === "thinking"
          ? "from-brand-200 via-brand-600 to-brand-violet"
          : phase === "connecting"
            ? "from-brand-100 via-brand-400 to-brand-600"
            : "from-brand-100 via-brand-300 to-brand-600";
  const ring = phase === "speaking" ? "bg-brand-violet/25" : "bg-brand-400/30";

  return (
    <div aria-hidden data-phase={phase} className="relative grid h-32 w-32 shrink-0 place-items-center sm:h-44 sm:w-44 lg:h-56 lg:w-56">
      {/* Soft halo, always there so the idle orb does not float in a void. */}
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--color-brand-100)_0%,transparent_70%)]" />
      {talking && (
        <>
          <span className={`absolute inset-[18%] rounded-full motion-safe:animate-ripple ${ring}`} />
          <span className={`absolute inset-[18%] rounded-full motion-safe:animate-ripple-late ${ring}`} />
        </>
      )}
      {working && (
        <span
          className={`absolute inset-[8%] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,var(--color-brand-600)_120deg,transparent_240deg)] opacity-70 [mask:radial-gradient(circle,transparent_62%,#000_63%)] ${
            phase === "connecting" ? "motion-safe:animate-orbit-slow" : "motion-safe:animate-orbit"
          }`}
        />
      )}
      <div className={talking ? "" : phase === "idle" || phase === "muted" ? "motion-safe:animate-breathe-slow" : "motion-safe:animate-breathe"}>
        <div
          ref={core}
          className={`h-20 w-20 rounded-full bg-gradient-to-br shadow-[0_12px_40px_-8px_var(--color-brand-600)] transition-[background-color,opacity] duration-300 will-change-transform sm:h-28 sm:w-28 lg:h-36 lg:w-36 ${colour} ${
            phase === "muted" ? "opacity-70" : ""
          }`}
        >
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.6),transparent_55%)]" />
        </div>
      </div>
    </div>
  );
}

/** Seconds since the call went live, as m:ss (0:00 while not live). */
function useCallTime(live: boolean): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!live) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The top-level voice page: orb and controls left, transcript in the middle, products
 * right. Tablets put the orb in a band above the transcript and products; phones show
 * the orb band on top and the transcript or the products below it.
 */
export default function VoiceView({ title, start }: { title: string; start: StartCall }) {
  const call = useCall(start, true);
  const [tab, setTab] = useState<"chat" | "products">("chat");
  const phase = phaseOf(call);
  const products = call.products;
  const time = useCallTime(call.live);
  const status = call.live ? "live" : call.connecting ? "connecting" : "idle";

  // The page fills the tab exactly; only the transcript and the products scroll.
  return (
    <div className="copilot-fill mx-auto flex h-dvh max-w-[1440px] flex-col gap-2 overflow-hidden p-2 text-slate-800 md:gap-3 md:p-3">
      <AppHeader
        title={title}
        subtitle="Talk in your own words and language."
        actions={
          <>
            <StatusDot status={status} />
            {call.live && (
              <span className="hidden font-mono text-xs tabular-nums text-slate-600 sm:inline" aria-label={`Call time ${time}`}>
                {time}
              </span>
            )}
          </>
        }
      />

      <p role="status" className="sr-only">
        {call.announcement}
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-[auto_minmax(0,1fr)] md:gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_380px]">
        <section
          aria-label="Voice"
          className={`col-[1] row-[1] flex flex-row items-center gap-4 overflow-hidden bg-gradient-to-b from-white to-brand-50/60 p-3 sm:gap-6 md:col-span-2 md:justify-center md:p-4 lg:col-span-1 lg:min-h-0 lg:flex-col lg:justify-center lg:gap-6 lg:overflow-y-auto lg:p-6 ${surface}`}
        >
          <Orb call={call} phase={phase} />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-3 md:flex-none lg:items-center">
            <div className="min-w-0 lg:text-center">
              <p className="text-base font-semibold text-slate-900 sm:text-lg">{LABEL[phase]}</p>
              <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{HINT[phase]}</p>
              {call.live && (
                <p className="mt-1 font-mono text-xs tabular-nums text-slate-600 sm:hidden" aria-hidden>
                  {time}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void call.toggleMic()}
                disabled={call.connecting}
                aria-pressed={call.micOn}
                aria-label="Microphone"
                className={`grid h-14 w-14 place-items-center rounded-full text-white shadow-lg transition-colors disabled:opacity-60 sm:h-16 sm:w-16 lg:h-[4.5rem] lg:w-[4.5rem] ${
                  call.micOn ? "bg-red-600 shadow-red-600/30 hover:bg-red-700" : "bg-brand-700 shadow-brand-700/30 hover:bg-brand-800"
                }`}
              >
                {call.micOn ? <MicOff aria-hidden className="h-6 w-6 sm:h-7 sm:w-7" /> : <Mic aria-hidden className="h-6 w-6 sm:h-7 sm:w-7" />}
              </button>
              <button
                type="button"
                onClick={() => void call.end()}
                disabled={!call.live}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PhoneOff aria-hidden className="h-4 w-4" />
                End call
              </button>
            </div>
            <div className="flex max-w-xs flex-col items-start lg:items-center">
              <CallNotices call={call} />
            </div>
            <p className="hidden items-center gap-1.5 text-xs text-slate-600 lg:flex">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-emerald-700" />
              Nothing in your store changes unless you approve it.
            </p>
          </div>
        </section>

        <nav aria-label="Page sections" className={`col-[1] row-[2] flex md:hidden ${tabStrip}`}>
          <Tab pressed={tab === "chat"} onClick={() => setTab("chat")} controls="voice-transcript">
            Transcript
          </Tab>
          <Tab pressed={tab === "products"} onClick={() => setTab("products")} controls="voice-products">
            Products <Count n={products.length} label="products" />
          </Tab>
        </nav>

        <main
          id="voice-transcript"
          className={`col-[1] row-[3] min-h-0 flex-col overflow-hidden md:row-[2] lg:col-[2] lg:row-[1] ${surface} ${visibility(
            tab === "chat",
            true,
          )}`}
        >
          <h2 className="hidden shrink-0 border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900 md:block">Transcript</h2>
          <Transcript
            call={call}
            title="Start a conversation"
            help="Tap the mic and start talking, or type a question below. Try one of these:"
            suggestions={EXAMPLES}
          />
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 p-3">
            <Composer call={call} mic={false} />
          </div>
        </main>

        <aside
          id="voice-products"
          aria-label="Products"
          className={`col-[1] row-[3] min-h-0 flex-col overflow-hidden md:col-[2] md:row-[2] lg:col-[3] lg:row-[1] ${surface} ${visibility(
            tab === "products",
            true,
          )}`}
        >
          <h2 className="hidden shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900 md:flex">
            Products <Count n={products.length} label="products" />
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <ProductsPanel products={products} linkTarget="_blank" bare />
          </div>
        </aside>
      </div>
    </div>
  );
}
