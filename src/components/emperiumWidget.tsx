import React, { useState, useEffect, useRef } from "react";
import EventEmitter from "eventemitter3";
import { useWidgetContext } from "../constexts/WidgetContext";
import {
  Mic,
  Send,
  Loader2,
  X,
  Minimize2,
  Volume2,
  VolumeX,
  MicOff,
  Download,
  FileText,
} from "lucide-react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import {
  RoomAudioRenderer,
  useConnectionState,
  useRoomContext,
  useTranscriptions,
  useChat,
} from "@livekit/components-react";
import {
  DataPacket_Kind,
  RemoteParticipant,
  RoomEvent,
  RpcError,
  RpcInvocationData,
  Track,
} from "livekit-client";
import axios from "axios";

export interface WidgetTheme {
  bot_auto_start: boolean;
  bot_position: string;
  agent_mute: boolean;
  widget_heading: string;
  bot_logo: string | null;
  svg_logo: string | null;
  bot_height: string | null;
  bot_width: string | null;
  bot_show_transcript: boolean;
  bot_show_chat: boolean;
  bot_mute_on_tab_change: boolean;
  bot_mute_on_minimize: boolean;
  bot_bubble_color: string;
  bot_background_color: string;
  bot_icon_color: string;
  bot_text_color: string;
  bot_border_color: string;
  bot_button_color: string;
  bot_button_text_color: string;
  bot_button_hover_color: string;
  bot_status_bar_color: string;
  bot_status_bar_text_color: string;
  bot_animation_color: string | null;
  bot_name: string;
  bot_show_form: boolean;
  bot_tagline: string;
  is_glowing: boolean;
  is_transparent: boolean;
  widget_submit_btn_text: string;
  custom_form_fields: Array<{
    id: number;
    type: "text" | "email" | "tel" | "number" | "textarea";
    label: string;
    isDefault: boolean;
  }>;
}

interface RetellaiAgentProps {
  isWidget?: boolean;
  colors?: {
    borderColor: string;
    backgroundColor: string;
    iconColor: string;
    buttonColor: string;
    buttonHoverColor: string;
    buttonTextColor: string;
    textColor: string;
    headerBubbleColor: string;
    statusColor: string;
    statusBarTextColor: string;
  };
  botName?: string;
  botIcon?: string | null;
}

let audioCtx: AudioContext | null = null;

// ─────────────────────────────────────────────
// Mic Denied Modal Component
// ─────────────────────────────────────────────
const MicDeniedModal = ({
  onClose,
  buttonColor,
}: {
  onClose: () => void;
  buttonColor?: string;
}) => {
  // Detect browser for tailored instructions
  const getBrowserInstructions = () => {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome") && !ua.includes("Edg")) {
      return {
        browser: "Chrome",
        steps: [
          "Click the 🔒 lock icon (or ℹ️ info icon) in the address bar",
          'Find "Microphone" in the permissions list',
          'Change it from "Blocked" to "Allow"',
          "Refresh the page and try again",
        ],
      };
    } else if (ua.includes("Firefox")) {
      return {
        browser: "Firefox",
        steps: [
          "Click the 🔒 lock icon in the address bar",
          'Click "Connection Secure" → "More Information"',
          'Go to the "Permissions" tab',
          'Find "Use the Microphone" and uncheck "Block"',
          "Refresh the page and try again",
        ],
      };
    } else if (ua.includes("Edg")) {
      return {
        browser: "Edge",
        steps: [
          "Click the 🔒 lock icon in the address bar",
          'Click "Permissions for this site"',
          'Set "Microphone" to "Allow"',
          "Refresh the page and try again",
        ],
      };
    } else if (ua.includes("Safari")) {
      return {
        browser: "Safari",
        steps: [
          "Go to Safari → Settings (or Preferences) → Websites",
          'Click "Microphone" in the left sidebar',
          'Find this website and set it to "Allow"',
          "Refresh the page and try again",
        ],
      };
    }
    return {
      browser: "your browser",
      steps: [
        "Click the lock or info icon in the address bar",
        'Look for "Microphone" in site permissions',
        'Change the setting to "Allow"',
        "Refresh the page and try again",
      ],
    };
  };

  const { browser, steps } = getBrowserInstructions();

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-[min(90vw,380px)] p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <MicOff className="w-8 h-8 text-red-500" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-center text-lg font-bold text-gray-800 mb-1">
          Microphone Access Denied
        </h2>

        {/* Crop container — clips all sides */}
        <div
          className="overflow-hidden rounded-xl mx-auto"
          style={{ width: "100%", height: "160px", position: "relative" }}
        >
          <iframe
            src="https://www.youtube.com/embed/vWp-3eZw3WI?autoplay=1&mute=1&controls=0&loop=1&playlist=vWp-3eZw3WI&rel=0&modestbranding=1&showinfo=0&iv_load_policy=3"
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            style={{
              position: "absolute",
              top: "-40px",
              left: "-40px",
              width: "calc(100% + 80px)",
              height: "calc(100% + 120px)",
              border: "none",
              pointerEvents: "none",
            }}
          />
        </div>
        {/* Steps */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            How to enable in {browser}
          </p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700"
              >
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold mt-0.5"
                  style={{ backgroundColor: buttonColor || "#2563eb" }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: buttonColor || "#2563eb" }}
        >
          Got it, I'll update settings
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Utility: check if mic is already denied
// ─────────────────────────────────────────────
const checkMicPermission = async (): Promise<PermissionState | null> => {
  try {
    if (navigator.permissions) {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return result.state; // 'granted' | 'denied' | 'prompt'
    }
  } catch (_) {}
  return null;
};

// ─────────────────────────────────────────────
// User Details Modal Component
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
const EmpRetellaiAgent = ({
  isWidget = false,
  colors,
  botName,
  botIcon,
}: RetellaiAgentProps) => {
  const decoder = new TextDecoder();
  const containerRef = useRef<HTMLDivElement>(null);
  const { agent_id, schema, type: agent_type, tool, agni_agent_id } = useWidgetContext();
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme | null>(null);
  const onlyOnce = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const room = useRoomContext();
  const status = useConnectionState(room);
  const [micMute, setMicMute] = useState(false);
  const manualDisconnectRef = useRef(false);

  const [speech, setSpeech] = useState("");
  const [isGlowing, setIsGlowing] = useState(false);
  const [domainStatus,setDomainStatus] =useState("active")
  useEffect(() => {
    const getAgentData = async () => {
      try {
        const res = await axios.get(
          `https://app.snowie.ai/api/get-agent/${agent_id}/?schema_name=${schema}`,
        );

        const allowed_domain = res.data.allowed_domains;
        const host = window.location.hostname;

        const status = allowed_domain?.[host];
        if(status) {
          setDomainStatus(status); 
        }
      } catch(_){}
    };

    getAgentData();
  }, []);
  const [latestEvent, setLatestEvent] = useState<{
    type: "transcription" | "chat";
    text: string;
    isLocal: boolean;
  } | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      text: string;
      isLocal: boolean;
      type: "transcription" | "chat" | "brochure";
      isStreaming?: boolean;
      brochure?: { name: string; url: string };
    }>
  >([]);
  const transcriptionSegmentIdMapRef = useRef<Map<string, string>>(new Map());
  const serverUrl = "wss://agnibyravanai-sw47y5hk.livekit.cloud";
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState("");
  const transcriptEmitterRef = useRef(new EventEmitter());

  // useTranscriptions() doesn't reliably expose participant.isLocal — we
  // wire up RoomEvent.TranscriptionReceived directly (same pattern as
  // agent-studio-sim.tsx) where participant is the explicit second argument.
  const transcriptionSegments = useTranscriptions(); // kept only for scroll trigger
  const { chatMessages, send, isSending: isSendingChat } = useChat();
  const [chatInput, setChatInput] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showform, setShowform] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const wasConnectedRef = useRef(false);

  // ── NEW: mic denied modal state ──
  const [showMicDeniedModal, setShowMicDeniedModal] = useState(false);

  const baseUrl = "https://api.ravan.ai/api/v1/calling/create-call";
  const settingsBaseUrl = "https://app.snowie.ai";

  const capitalize = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  //  request mic and handle denial
  const requestMicAccess = async (): Promise<MediaStreamTrack | null> => {
    const permState = await checkMicPermission();

    if (permState === "denied") {
      setShowMicDeniedModal(true);
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const [audioTrack] = stream.getAudioTracks();
      audioTrack.enabled = true;
      return audioTrack;
    } catch (err: any) {
      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        setShowMicDeniedModal(true);
      } else {
        console.error("Mic error:", err);
      }
      return null;
    }
  };

  useEffect(() => {
    if (status === "disconnected") {
      setSpeech(widgetTheme?.bot_tagline || "Talk To AI Assistant");
    } else if (status === "connecting") {
      setSpeech(`Connecting To ${widgetTheme?.bot_name || "AI Assistant"}`);
    } else if (status === "connected") {
      setSpeech(`Connected To ${widgetTheme?.bot_name || "AI Assistant"}`);
    } else {
      setSpeech("");
    }
  }, [status, widgetTheme?.bot_name, widgetTheme?.bot_tagline]);

  useEffect(() => {
    if (status === "connected") {
      wasConnectedRef.current = true;
    }

    if (status === "disconnected" && wasConnectedRef.current) {
      wasConnectedRef.current = false;

      // Clean up audio track if it's still alive
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current = null;
      }

      // Reset all UI state
      setIsRecording(false);
      setIsGlowing(false);
      setLatestEvent(null);
      setMessages([]);
      transcriptionSegmentIdMapRef.current.clear();
      setTranscripts("");
      setMuted(false);
      setExpanded(false);
      localStorage.removeItem("callId");
    }
  }, [status]);

  const upsertMessage = React.useCallback(
    (msg: {
      id: string;
      text: string;
      isLocal: boolean;
      type: "transcription" | "chat" | "brochure";
      isStreaming?: boolean;
      brochure?: { name: string; url: string };
    }) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx < 0) return [...prev, msg];
        const next = [...prev];
        next[idx] = { ...next[idx], ...msg };
        return next;
      });
    },
    []
  );

  // Wire transcription directly to RoomEvent so participant.isLocal is reliable
  useEffect(() => {
    const handleTranscriptionReceived: Parameters<typeof room.on<RoomEvent.TranscriptionReceived>>[1] = (
      segments,
      participant
    ) => {
      const isLocal = !!participant?.isLocal;
      const participantId = participant?.identity || "unknown";

      segments.forEach((segment) => {
        const text = (segment.text || "").trim();
        if (!text) return;

        const messageId =
          transcriptionSegmentIdMapRef.current.get(segment.id) ||
          `ts-${participantId}-${segment.id}`;
        transcriptionSegmentIdMapRef.current.set(segment.id, messageId);

        setLatestEvent({ type: "transcription", text, isLocal });
        upsertMessage({
          id: messageId,
          text,
          isLocal,
          type: "transcription",
          isStreaming: !segment.final,
        });

        if (segment.final) {
          transcriptionSegmentIdMapRef.current.delete(segment.id);
        }
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);
    };
  }, [room, upsertMessage]);

  useEffect(() => {
    if (chatMessages.length === 0) return;
    const msg = chatMessages[chatMessages.length - 1];
    const isLocal = !!msg.from?.isLocal;
    const text = (msg.message || "").trim();
    if (!text) return;
    const id = `chat-${(msg as { id?: string }).id || Date.now()}`;
    setLatestEvent({ type: "chat", text, isLocal });
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, text, isLocal, type: "chat" }];
    });
  }, [chatMessages]);

  const getFieldIcon = (type: string) => {
    return <svg className="h-5 w-5 text-gray-400" />;
  };

  const renderIcon = (className: string) => {
    const logoToUse = botIcon || widgetTheme?.bot_logo;
    if (logoToUse) {
      return (
        <img
          src={logoToUse}
          alt="Custom Icon"
          className="w-full h-full object-cover"
          style={{ borderRadius: "50%" }}
        />
      );
    }
    return (
      <Mic
        className={className}
        style={{ color: widgetTheme?.bot_icon_color || "#ffffff" }}
      />
    );
  };

  useEffect(() => {
    localStorage.removeItem("callId");
    if (onlyOnce.current) return;
    const getWidgetTheme = async () => {
      try {
        console.log("hello 2222 ")
        const response = await axios.get(
          `${settingsBaseUrl}/api/thunder-widget-settings/${schema}/${agent_id}/?type=${agent_type === "thunderemotionlite" ? "thunder_emotion_lite" : "thunder_emotion"}`,
        );
        console.log(response);
        const data = response.data.response;
        console.log(data)
        setWidgetTheme(data);
        onlyOnce.current = true;
      } catch (error) {
        console.error("Failed to fetch widget theme:", error);
      }
    };
    getWidgetTheme();
  }, []);

  useEffect(() => {
    if (widgetTheme?.custom_form_fields) {
      const initialData: Record<string, string> = {};
      widgetTheme.custom_form_fields.forEach((field) => {
        initialData[field.label.toLowerCase()] = "";
      });
      setFormData(initialData);
    }
  }, [widgetTheme?.custom_form_fields]);

  useEffect(() => {
    if (widgetTheme?.bot_show_form) {
      setShowform(true);
    }
  }, [widgetTheme?.bot_show_form]);

  useEffect(() => {
    if (widgetTheme?.bot_mute_on_tab_change) {
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          setMuted(true);
        } else if (document.visibilityState === "visible") {
          setMuted(false);
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      };
    }
  }, [widgetTheme?.bot_mute_on_tab_change]);

  const audio = async () => {
    await room.startAudio();
    const audioTrack = await requestMicAccess();
    if (!audioTrack) return;

    await room.localParticipant.publishTrack(audioTrack, {
      name: "microphone",
      source: Track.Source.Microphone,
    });
    audioTrackRef.current = audioTrack;
  };

useEffect(() => {
  if (!widgetTheme?.bot_auto_start) return;
  if (manualDisconnectRef.current) return;   

  const callId = localStorage.getItem("callId");

  if (!callId && status === "disconnected") {
    setExpanded(true);
    handleSubmit();
    audio();
  }
}, [widgetTheme?.bot_auto_start, status]);

  const registeredToolsRef = useRef<Set<string>>(new Set());
  const handlerMapRef = useRef<Record<string, (data: RpcInvocationData) => Promise<string>>>({});

  useEffect(() => {
    // Clear on each run so handler logic updates are picked up
    registeredToolsRef.current.clear();

    const toolsUrl = "https://api.ravan.ai/api/v1/tools";

    const BROCHURES: Array<{ project_name: string; name: string; url: string }> = [
      { project_name: "emperium_casa_villas", name: "EMPERIUM CASA VILLAS BROCHURE (1).pdf", url: "https://drive.google.com/file/d/110xpDypyX7LKzDT4oJmLHdZcZI8_Twur/view?usp=drive_link" },
      { project_name: "emperium_city", name: "Emperium City brochure.pdf", url: "https://drive.google.com/file/d/19EUnAgTuE26iMrPvalj_Q7oxSIBF-ZEo/view?usp=drive_link" },
      { project_name: "emperium_city_sco", name: "Emperium City SCO Brochure.jpeg", url: "https://drive.google.com/file/d/1RvihtodSNpmzJcgPQWh62SiMj3n_VKyQ/view?usp=drive_link" },
      { project_name: "emperium_palm_drive", name: "Emperium Palm Drive Brochure.pdf", url: "https://drive.google.com/file/d/1QqvvlcqRQtMxkoURflLUTufvszw_OUVD/view?usp=drive_link" },
      { project_name: "emperium_premio", name: "Emperium Premio Brochure.pdf", url: "https://drive.google.com/file/d/1ngeMJf38uA6vKpcydgVHHGeOrad6gB_m/view?usp=drive_link" },
      { project_name: "emperium_supreme_panipat", name: "Emperium Supreme Brochure.pdf", url: "https://drive.google.com/file/d/10POOBsbXFbS6sSoBSVxA8RsasmIhsGgq/view?usp=drive_link" },
      { project_name: "emperium_titan", name: "Emperium Titan Brochure.pdf", url: "https://drive.google.com/file/d/1lGuTieCLENEXLonVbv-mVRLcZ8JpKB_R/view?usp=drive_link" },
      { project_name: "emperium_happy_homes", name: "Emperium-Happy-Homes-Brochure (1).pdf", url: "https://drive.google.com/file/d/1JE_RGdRHPIjHmecjPrWIUeE6Da4975KX/view?usp=drive_link" },
      { project_name: "emperium_palm_villas", name: "Emperium-Palm-Villas-Brochure (1).pdf", url: "https://drive.google.com/file/d/1WzTUi7NXcyyxIg8rJ9_1exYlXKmQujfF/view?usp=drive_link" },
      { project_name: "emperium_palm_drive_sco", name: "Palm Drive SCO (1).pdf", url: "https://drive.google.com/file/d/1nOQ6hLfq9pIh_Nla0C6MqmF4-cjI5bQO/view?usp=drive_link" },
      { project_name: "emperium_prime_residences", name: "Prime Residences Brochure.pdf", url: "https://drive.google.com/file/d/1KQvmO4zoHTqjdeSar-KVo3_qZIK_txiu/view?usp=drive_link" },
      { project_name: "emperium_resortico", name: "Resortico Brouchure Rera.pdf", url: "https://drive.google.com/file/d/1K_qMciKPr0ntKYHlaVEaDY5GkbrV2pjy/view?usp=drive_link" },
      { project_name: "emperium_resortico_villas", name: "Resortico Villa Brochure.pdf", url: "https://drive.google.com/file/d/1WVcq5aiyqTne1RcbbOYWI6K6bfnsKM6W/view?usp=drive_link" },
      { project_name: "marlin_avana", name: "Marlin Avana Brochure.pdf", url: "https://assets.cdn.filesafe.space/KUu5UkTcHdHgg0RsAb37/media/69ecd79e717d5dd4e1e3de8d.pdf" },
    ];

    // Dynamic handler builder — matches tool by name pattern, falls back to a no-op
    const buildHandler = (toolName: string): ((data: RpcInvocationData) => Promise<string>) => {
      if (toolName === "get_brochure") {
        return async (data) => {
          const params = JSON.parse(data.payload || "{}");
          console.log(`[${toolName}] params:`, params);
          const projectName: string = params.project_name || "";
          const match = BROCHURES.find((b) => b.project_name === projectName);
          if (match) {
            setMessages((prev) => [
              ...prev,
              {
                id: `brochure-${Date.now()}`,
                text: match.name,
                isLocal: false,
                type: "brochure",
                brochure: { name: match.name, url: match.url },
              },
            ]);
            return JSON.stringify({ success: true, name: match.name, url: match.url });
          }
          return JSON.stringify({ success: false, message: "Brochure not found" });
        };
      }

      if (toolName.includes("location")) {
        return async (data) => {
          const params = JSON.parse(data.payload || "{}");
          console.log(`[${toolName}] params:`, params);
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: params.high_accuracy ?? false,
              timeout: data.responseTimeout,
            });
          });
          return JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        };
      }

      // Default: log invocation and return empty object
      return async (data) => {
        console.log(`[${toolName}] invoked, payload:`, data.payload);
        return JSON.stringify({});
      };
    };

    const registerClientTools = async () => {
      let agni_agent_id2 = agni_agent_id || "019db4d9-c997-771a-8fc6-2d3d1dae2ff0";
      let apiKey = "";
      if (!agni_agent_id) {
        apiKey = "ak_a579c7540418ffa23147b97a01d984d21a023319cf51aad5c0950da3f26cb965";
      } else {
        apiKey = "ak_4c3101cbcf7ceaebf2c461b405ed7cd025d50a202915ab28e79c1c50e3caf5d2";
      }
      try {
        const res = await axios.get(toolsUrl, {
          headers: { "X-Api-Key": apiKey },
          params: { limit: 100, offset: 0, agent_id: agni_agent_id2 },
        });

        const tools: Array<{ name: string; type: string }> = res.data.data ?? [];
        const clientTools = tools.filter((t) => t.type === "client");
        console.log(`[registerClientTools] found ${clientTools.length} client tools:`, clientTools.map((t) => t.name));

        for (const clientTool of clientTools) {
          const handler = buildHandler(clientTool.name);
          if (!registeredToolsRef.current.has(clientTool.name)) {
            room.localParticipant.registerRpcMethod(clientTool.name, async (data: RpcInvocationData) => {
              try {
                // Read handler from ref so logic updates are picked up without re-registering
                return await handlerMapRef.current[clientTool.name]?.(data) ?? JSON.stringify({});
              } catch (err) {
                console.error(`[${clientTool.name}] handler error:`, err);
                throw new RpcError(1, `Tool ${clientTool.name} failed`);
              }
            });
            registeredToolsRef.current.add(clientTool.name);
            console.log(`[registerClientTools] registered: ${clientTool.name}`);
          }
          // Always update the live handler so RPC calls use the latest logic
          handlerMapRef.current[clientTool.name] = handler;
        }
      } catch (err) {
        console.error("Failed to fetch/register client tools:", err);
      }
    };

    registerClientTools();
  }, [room.localParticipant, agent_id]);

  useEffect(() => {
    const transcriptEmitter = transcriptEmitterRef.current;

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      kind?: DataPacket_Kind,
      topic?: string,
    ) => {
      let decodedData = decoder.decode(payload);
      let event = JSON.parse(decodedData);
      transcriptEmitter.emit("dataReceived", event, participant, kind, topic);
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);

    const handleTranscriptUpdate = (event: any) => {
      if (event.event_type === "update") {
        const alltrans = event.transcript;
        let Trans = "";
        for (let index = 0; index < alltrans.length; index++) {
          const currentTranscript = alltrans[index];
          Trans = currentTranscript.content;
          if (currentTranscript) {
            setTranscripts(Trans);
          }
        }
      }
    };

    transcriptEmitter.on("dataReceived", handleTranscriptUpdate);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
      transcriptEmitter.removeAllListeners("dataReceived");
    };
  }, [room]);

  // Request microphone permissions early
  // useEffect(() => {
  //   const requestMicPermission = async () => {
  //     try {
  //       const stream = await navigator.mediaDevices.getUserMedia({
  //         audio: true,
  //       });
  //       localStorage.setItem("microphonePermission", "granted");
  //       stream.getTracks().forEach((track) => track.stop());
  //     } catch (err) {
  //       console.error("Microphone permission denied:", err);
  //       localStorage.setItem("microphonePermission", "denied");
  //     }
  //   };

  //   if (!localStorage.getItem("microphonePermission")) {
  //     requestMicPermission();
  //   }
  // }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcripts, transcriptionSegments, chatMessages]);

  useEffect(() => {
    const initAudioOnInteraction = () => {
      if (!audioCtx) {
        const AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContext();
      }
      document.removeEventListener("click", initAudioOnInteraction);
      document.removeEventListener("touchstart", initAudioOnInteraction);
    };
    document.addEventListener("click", initAudioOnInteraction);
    document.addEventListener("touchstart", initAudioOnInteraction);
    return () => {
      document.removeEventListener("click", initAudioOnInteraction);
      document.removeEventListener("touchstart", initAudioOnInteraction);
    };
  }, []);
  useEffect(() => {
  manualDisconnectRef.current = false;
}, []);



  const resumeAudioContext = async (): Promise<void> => {
    try {
      if (!audioCtx) {
        const AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
    } catch (e) {
      console.error("AudioContext resume failed", e);
    }
  };

  const startRecordingWithAudio = async () => {
    await resumeAudioContext();
    startRecording();
  };

  const startRecording = async () => {
    try {
      await resumeAudioContext();
      if (status === "connected") {
        if (audioTrackRef.current) {
          audioTrackRef.current.enabled = true;
          setMuted(false);
          setIsRecording(true);
          setIsGlowing(true);
        }
      } else {
        await handleSubmit();
      }
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const handleSendChat = () => {
    if (chatInput.trim() && !isSendingChat) {
      send(chatInput);
      setChatInput("");
    }
  };

  const toggleExpand = () => {
    if (!expanded) {
      setExpanded(true);
      if (status === "disconnected") {
        if (widgetTheme?.bot_show_form) {
          setShowform(true);
        } else {
          startRecordingWithAudio();
        }
      }
    } else {
      setExpanded(false);
    }
  };

  const handleMicClick = () => {
    isRecording ? handleClose() : startRecording();
  };

  const togglemute = () => {
    setMuted(!muted);
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = !muted;
    }
  };

const handleClose = async () => {
  try {
    manualDisconnectRef.current = true;   

    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }

    await room.disconnect();

    setIsRecording(false);
    setIsGlowing(false);
    setMuted(false);
    setTranscripts("");
    setExpanded(false);
    setLatestEvent(null);
    setMessages([]);
    transcriptionSegmentIdMapRef.current.clear();
    wasConnectedRef.current = false;

    localStorage.removeItem("callId");
  } catch (err) {
    console.error("Error closing:", err);
  }
};
  // ── UPDATED: doStart uses requestMicAccess ──
  const doStart = async (payload: Record<string, unknown>) => {
    let agni_agent_id2 = agni_agent_id || "019db4d9-c997-771a-8fc6-2d3d1dae2ff0";
    let apiKey = "";
      if (!agni_agent_id) {
        apiKey = "ak_a579c7540418ffa23147b97a01d984d21a023319cf51aad5c0950da3f26cb965";
      } else {
        apiKey = "ak_4c3101cbcf7ceaebf2c461b405ed7cd025d50a202915ab28e79c1c50e3caf5d2";
      }
    try {
      // Check mic permission BEFORE making the API call
      const permState = await checkMicPermission();
      if (permState === "denied") {
        setShowMicDeniedModal(true);
        return;
      }

      const res = await axios.post(`${baseUrl}`,{
        agent_id: agni_agent_id2,  
        metadata: {},
        prompt_dynamic_variables: {},
        type: "web_call"
      },{
        headers:{
          "X-Api-Key": apiKey
        }
      });
      console.log("API response:", res);
      const decryptedPayload = res.data.data;
      console.log(decryptedPayload);
      const accessToken = decryptedPayload.access_token;
      const callId =
        decryptedPayload.call_id || decryptedPayload.room_id || "active";
      localStorage.setItem("callId", callId);

      await room.connect(decryptedPayload.url, accessToken);
      await room.startAudio();

      const audioTrack = await requestMicAccess();
      if (!audioTrack) {
        // Mic denied — modal already shown, disconnect cleanly
        await room.disconnect();
        localStorage.removeItem("callId");
        return;
      }

      await room.localParticipant.publishTrack(audioTrack, {
        name: "microphone",
        source: Track.Source.Microphone,
      });

      audioTrackRef.current = audioTrack;
      setMuted(false);
      setIsRecording(true);
      setIsGlowing(true);
      localStorage.setItem("formshow", "false");
      setTranscripts("");
      setShowform(false);
    } catch (err: any) {
      console.error("Form error:", err);

      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        setShowMicDeniedModal(true);
        return;
      }

      if (
        err?.name === "NotReadableError" ||
        err?.message?.includes("already")
      ) {
        return;
      }

      alert("Failed to start call. Please try again.");
    }
  };

  const getSessionId = () => localStorage.getItem("snowie_session_id") || undefined;

  const handleSubmit = async () => {
    let payload: Record<string, unknown> = {};
    if (agent_type === "thunderemotion") {
      payload = {
        agent_code: agent_id,
        schema_name: schema,
        provider: agent_type,
        session_id: getSessionId(),
      };
    } else {
      payload = {
        agent_code: agent_id,
        schema_name: schema,
        provider: "thunderemotionlite",
        requested_domains: `https://${window.location.hostname}`,
        session_id: getSessionId(),
      };
    }
    if (tool) {
      payload.tool_list = tool;
    }
    await doStart(payload);
  };

  const startFromForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (status === "disconnected") {
        setFormSubmitting(true);
        const payload: Record<string, unknown> = {
          agent_code: agent_id,
          schema_name: schema,
          provider: agent_type,
          session_id: getSessionId(),
        };
        if (tool) {
          payload.tool_list = tool;
        }
        Object.entries(formData).forEach(([key, value]) => {
          payload[key] = value;
        });
        await doStart(payload);
      } else {
        await handleClose();
      }
    } catch (err) {
      console.error("Error in startFromForm:", err);
    } finally {
      setFormSubmitting(false);
    }
  };

  if (!onlyOnce.current || !widgetTheme) {
    return <div className="text-white text-center">Loading...</div>;
  }
  if (domainStatus === "loading") return null;

if (domainStatus !== "active") return null;
  if (isWidget && colors) {
    return (
      <div
        className="flex flex-col h-full bg-gray-50"
        style={{ height: "calc(100% - 0px)" }}
      >
        {/* Mic Denied Modal */}
        {showMicDeniedModal && (
          <MicDeniedModal
            onClose={() => setShowMicDeniedModal(false)}
            buttonColor={colors.buttonColor}
          />
        )}

        <div className="flex flex-col items-center justify-center py-8 flex-1">
          <button
            onClick={isRecording ? handleClose : handleSubmit}
            className="w-40 h-40 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg mb-6 overflow-hidden"
            style={{ backgroundColor: colors.buttonColor }}
          >
            {botIcon ? (
              <img
                src={botIcon}
                alt="Bot Icon"
                className="w-full h-full object-cover"
              />
            ) : (
              <Mic className="w-16 h-16" style={{ color: colors.iconColor }} />
            )}
          </button>

          <div
            className="px-6 py-2 rounded-full text-sm font-medium"
            style={{
              backgroundColor: colors.statusColor,
              color: colors.statusBarTextColor,
            }}
          >
            {isRecording
              ? "Listening..."
              : ` ${botName || "Talk To AI Assistant"}`}
          </div>
        </div>

        <div className="px-6 py-4 h-48">
          <div
            ref={containerRef}
            className="bg-white rounded-2xl p-4 h-full text-gray-600 shadow-inner border overflow-y-auto text-sm"
            style={{
              fontStyle:
                latestEvent || transcriptionSegments.length > 0
                  ? "normal"
                  : "italic",
              color: "#374151",
            }}
          >
            {messages.length > 0 ? (
              messages.map((msg) =>
                msg.type === "brochure" && msg.brochure ? (
                  <div key={msg.id} className="flex mb-2 justify-start">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg max-w-[85%] bg-gray-100 text-black text-sm border border-gray-200">
                      <FileText className="w-4 h-4 flex-shrink-0 text-red-500" />
                      <span className="truncate flex-1">{msg.brochure.name}</span>
                      <a
                        href={msg.brochure.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-white text-xs font-medium flex-shrink-0"
                        style={{ backgroundColor: colors?.buttonColor || "#1a1a2e" }}
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className={`flex mb-2 ${msg.isLocal ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${msg.isLocal ? "bg-blue-100 text-black" : "bg-gray-100 text-black"}`}
                    >
                      {msg.text}
                    </div>
                  </div>
                )
              )
            ) : (
              <div className="text-gray-400 italic text-center mt-4">
                {isRecording
                  ? "Listening..."
                  : "Your conversation will appear here..."}
              </div>
            )}
            <div ref={containerRef} />
          </div>
        </div>

        <div className="p-6 pt-0">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
              placeholder="Type your message..."
              disabled={status !== "connected"}
              className="flex-1 bg-white text-gray-700 p-3 rounded-xl focus:outline-none focus:ring-2 placeholder-gray-400 border border-gray-200"
              style={{ borderColor: colors.borderColor }}
            />
            <button
              type="button"
              onClick={handleSendChat}
              disabled={status !== "connected" || isSendingChat}
              className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-md"
              style={{ backgroundColor: colors.buttonColor }}
            >
              {isSendingChat ? (
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: colors.buttonTextColor }}
                />
              ) : (
                <Send
                  className="w-5 h-5"
                  style={{ color: colors.buttonTextColor }}
                />
              )}
            </button>
          </div>
        </div>
        <RoomAudioRenderer muted={muted} />
      </div>
    );
  }

  const getPositionStyles = () => {
    const baseStyles: React.CSSProperties = {
      position: "fixed",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
    };
    switch (widgetTheme?.bot_position) {
      case "top-left":
        baseStyles.top = "2vh";
        baseStyles.left = "2vw";
        break;
      case "top-center":
        baseStyles.top = "2vh";
        baseStyles.left = "50%";
        baseStyles.transform = expanded ? "translateX(-50%)" : "none";
        break;
      case "top-right":
        baseStyles.top = "2vh";
        baseStyles.right = "2vw";
        break;
      case "bottom-left":
        baseStyles.bottom = "6vh";
        baseStyles.left = "2vw";
        break;
      case "bottom-center":
        baseStyles.bottom = "6vh";
        baseStyles.left = "50%";
        baseStyles.transform = expanded ? "translateX(-50%)" : "none";
        break;
      case "bottom-right":
        baseStyles.bottom = "6vh";
        baseStyles.right = "2vw";
        break;
      default:
        baseStyles.bottom = "6vh";
        baseStyles.right = "2vw";
    }
    return baseStyles;
  };

  return (
    <div className="fixed z-50" style={getPositionStyles()}>
      {/* Mic Denied Modal — rendered at widget level so it sits above everything */}
      {showMicDeniedModal && (
        <MicDeniedModal
          onClose={() => setShowMicDeniedModal(false)}
          buttonColor={widgetTheme?.bot_button_color}
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .widget-container {
            width: 90vw !important;
            height: ${widgetTheme?.bot_show_form && showform ? "80vh" : tool === "whatsapp" ? "90vh" : "85vh"} !important;
          }
        }
        .transcript-box {
          background: #f9fafb !important;
          color: ${widgetTheme?.bot_text_color || "#374151"} !important;
          border: 1px solid #e5e7eb !important;
        }
        .chat-input {
          background: white !important;
          color: ${widgetTheme?.bot_text_color || "#374151"} !important;
          border: 1px solid #e5e7eb !important;
        }
        .transparent-background {
          background: ${widgetTheme?.bot_background_color}15 !important;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid ${widgetTheme?.bot_border_color}30;
        }
        .transparent-widget .transcript-box,
        .transparent-widget input,
        .transparent-widget .chat-input {
          background: white !important;
          color: #374151 !important;
        }
        .brochure-download-btn {
          background-color: ${widgetTheme?.bot_button_color || "#1a1a2e"};
        }
      `}</style>

      {expanded ? (
        <div
          className={`rounded-3xl shadow-2xl overflow-hidden widget-container ${widgetTheme?.is_transparent ? "transparent-background transparent-widget" : ""}`}
          style={{
            width: "min(90vw, 400px)",
            height:
              widgetTheme?.bot_show_form && showform
                ? "min(90vh, 550px)"
                : tool === "whatsapp"
                ? "min(90vh, 680px)"
                : "min(90vh, 600px)",
            backgroundColor: widgetTheme?.is_transparent
              ? undefined
              : widgetTheme?.bot_background_color || "#ffffff",
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 flex justify-between items-center"
            style={{
              backgroundColor: widgetTheme?.bot_bubble_color || "#2563eb",
              color: widgetTheme?.bot_text_color || "#ffffff",
            }}
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: "#ffffff" }}
              >
                {renderIcon("w-full h-full")}
              </div>
              <span className="font-semibold text-lg">
                {widgetTheme?.bot_name || "AI Assistant"}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  if (audioTrackRef.current) {
                    audioTrackRef.current.enabled = micMute;
                  }
                  setMicMute(!micMute);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                {widgetTheme?.agent_mute &&
                  (micMute ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  ))}
              </button>
              <button
                onClick={togglemute}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                {muted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setExpanded(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-col h-[calc(100%-64px)] overflow-hidden">
            {widgetTheme?.bot_show_form && showform ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center">
                <h3
                  className="text-lg font-semibold mb-6"
                  style={{ color: widgetTheme?.bot_text_color || "#1f2937" }}
                >
                  {widgetTheme.widget_heading}
                </h3>
                <form onSubmit={startFromForm} className="w-full space-y-3">
                  {widgetTheme.custom_form_fields.map((field) => (
                    <div key={field.id} className="w-full">
                      <label
                        className="block text-xs font-semibold mb-1 tracking-wide uppercase"
                        style={{
                          color: widgetTheme?.bot_text_color || "#6b7280",
                        }}
                      >
                        {capitalize(field.label)}
                      </label>

                      {field.type === "tel" ? (
                        <PhoneInput
                          country={
                            localStorage
                              .getItem("continentcode")
                              ?.toLowerCase() || "us"
                          }
                          value={formData[field.label.toLowerCase()] || ""}
                          onChange={(phone) =>
                            setFormData({
                              ...formData,
                              [field.label.toLowerCase()]: phone,
                            })
                          }
                          inputProps={{ required: true }}
                          containerClass="w-full"
                          inputClass="!w-full !h-11 !text-sm !rounded-xl !border !border-gray-200 !pl-12 !text-gray-700 !bg-gray-50 focus:!ring-2 focus:!border-transparent"
                          buttonClass="!rounded-l-xl !border-gray-200 !bg-gray-50"
                        />
                      ) : (
                        <input
                          type={field.type}
                          required
                          value={formData[field.label.toLowerCase()] || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [field.label.toLowerCase()]: e.target.value,
                            })
                          }
                          className="w-full h-11 text-sm px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                          style={{
                            focusRingColor: widgetTheme?.bot_button_color,
                          }}
                          placeholder={`Enter your ${field.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                  <button
                    type="submit"
                    className="w-full p-3 rounded-lg text-white transition-colors hover:opacity-90"
                    style={{
                      backgroundColor:
                        widgetTheme?.bot_button_color || "#2563eb",
                    }}
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Connecting to AI Assistant
                      </div>
                    ) : (
                      widgetTheme.widget_submit_btn_text
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto">
                  <button
                    className={`${tool === "whatsapp" ? "w-28 h-28 mb-4" : "w-40 h-40 mb-6"} rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg overflow-hidden`}
                    style={{
                      backgroundColor:
                        widgetTheme?.bot_button_color || "#2563eb",
                      boxShadow: isRecording
                        ? `0 0 30px ${widgetTheme?.bot_animation_color || "#ef4444"}80`
                        : "0 4px 20px rgba(37, 99, 235, 0.3)",
                    }}
                  >
                    <div className="relative w-full h-full flex items-center justify-center">
                      {isGlowing && (
                        <div className="absolute inset-0 -m-5 bg-blue-400 opacity-50 rounded-full"></div>
                      )}
                      {renderIcon(
                        botIcon || widgetTheme?.bot_logo
                          ? "w-full h-full"
                          : "w-16 h-16 text-white relative z-10",
                      )}
                    </div>
                  </button>

                  <div
                    className="px-6 py-3 rounded-full text-sm font-medium mb-4"
                    style={{
                      backgroundColor:
                        widgetTheme?.bot_status_bar_color || "#f3f4f6",
                      color:
                        widgetTheme?.bot_status_bar_text_color || "#374151",
                    }}
                  >
                    {speech}
                  </div>

                  <div className="w-full px-4 mb-4">
                    <div
                      className="text-sm font-medium mb-2"
                      style={{
                        color: widgetTheme?.bot_text_color || "#374151",
                      }}
                    >
                      Conversation
                    </div>
                    <div
                      ref={containerRef}
                      className={`transcript-box rounded-lg p-4 overflow-y-auto text-sm ${tool === "whatsapp" ? "h-56" : "h-32"}`}
                    >
                      {messages.length > 0 ? (
                        messages.map((msg) =>
                          msg.type === "brochure" && msg.brochure ? (
                            <div key={msg.id} className="flex mb-1 justify-start">
                              <div className="flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] max-w-[90%] bg-gray-200 text-black border border-gray-300">
                                <FileText className="w-3 h-3 flex-shrink-0 text-red-500" />
                                <span className="truncate flex-1">{msg.brochure.name}</span>
                                <a
                                  href={msg.brochure.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="brochure-download-btn flex items-center gap-1 px-2 py-0.5 rounded text-white text-[10px] font-medium flex-shrink-0"
                                >
                                  <Download className="w-2.5 h-2.5" />
                                  Download
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={msg.id}
                              className={`flex mb-1 ${msg.isLocal ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`px-2 py-1 rounded-lg text-[11px] max-w-[80%] ${msg.isLocal ? "bg-blue-600/30 text-black" : "bg-gray-200 text-black"}`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          )
                        )
                      ) : (
                        <div className="text-gray-400 italic">
                          Your conversation will appear here...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="w-full px-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                        placeholder="Type your message..."
                        disabled={status !== "connected"}
                        className="chat-input flex-1 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={status !== "connected" || isSendingChat}
                        className="w-12 h-12 rounded-lg flex items-center justify-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor:
                            widgetTheme?.bot_button_color || "#2563eb",
                        }}
                      >
                        {isSendingChat ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <Send className="w-5 h-5 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          {widgetTheme?.is_glowing && (
            <style>{`
              @keyframes ray-ping-1 {
                0%   { transform: scale(1);   opacity: 0.55; }
                80%  { transform: scale(1.9); opacity: 0; }
                100% { transform: scale(1.9); opacity: 0; }
              }
              @keyframes ray-ping-2 {
                0%   { transform: scale(1);   opacity: 0.38; }
                80%  { transform: scale(2.4); opacity: 0; }
                100% { transform: scale(2.4); opacity: 0; }
              }
              @keyframes ray-ping-3 {
                0%   { transform: scale(1);   opacity: 0.22; }
                80%  { transform: scale(2.9); opacity: 0; }
                100% { transform: scale(2.9); opacity: 0; }
              }
              .glow-ray-1 { animation: ray-ping-1 2s ease-out infinite; }
              .glow-ray-2 { animation: ray-ping-2 2s ease-out infinite 0.4s; }
              .glow-ray-3 { animation: ray-ping-3 2s ease-out infinite 0.8s; }
            `}</style>
          )}

          {/* Pulse ray wrapper */}
          <div className="relative flex items-center justify-center w-16 h-16">
            {widgetTheme?.is_glowing && (
              <>
                <div
                  className="glow-ray-1 absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                  }}
                />
                <div
                  className="glow-ray-2 absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                  }}
                />
                <div
                  className="glow-ray-3 absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                  }}
                />
              </>
            )}

            <button
              onClick={toggleExpand}
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 hover:shadow-xl relative z-10"
              style={{
                backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                boxShadow: widgetTheme?.is_glowing
                  ? `0 0 20px ${widgetTheme?.bot_animation_color || "#2563eb"}80`
                  : "0 4px 12px rgba(37, 99, 235, 0.3)",
              }}
            >
              <div
                className={`text-white flex items-center justify-center overflow-hidden ${
                  botIcon || widgetTheme?.bot_logo ? "w-full h-full" : "w-8 h-8"
                }`}
              >
                {renderIcon("w-6 h-6")}
              </div>
            </button>
          </div>

          <button
            onClick={toggleExpand}
            className="px-4 py-2 rounded-full font-semibold text-sm transition-all hover:scale-105 shadow-md"
            style={{
              backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
              color: "#ffffff",
            }}
          >
            {`${widgetTheme?.bot_name || "Talk to AI Assistant"}`}
          </button>
        </div>
      )}

      <RoomAudioRenderer muted={muted} />
    </div>
  );
};

export default EmpRetellaiAgent;
