import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import {
  Call,
  CallNotices,
  Composer,
  Count,
  ProductsPanel,
  StartResult,
  Tab,
  Transcript,
  tabStrip,
  useCall,
  visibility,
} from "./Conversation";

type Phase = "idle" | "connecting" | "ready" | "muted" | "listening" | "thinking" | "speaking";

const LABEL: Record<Phase, string> = {
  idle: "Tap to talk",
  connecting: "Connecting…",
  ready: "Listening…",
  muted: "Mic off. Tap to talk or type below",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

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
      ? "from-brand-600 via-brand-violet to-brand-900"
      : phase === "listening" || phase === "ready"
        ? "from-brand-300 via-brand-600 to-brand-800"
        : phase === "thinking"
          ? "from-brand-200 via-brand-600 to-brand-violet"
          : "from-brand-100 via-brand-300 to-brand-600";

  return (
    <div aria-hidden className="relative grid h-36 w-36 shrink-0 place-items-center sm:h-60 sm:w-60">
      {talking && (
        <>
          <span className="absolute inset-6 rounded-full bg-brand-300/40 motion-safe:animate-ripple" />
          <span className="absolute inset-6 rounded-full bg-brand-300/30 motion-safe:animate-ripple-late" />
        </>
      )}
      {(phase === "thinking" || phase === "connecting") && (
        <span className="absolute inset-3 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,var(--color-brand-600)_120deg,transparent_240deg)] opacity-70 motion-safe:animate-[spin_1.6s_linear_infinite]" />
      )}
      <div className={talking ? "" : "motion-safe:animate-breathe"}>
        <div
          ref={core}
          className={`h-24 w-24 rounded-full bg-gradient-to-br shadow-[0_10px_40px_-8px_var(--color-brand-600)] transition-[background-color] duration-300 will-change-transform sm:h-40 sm:w-40 ${colour}`}
        >
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),transparent_55%)]" />
        </div>
      </div>
    </div>
  );
}

/**
 * The top-level voice page: orb and mic left, transcript in the middle, products
 * right. Tablets put the orb above the transcript; phones show the orb on top and
 * the transcript or the products below it.
 */
export default function VoiceView({ title, start }: { title: string; start: () => Promise<StartResult> }) {
  const call = useCall(start, true);
  const [tab, setTab] = useState<"chat" | "products">("chat");
  const phase = phaseOf(call);
  const products = call.products;

  // The page fills the tab exactly; only the transcript and the products scroll.
  return (
    <div className="copilot-fill mx-auto flex h-dvh max-w-[1440px] flex-col gap-2 overflow-hidden p-2 text-slate-800 md:gap-3 md:p-3">
      <header className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-brand-700 to-brand-violet px-4 py-2 text-white shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="hidden truncate text-xs text-white sm:block">
            Talk in your own words and language. Nothing in your store changes unless you approve it.
          </p>
        </div>
      </header>

      <p role="status" className="sr-only">
        {call.announcement}
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_minmax(0,1fr)] md:gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)]">
        <section
          aria-label="Voice"
          className="col-[1] row-[1] flex flex-col items-center justify-center gap-3 rounded-xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-3 shadow-sm md:flex-row md:gap-6 lg:min-h-0 lg:flex-col lg:justify-start lg:gap-5 lg:overflow-y-auto lg:p-4 lg:pt-[8vh]"
        >
          <Orb call={call} phase={phase} />
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-base font-medium text-brand-900">{LABEL[phase]}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void call.toggleMic()}
                disabled={call.connecting}
                aria-pressed={call.micOn}
                aria-label="Microphone"
                className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 disabled:opacity-60 sm:h-20 sm:w-20 ${
                  call.micOn ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
                }`}
              >
                {call.micOn ? <MicOff aria-hidden className="h-8 w-8" /> : <Mic aria-hidden className="h-8 w-8" />}
              </button>
              {call.live && (
                <button
                  type="button"
                  onClick={() => void call.end()}
                  className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  <PhoneOff aria-hidden className="h-4 w-4" />
                  End
                </button>
              )}
            </div>
            <div className="flex flex-col items-center">
              <CallNotices call={call} />
            </div>
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
          className={`col-[1] row-[3] min-h-0 flex-col overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm md:row-[2] lg:col-[2] lg:row-[1] ${visibility(
            tab === "chat",
            true,
          )}`}
        >
          <h2 className="shrink-0 border-b border-brand-100 px-4 py-2 text-sm font-medium text-slate-700">Transcript</h2>
          <Transcript call={call} empty="Tap the mic and start talking, or type a question below." />
          <div className="shrink-0 border-t border-brand-100 bg-brand-50/50 p-3">
            <Composer call={call} mic={false} />
          </div>
        </main>

        <aside
          id="voice-products"
          aria-label="Products"
          className={`col-[1] row-[3] min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-1 md:col-[2] md:row-[1/3] lg:col-[3] lg:row-[1] ${visibility(
            tab === "products",
            true,
          )}`}
        >
          <h2 className="hidden px-1 text-sm font-medium text-slate-700 md:block">
            Products <Count n={products.length} label="products" />
          </h2>
          <ProductsPanel products={products} linkTarget="_blank" />
        </aside>
      </div>
    </div>
  );
}
