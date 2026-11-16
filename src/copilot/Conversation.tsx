import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import ProductCards, { useProductCards } from "./ProductCards";
import type { Connection, CopilotVoice, Line } from "./voice";

export interface SessionInfo extends Connection {
  agent_name: string;
}

export type StartResult = { ok: true; session: SessionInfo } | { ok: false; message: string };

interface Props {
  title: string;
  /** Starts a billed call; called on the first message or mic tap only. */
  start: () => Promise<StartResult>;
  /** Show the in-page mic toggle (only where the browser allows the microphone). */
  micInline: boolean;
  /** Turn the mic on as soon as a call starts (the voice page). */
  autoMic?: boolean;
  /** Where the mic is not allowed: open voice elsewhere, after ending this page's call.
   *  Resolves to a message to show when that did not work. */
  onTalkByVoice?: (endCall: () => Promise<void>) => Promise<string | null>;
  /** Shown under the header (the panel's proposed changes). */
  aside?: ReactNode;
  /** How product links open: `_top` inside Shopify admin, `_blank` on the voice page. */
  linkTarget?: "_top" | "_blank";
}

const ENDED: Record<string, string> = {
  idle: "The call ended after two quiet minutes.",
  hidden: "The call ended while this page was in the background.",
  closed: "The call ended.",
};

/**
 * Transcript, text box and mic. Nothing starts (no call, no mic prompt) until
 * the merchant sends a message or taps the mic; each start is one call.
 */
export default function Conversation({
  title,
  start,
  micInline,
  autoMic,
  onTalkByVoice,
  aside,
  linkTarget = "_top",
}: Props) {
  const [connecting, setConnecting] = useState(false);
  const [live, setLive] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [agentName, setAgentName] = useState("");
  const [call, setCall] = useState<string | null>(null);
  const voice = useRef<CopilotVoice | null>(null);
  const pending = useRef<Promise<CopilotVoice | null> | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const products = useProductCards(call, lines.filter((l) => l.fromAgent).length);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  useEffect(() => () => void voice.current?.disconnect(), []);

  const addLine = (line: Line) =>
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i === -1) return [...prev, line];
      const next = [...prev];
      next[i] = line; // a transcription segment refined while it is spoken
      return next;
    });

  const open = async (): Promise<CopilotVoice | null> => {
    setConnecting(true);
    setError("");
    try {
      const result = await start();
      if (!result.ok) {
        setError(result.message);
        return null;
      }
      const { connect } = await import("./voice");
      const session = await connect(result.session, {
        onLine: addLine,
        onAudioBlocked: setAudioBlocked,
        onEnded: (reason) => {
          voice.current = null;
          setLive(false);
          setCall(null);
          setMicOn(false);
          setAudioBlocked(false);
          setAnnouncement(ENDED[reason]);
        },
      });
      voice.current = session;
      setAgentName(result.session.agent_name);
      setCall(result.session.release_token);
      setLive(true);
      setAnnouncement("Connected.");
      if (autoMic) {
        await session.setMic(true);
        setMicOn(true);
      }
      return session;
    } catch {
      setError("Could not connect to the copilot. Check your connection and try again.");
      return null;
    } finally {
      setConnecting(false);
    }
  };

  // One call at a time: a double tap or a second Enter waits for the first start.
  const ensureSession = (): Promise<CopilotVoice | null> => {
    if (voice.current) return Promise.resolve(voice.current);
    pending.current ??= open().finally(() => {
      pending.current = null;
    });
    return pending.current;
  };

  const toggleMic = async () => {
    const session = await ensureSession();
    if (!session) return;
    try {
      await session.setMic(!micOn);
      setMicOn(!micOn);
    } catch {
      setError("The microphone could not be turned on. Check your browser's microphone setting.");
    }
  };

  const sendText = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    const session = await ensureSession();
    if (!session) return;
    try {
      await session.send(message);
      addLine({ id: `you-${Date.now()}`, fromAgent: false, text: message });
      setText("");
    } catch {
      setError("That message was not sent. Try again.");
    }
  };

  const end = async () => {
    await voice.current?.disconnect();
  };

  const talkByVoice = async () => {
    setError("");
    const message = await onTalkByVoice?.(end);
    if (message) setError(message);
  };

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4 text-slate-800">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-brand-700 to-brand-violet px-4 py-3 text-white shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-white">
            Ask about sales, orders, stock or discounts, in your own words and language.
            Nothing in your store changes unless you approve it.
          </p>
        </div>
        {live && (
          <button
            type="button"
            onClick={() => void end()}
            className="shrink-0 rounded-md border border-white/70 px-3 py-1.5 text-sm font-medium hover:bg-white/15 focus-visible:outline-white"
          >
            End
          </button>
        )}
      </header>
      {aside}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <section
        aria-label="Conversation"
        aria-live="polite"
        className="min-h-40 flex-1 space-y-2 overflow-y-auto rounded-xl border border-brand-100 bg-white p-3"
      >
        {lines.length === 0 && (
          <p className="text-sm text-slate-500">
            {connecting
              ? "Connecting…"
              : announcement ||
                (micInline ? "Tap the mic or type a question to start." : "Type a question to start.")}
          </p>
        )}
        {lines.map((line) => (
          <p
            key={line.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              line.fromAgent ? "bg-brand-50 text-slate-900" : "ml-auto bg-brand-700 text-white"
            }`}
          >
            <span className="sr-only">{line.fromAgent ? agentName || "Copilot" : "You"}: </span>
            {line.text}
          </p>
        ))}
        <div ref={transcriptEnd} />
      </section>

      <ProductCards products={products} linkTarget={linkTarget} />

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {audioBlocked && (
        <button
          type="button"
          onClick={() => void voice.current?.startAudio()}
          className="mt-2 flex items-center gap-2 self-start rounded-md border border-brand-700 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-50"
        >
          <Volume2 aria-hidden className="h-4 w-4" />
          Tap to turn on sound
        </button>
      )}

      <div className="mt-3 flex items-center gap-3">
        {micInline && (
          <button
            type="button"
            onClick={() => void toggleMic()}
            disabled={connecting}
            aria-pressed={micOn}
            aria-label="Microphone"
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 disabled:opacity-60 ${
              micOn ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {micOn ? (
              <MicOff aria-hidden className="h-6 w-6" />
            ) : (
              <Mic aria-hidden className="h-6 w-6" />
            )}
          </button>
        )}
        <form onSubmit={sendText} className="flex flex-1 gap-2">
          <label htmlFor="copilot-question" className="sr-only">
            Ask a question
          </label>
          <input
            id="copilot-question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a question"
            autoComplete="off"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
          <button
            type="submit"
            disabled={connecting || !text.trim()}
            aria-label="Send"
            className="rounded-md bg-brand-700 px-3 text-white hover:bg-brand-800 disabled:opacity-60"
          >
            <Send aria-hidden className="h-5 w-5" />
          </button>
        </form>
      </div>
      {onTalkByVoice && (
        <button
          type="button"
          onClick={() => void talkByVoice()}
          className="mt-3 flex items-center justify-center gap-2 rounded-md border border-brand-700 px-4 py-2 text-brand-800 hover:bg-brand-50"
        >
          <Mic aria-hidden className="h-5 w-5" />
          Talk by voice (opens a new tab)
        </button>
      )}
    </main>
  );
}
