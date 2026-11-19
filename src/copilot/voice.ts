// Loaded on first use, so LiveKit stays out of the initial bundle. Same room
// protocol as AgniCompanyWidget: agent speech arrives as transcriptions, typed
// text goes out on the "lk.chat" topic.
//
// Calls are billed, so a call ends itself after IDLE_MS without any transcript
// or chat activity (also while the page is in the background: the merchant often
// talks while looking at Shopify admin in another tab, so being hidden alone never
// ends a call). Ending
// always tells the backend (release token), which frees the one-call-per-staff hold;
// `onEnded` is called once that is done, so a next call started from it finds the
// hold free. Its reason says who ended the call: the merchant ("user": disconnect(),
// the End button), the quiet timer ("idle"), or the server/agent ("closed", e.g. the
// call limit -- see continuation.ts).
import { Room, RoomEvent, Track } from "livekit-client";
import { SNOWIE_API_ORIGIN } from "../config";
import type { EndReason } from "./continuation";

const IDLE_MS = 2 * 60 * 1000;

export interface Connection {
  server_url: string;
  participant_token: string;
  release_token: string;
}

export interface Line {
  id: string;
  fromAgent: boolean;
  text: string;
  /** False while a transcription segment is still being spoken (refined later). */
  final?: boolean;
}

/** What the voice agent reports it is doing (LiveKit agents' `lk.agent.state` attribute). */
export type AgentState = "initializing" | "listening" | "thinking" | "speaking";

/** Who is talking now, from LiveKit's active-speaker updates. */
export interface Activity {
  /** Null when the agent does not publish its state. */
  agentState: AgentState | null;
  agentSpeaking: boolean;
  userSpeaking: boolean;
}

export interface Handlers {
  onLine(line: Line): void;
  /** The room is gone (before the hold is released): the call is no longer live. */
  onDisconnected?(): void;
  onEnded(reason: EndReason): void;
  onAudioBlocked(blocked: boolean): void;
  onActivity?(activity: Activity): void;
}

export interface CopilotVoice {
  setMic(on: boolean): Promise<void>;
  send(text: string): Promise<void>;
  startAudio(): Promise<void>;
  disconnect(): Promise<void>;
  /** Current audio levels (0 to 1) for a visual; updated by LiveKit a few times a second. */
  levels(): { user: number; agent: number };
}

const RELEASE_WAIT_MS = 5000;

function release(token: string): Promise<void> {
  const sent = fetch(`${SNOWIE_API_ORIGIN}/api/copilot/panel/call/`, {
    method: "POST",
    credentials: "omit",
    keepalive: true, // still sent if the page is closing
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ release: token }),
  }).then(
    () => undefined,
    () => undefined,
  );
  // Never wait on it for long: the hold also expires by itself.
  return Promise.race([sent, new Promise<void>((done) => window.setTimeout(done, RELEASE_WAIT_MS))]);
}

export async function connect(connection: Connection, handlers: Handlers): Promise<CopilotVoice> {
  const room = new Room();
  const audio: HTMLMediaElement[] = [];
  let reason: EndReason = "closed"; // unless we end it: the server or the agent did
  let ended = false;
  let released: Promise<void> | null = null;
  let idleTimer = 0;

  const end = (why: EndReason) => {
    if (!ended) reason = why;
    void room.disconnect();
  };
  const touch = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => end("idle"), IDLE_MS);
  };

  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    touch();
    for (const segment of segments) {
      const text = segment.text.trim();
      if (text) handlers.onLine({ id: segment.id, fromAgent: !participant?.isLocal, text, final: segment.final });
    }
  });
  room.registerTextStreamHandler("lk.chat", async (reader, from) => {
    touch();
    const text = (await reader.readAll()).trim();
    if (text && from.identity !== room.localParticipant.identity) {
      handlers.onLine({ id: reader.info.id, fromAgent: true, text });
    }
  });
  const agent = () => {
    const remote = [...room.remoteParticipants.values()];
    return remote.find((p) => p.isAgent) ?? remote[0];
  };
  const report = () => {
    const a = agent();
    const state = a?.attributes["lk.agent.state"];
    handlers.onActivity?.({
      agentState: state ? (state as AgentState) : null,
      agentSpeaking: Boolean(a?.isSpeaking),
      userSpeaking: room.localParticipant.isSpeaking,
    });
  };
  room.on(RoomEvent.ActiveSpeakersChanged, report);
  room.on(RoomEvent.ParticipantAttributesChanged, report);
  room.on(RoomEvent.ParticipantConnected, report);
  room.on(RoomEvent.ParticipantDisconnected, report);

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach();
    document.body.appendChild(element);
    audio.push(element);
  });
  room.on(RoomEvent.AudioPlaybackStatusChanged, () =>
    handlers.onAudioBlocked(!room.canPlaybackAudio),
  );
  room.on(RoomEvent.Disconnected, () => {
    if (ended) return;
    ended = true;
    window.clearTimeout(idleTimer);
    audio.splice(0).forEach((el) => el.remove());
    handlers.onDisconnected?.();
    released ??= release(connection.release_token);
    const why = reason;
    void released.then(() => handlers.onEnded(why));
  });

  try {
    await room.connect(connection.server_url, connection.participant_token);
  } catch (error) {
    await room.disconnect();
    released ??= release(connection.release_token);
    throw error;
  }
  touch();
  report();
  try {
    await room.startAudio();
  } catch {
    handlers.onAudioBlocked(true); // the page offers a "turn on sound" tap
  }

  return {
    async setMic(on) {
      await room.localParticipant.setMicrophoneEnabled(on);
      touch();
    },
    async send(text) {
      await room.localParticipant.sendText(text, { topic: "lk.chat" });
      touch();
    },
    async startAudio() {
      await room.startAudio();
      handlers.onAudioBlocked(!room.canPlaybackAudio);
    },
    async disconnect() {
      if (!ended) reason = "user";
      await room.disconnect();
      await released;
    },
    levels() {
      return { user: room.localParticipant.audioLevel || 0, agent: agent()?.audioLevel || 0 };
    },
  };
}
