// Loaded on first use, so LiveKit stays out of the initial bundle. Same room
// protocol as AgniCompanyWidget: agent speech arrives as transcriptions, typed
// text goes out on the "lk.chat" topic.
//
// Calls are billed, so a call ends itself after IDLE_MS without any transcript
// or chat activity, and after the page has been hidden for IDLE_MS. Ending
// always tells the backend (release token), which frees the one-call-per-staff hold.
import { Room, RoomEvent, Track } from "livekit-client";
import { SNOWIE_API_ORIGIN } from "../config";

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
  onEnded(reason: "idle" | "hidden" | "closed"): void;
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

function release(token: string): Promise<void> {
  return fetch(`${SNOWIE_API_ORIGIN}/api/copilot/panel/call/`, {
    method: "POST",
    credentials: "omit",
    keepalive: true, // still sent if the page is closing
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ release: token }),
  }).then(
    () => undefined,
    () => undefined,
  );
}

export async function connect(connection: Connection, handlers: Handlers): Promise<CopilotVoice> {
  const room = new Room();
  const audio: HTMLMediaElement[] = [];
  let reason: "idle" | "hidden" | "closed" = "closed";
  let released: Promise<void> | null = null;
  let idleTimer = 0;
  let hiddenTimer = 0;

  const end = (why: typeof reason) => {
    reason = why;
    void room.disconnect();
  };
  const touch = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => end("idle"), IDLE_MS);
  };
  const onVisibility = () => {
    window.clearTimeout(hiddenTimer);
    if (document.hidden) hiddenTimer = window.setTimeout(() => end("hidden"), IDLE_MS);
  };

  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    touch();
    for (const segment of segments) {
      const text = segment.text.trim();
      if (text) handlers.onLine({ id: segment.id, fromAgent: !participant?.isLocal, text });
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
    window.clearTimeout(idleTimer);
    window.clearTimeout(hiddenTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    audio.splice(0).forEach((el) => el.remove());
    released ??= release(connection.release_token);
    handlers.onEnded(reason);
  });

  try {
    await room.connect(connection.server_url, connection.participant_token);
  } catch (error) {
    await room.disconnect();
    released ??= release(connection.release_token);
    throw error;
  }
  document.addEventListener("visibilitychange", onVisibility);
  onVisibility();
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
      await room.disconnect();
      await released;
    },
    levels() {
      return { user: room.localParticipant.audioLevel || 0, agent: agent()?.audioLevel || 0 };
    },
  };
}
