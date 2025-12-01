import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  Send,
  X,
  Minimize2,
  Pause,
  Loader2,
  User,
  Mail,
  VolumeX,
  Volume2,
} from "lucide-react";
import { MicOff } from "lucide-react";
import axios from "axios";
import { UltravoxSession } from "ultravox-client";
import useSessionStore from "../store/session";
import { useUltravoxStore } from "../store/ultrasession";
import logo from "../assets/logo.png";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { useWidgetContext } from "../constexts/WidgetContext";

export interface WidgetTheme {
  widget_theme: {
    bot_auto_start: boolean;
    bot_position: string;
    bot_logo: string | null;
    svg_logo: string | null;
    bot_height: string;
    bot_width: string;
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
    bot_animation_color: string;
    bot_name: string;
    bot_show_form: boolean;
    bot_tagline: string;
  };
}

const TestWidget = () => {
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme | null>(null);
  const countryCode = localStorage.getItem("countryCode");
  const continentcode = localStorage.getItem("continentcode");
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const containerRef = useRef(null);
  const [isGlowing, setIsGlowing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speech, setSpeech] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [auto_end_call, setAutoEndCall] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pulseEffects, setPulseEffects] = useState({
    small: false,
    medium: false,
    large: false,
  });
  const [message, setMessage] = useState("");
  const hasReconnected = useRef(false);
  const hasClosed = useRef(false);
  const { callSessionIds, setCallSessionIds } = useSessionStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [phoneError, setPhoneError] = useState("");
  const {
    setSession,
    transcripts,
    setTranscripts,
    isListening,
    setIsListening,
    status,
    setStatus,
  } = useUltravoxStore();
  const baseurl = "https://test.snowie.ai";
  const { agent_id, schema } = useWidgetContext();
  // const agent_id = "f1b87ef8-8c52-4c40-96f5-62280b7c8aea";
  // const schema = "9cd3db15-5dbe-4199-aa8c-80c5701857f7";
  let existingCallSessionIds: string[] = [];
  const AutoStartref = useRef(false);
  const storedIds = localStorage.getItem("callSessionId");
  const debugMessages = new Set(["debug"]);
  const onlyOnce = useRef(false);
  const [showform, setShowform] = useState(false);

  useEffect(() => {
    if (widgetTheme?.bot_show_form) {
      setShowform(true);
    }
  }, [widgetTheme?.bot_show_form]);

  useEffect(() => {
    if (onlyOnce.current) return;
    const getWidgetTheme = async () => {
      try {
        const response = await axios.get(
          `${baseurl}/api/thunder-widget-settings/${schema}/${agent_id}/`
        );
        const data = response.data.response;
        setWidgetTheme(data);
        onlyOnce.current = true;
      } catch (error) {
        console.error("Failed to fetch widget theme:", error);
      }
    };
    getWidgetTheme();
  }, []);

  useEffect(() => {
    if (status === "disconnected") {
      setSpeech(`Talk To ${widgetTheme?.bot_name || "AI Assistant"}`);
    } else if (status === "connecting") {
      setSpeech(`Connecting To ${widgetTheme?.bot_name || "AI Assistant"}`);
    } else if (status === "speaking") {
      setSpeech(`${widgetTheme?.bot_name || "AI Assistant"} is Speaking`);
      setExpanded(true);
    } else if (status === "connected") {
      setSpeech(`Connected To ${widgetTheme?.bot_name || "AI Assistant"}`);
    } else if (status === "disconnecting") {
      setSpeech(
        `Ending Conversation With ${widgetTheme?.bot_name || "AI Assistant"}`
      );
    } else if (status === "listening") {
      setSpeech(`${widgetTheme?.bot_name || "AI Assistant"} is Listening`);
    }
  }, [status, widgetTheme?.bot_name]);

  useEffect(() => {
    if (widgetTheme?.bot_mute_on_tab_change) {
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          session.muteSpeaker();
        } else if (document.visibilityState === "visible") {
          session.unmuteSpeaker();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    }
  }, [widgetTheme?.bot_mute_on_tab_change]);

  const sessionRef = useRef<UltravoxSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new UltravoxSession({
      experimentalMessages: debugMessages,
    });

    sessionRef.current.registerToolImplementation("getPageDetails", () => {
      console.log(
        "%c[getPageDetail Tool Invoked]",
        "color: #ff9800; font-weight: bold;"
      );

      // Log DOM extraction start
      console.log("Extracting full DOM...");

      const html = document.documentElement.outerHTML;

      console.log("DOM extracted. Length:", html.length);
      console.log("DOM Preview:", html.slice(0, 500), "...");

      return {
        result: html,
        responseType: "tool-response",
      };
    });

    setSession(sessionRef.current);
  }
  const session = sessionRef.current;

  const handleSubmit = () => {
    if (status != "disconnected") {
      session.sendText(`${message}`);
      setMessage("");
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem("isRefreshing", "true");
    };
    const clearRefreshFlag = () => {
      sessionStorage.removeItem("isRefreshing");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("load", clearRefreshFlag);
    clearRefreshFlag();
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("load", clearRefreshFlag);
    };
  }, []);

  useEffect(() => {
    if (status === "disconnecting" && !hasClosed.current) {
      const isPageRefresh = sessionStorage.getItem("isRefreshing") === "true";
      if (!isPageRefresh) {
        const callSessionId = JSON.parse(
          localStorage.getItem("callSessionId") || "[]"
        );
        localStorage.clear();
        const handleClose = async () => {
          await session.leaveCall();
          const response = await axios.post(
            `${baseurl}/api/end-call-session-thunder/`,
            {
              call_session_id: callSessionIds,
              schema_name: schema,
              prior_call_ids: callSessionId,
            }
          );
          hasClosed.current = false;
          setTranscripts(null);
          toggleVoice(false);
          widgetTheme?.bot_show_form ? setShowform(true) : setShowform(false);
        };
        handleClose();
      }
    }
  }, [status]);

  useEffect(() => {
    const callId = localStorage.getItem("callId");
    if (callId && status === "disconnected" && !hasReconnected.current) {
      setIsMuted(true);
      handleMicClickForReconnect(callId);
      hasReconnected.current = true;
    } else if (status === "listening" && callId && isMuted && !expanded) {
      session.muteSpeaker();
    }
  }, [status]);

  const handleMicClickForReconnect = async (id) => {
    try {
      const response = await axios.post(`${baseurl}/api/start-thunder/`, {
        agent_code: agent_id,
        schema_name: schema,
        prior_call_id: id,
      });
      const wssUrl = response.data.joinUrl;
      const callId = response.data.callId;
      localStorage.setItem("callId", callId);
      setCallSessionIds(response.data.call_session_id);
      if (storedIds) {
        try {
          const parsedIds = JSON.parse(storedIds);
          if (Array.isArray(parsedIds)) {
            existingCallSessionIds = parsedIds;
          }
        } catch (parseError) {
          console.warn("Could not parse callSessionId:", parseError);
          localStorage.removeItem("callSessionId");
        }
      }
      existingCallSessionIds.push(callId);
      localStorage.setItem(
        "callSessionId",
        JSON.stringify(existingCallSessionIds)
      );
      setShowform(false);
      if (wssUrl) {
        session.joinCall(`${wssUrl}`);
      }
    } catch (error) {
      console.error("Error in handleMicClick:", error);
    }
  };

  const handleMicClick = async () => {
    try {
      if (status === "disconnected") {
        const response = await axios.post(`${baseurl}/api/start-thunder/`, {
          agent_code: agent_id,
          schema_name: schema,
        });
        const wssUrl = response.data.joinUrl;
        const callId = response.data.callId;
        localStorage.setItem("callId", callId);
        localStorage.setItem("wssUrl", wssUrl);
        setCallSessionIds(response.data.call_session_id);
        setShowform(false);
        if (storedIds) {
          try {
            const parsedIds = JSON.parse(storedIds);
            if (Array.isArray(parsedIds)) {
              existingCallSessionIds = parsedIds;
            }
          } catch (parseError) {
            console.warn("Could not parse callSessionId:", parseError);
            localStorage.removeItem("callSessionId");
          }
        }
        existingCallSessionIds.push(callId);
        localStorage.setItem(
          "callSessionId",
          JSON.stringify(existingCallSessionIds)
        );
        if (wssUrl) {
          session.joinCall(`${wssUrl}`);
          if (AutoStartref.current) {
            session.unmuteSpeaker();
          }
        }
        toggleVoice(true);
      } else {
        const callSessionId = JSON.parse(localStorage.getItem("callSessionId"));
        await session.leaveCall();
        const response = await axios.post(
          `${baseurl}/api/end-call-session-thunder/`,
          {
            call_session_id: callSessionIds,
            schema_name: schema,
            prior_call_ids: callSessionId,
          }
        );
        setTranscripts(null);
        toggleVoice(false);
        localStorage.clear();
        widgetTheme?.bot_show_form ? setShowform(true) : setShowform(false);
      }
    } catch (error) {
      console.error("Error in handleMicClick:", error);
    }
  };

  useEffect(() => {
    const callId = localStorage.getItem("callId");
    if (widgetTheme?.bot_auto_start && !callId) {
      AutoStartref.current = true;
      handleMicClick();
    }
  }, [widgetTheme?.bot_auto_start]);

  session.addEventListener("transcripts", (event) => {
    const alltrans = session.transcripts;
    let Trans = "";
    for (let index = 0; index < alltrans.length; index++) {
      const currentTranscript = alltrans[index];
      Trans = currentTranscript.text;
      if (currentTranscript) {
        setTranscripts(Trans);
      }
    }
  });

  session.addEventListener("status", (event) => {
    setStatus(session.status);
  });

  session.addEventListener("experimental_message", (msg) => {});

  useEffect(() => {
    if (isRecording) {
      const smallPulse = setInterval(() => {
        setPulseEffects((prev) => ({ ...prev, small: !prev.small }));
      }, 1000);
      const mediumPulse = setInterval(() => {
        setPulseEffects((prev) => ({ ...prev, medium: !prev.medium }));
      }, 1500);
      const largePulse = setInterval(() => {
        setPulseEffects((prev) => ({ ...prev, large: !prev.large }));
      }, 2000);
      return () => {
        clearInterval(smallPulse);
        clearInterval(mediumPulse);
        clearInterval(largePulse);
      };
    }
  }, [isRecording]);

  const toggleExpand = () => {
    if (widgetTheme?.bot_show_form) {
      setExpanded(!expanded);
      return;
    }
    if (status === "disconnected") {
      setSpeech(`Connecting To ${widgetTheme?.bot_name || "AI Assistant"}`);
      handleMicClick();
    }
    if (session.isSpeakerMuted) {
      setIsMuted(false);
      session.unmuteSpeaker();
    }
    setExpanded(!expanded);
  };

  const togglemute = () => {
    setExpanded(!expanded);
    if (widgetTheme?.bot_mute_on_minimize) {
      if (session.isSpeakerMuted) {
        session.unmuteSpeaker();
      } else {
        session.muteSpeaker();
      }
    }
  };

  const handleClose = async () => {
    if (status !== "disconnected") {
      hasClosed.current = true;
      const callSessionId = JSON.parse(localStorage.getItem("callSessionId"));
      setExpanded(false);
      await session.leaveCall();
      widgetTheme?.bot_show_form ? setShowform(true) : setShowform(false);
      const response = await axios.post(
        `${baseurl}/api/end-call-session-thunder/`,
        {
          call_session_id: callSessionIds,
          schema_name: schema,
          prior_call_ids: callSessionId,
        }
      );
      hasClosed.current = false;
      setTranscripts(null);
      toggleVoice(false);
      localStorage.clear();
    } else {
      setExpanded(!expanded);
    }
  };

  const toggleVoice = (data) => {
    setIsListening(data);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcripts]);

  const toggleMute = () => {
    if (widgetTheme?.bot_mute_on_minimize) {
      if (session.isSpeakerMuted) {
        session.unmuteSpeaker();
        setIsMuted(false);
      } else {
        session.muteSpeaker();
        setIsMuted(true);
      }
    }
    setExpanded(false);
  };

  const startFromForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (status === "disconnected") {
        const response = await axios.post(`${baseurl}/api/start-thunder/`, {
          agent_code: agent_id,
          schema_name: schema,
          phone: countryCode + formData.phone,
          name: formData.name,
          email: formData.email,
        });
        const wssUrl = response.data.joinUrl;
        const callId = response.data.callId;
        localStorage.setItem("callId", callId);
        localStorage.setItem("wssUrl", wssUrl);
        setCallSessionIds(response.data.call_session_id);
        setShowform(false);
        if (storedIds) {
          try {
            const parsedIds = JSON.parse(storedIds);
            if (Array.isArray(parsedIds)) {
              existingCallSessionIds = parsedIds;
            }
          } catch (parseError) {
            console.warn("Could not parse callSessionId:", parseError);
            localStorage.removeItem("callSessionId");
          }
        }
        existingCallSessionIds.push(callId);
        localStorage.setItem(
          "callSessionId",
          JSON.stringify(existingCallSessionIds)
        );
        if (wssUrl) {
          session.joinCall(`${wssUrl}`);
          if (AutoStartref.current) {
            session.unmuteSpeaker();
          }
        }
        toggleVoice(true);
      } else {
        const callSessionId = JSON.parse(localStorage.getItem("callSessionId"));
        await session.leaveCall();
        const response = await axios.post(
          `${baseurl}/api/end-call-session-thunder/`,
          {
            call_session_id: callSessionIds,
            schema_name: schema,
            prior_call_ids: callSessionId,
          }
        );
        setTranscripts(null);
        toggleVoice(false);
        localStorage.clear();
        widgetTheme?.bot_show_form ? setShowform(true) : setShowform(false);
      }
    } catch (error) {
      console.error("Error in startFromForm:", error);
    }
  };

  const getWidgetStyles = () => {
    const styles: React.CSSProperties = {
      position: "fixed",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
    };

    if (expanded) {
      styles.width = "min(90vw, 400px)"; // Responsive width
      styles.height =
        widgetTheme?.bot_show_form && showform
          ? "min(90vh, 550px)"
          : "min(90vh, 600px)"; // Responsive height
    } else {
      styles.width = "min(40vw, 160px)"; // Smaller width on mobile
      styles.height = "min(20vh, 80px)"; // Smaller height on mobile
    }

    switch (widgetTheme?.bot_position) {
      case "top-left":
        styles.top = "2vh";
        styles.left = "2vw";
        break;
      case "top-center":
        styles.top = "2vh";
        styles.left = "50%";
        styles.transform = expanded ? "translateX(-50%)" : "none";
        break;
      case "top-right":
        styles.top = "2vh";
        styles.right = "2vw";
        break;
      case "bottom-left":
        styles.bottom = "6vh";
        styles.left = "2vw";
        break;
      case "bottom-center":
        styles.bottom = "6vh";
        styles.left = "50%";
        styles.transform = expanded ? "translateX(-50%)" : "none";
        break;
      case "bottom-right":
        styles.bottom = "6vh";
        styles.right = "2vw";
        break;
      default:
        styles.bottom = "6vh";
        styles.right = "2vw";
    }

    return styles;
  };

  const renderIcon = (className: string) => {
    if (widgetTheme?.bot_logo) {
      return (
        <img
          src={widgetTheme.bot_logo}
          alt="Custom Icon"
          className={className}
          style={{
            objectFit: "cover",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
          }}
        />
      );
    }
    return (
      <Mic
        className={className}
        style={{ color: widgetTheme?.bot_icon_color }}
      />
    );
  };

  if (!onlyOnce.current || !widgetTheme) {
    return <div className="text-white text-center">Loading...</div>;
  }

  return (
    <div style={getWidgetStyles()} className="flex flex-col items-end">
      <style>
        {`
          @media (max-width: 640px) {
            .widget-container {
              width: 90vw !important;
              height: ${
                widgetTheme?.bot_show_form && showform ? "80vh" : "85vh"
              } !important;
            }
            .mic-button {
              width: 30vw !important;
              height: 30vw !important;
            }
            .status-bar {
              font-size: 0.8rem !important;
              padding: 0.5rem 1rem !important;
            }
            .form-container {
              padding: 1rem !important;
            }
            .form-input {
              padding: 0.5rem 2rem !important;
              font-size: 0.9rem !important;
            }
            .form-button {
              padding: 0.5rem !important;
              font-size: 0.9rem !important;
            }
            .chat-input {
              padding: 0.5rem !important;
              font-size: 0.9rem !important;
            }
            .transcript-box {
              height: 20vh !important;
              font-size: 0.8rem !important;
            }
            .header {
              padding: 0.5rem 1rem !important;
            }
            .header-button {
              width: 2rem !important;
              height: 2rem !important;
            }
            .icon {
              width: 1.2rem !important;
              height: 1.2rem !important;
            }
          }
        `}
      </style>
      {expanded ? (
        <div
          className="bg-white rounded-3xl shadow-2xl overflow-hidden widget-container"
          style={{
            width: "min(90vw, 400px)",
            height:
              widgetTheme?.bot_show_form && showform
                ? "min(90vh, 550px)"
                : "min(90vh, 600px)",
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 flex justify-between items-center header"
            style={{ backgroundColor: widgetTheme?.bot_bubble_color }}
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: widgetTheme?.bot_button_color }}
              >
                {renderIcon("w-full h-full icon")}
              </div>
              <span
                className="font-semibold text-lg"
                style={{ color: widgetTheme?.bot_text_color }}
              >
                {widgetTheme?.bot_name || "AI Assistant"}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleMute}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button"
              >
                {isMuted ? (
                  <VolumeX
                    className="w-5 h-5 icon"
                    style={{ color: widgetTheme?.bot_text_color }}
                  />
                ) : (
                  <Volume2
                    className="w-5 h-5 icon"
                    style={{ color: widgetTheme?.bot_text_color }}
                  />
                )}
              </button>
              <button
                onClick={toggleMute}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button"
              >
                <Minimize2
                  className="w-5 h-5 icon"
                  style={{ color: widgetTheme?.bot_text_color }}
                />
              </button>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button"
              >
                <X
                  className="w-5 h-5 icon"
                  style={{ color: widgetTheme?.bot_text_color }}
                />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div
            className="flex flex-col h-full bg-gray-50"
            style={{ height: "calc(100% - 80px)" }}
          >
            {widgetTheme?.bot_show_form && showform ? (
              <div className="flex flex-col items-center justify-center h-full p-6 form-container">
                <h3 className="text-lg font-semibold mb-6 text-gray-800">
                  Enter Your Details
                </h3>
                <form
                  onSubmit={startFromForm}
                  className="w-full max-w-sm space-y-4"
                >
                  {[
                    {
                      icon: <User className="h-5 w-5 text-gray-400 icon" />,
                      value: formData.name,
                      type: "text",
                      placeholder: "Your name",
                      key: "name",
                    },
                    {
                      icon: <Mail className="h-5 w-5 text-gray-400 icon" />,
                      value: formData.email,
                      type: "email",
                      placeholder: "Email address",
                      key: "email",
                    },
                  ].map((field, index) => (
                    <div key={index} className="w-full">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                          {field.icon}
                        </div>
                        <input
                          type={field.type}
                          required
                          value={formData[field.key]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [field.key]: e.target.value,
                            })
                          }
                          className="w-full p-3 pl-10 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 form-input"
                          placeholder={field.placeholder}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="w-full">
                    <PhoneInput
                      dropdownClass="bottom-10 z-50"
                      dropdownStyle={{ zIndex: 1000 }}
                      inputProps={{
                        name: "phone",
                        required: true,
                      }}
                      country={continentcode?.toLowerCase()}
                      value={formData.phone}
                      onChange={(phone) => {
                        setFormData({ ...formData, phone });
                        setPhoneError("");
                      }}
                      enableSearch={true}
                      inputClass="w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 form-input"
                    />
                  </div>
                  {phoneError && (
                    <div className="text-red-500 text-sm mt-1">
                      {phoneError}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="w-full p-3 rounded-xl text-white transition-colors hover:opacity-90 form-button"
                    style={{ backgroundColor: widgetTheme?.bot_button_color }}
                  >
                    {status === "connecting" ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin mr-2 icon" />
                        Connecting to AI Assistant
                      </div>
                    ) : (
                      "Submit"
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Microphone Section */}
                <div className="flex flex-col items-center justify-center py-8">
                  <button
                    onClick={handleMicClick}
                    disabled={widgetTheme?.bot_show_form && showform}
                    className="w-40 h-40 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg mb-6 mic-button overflow-hidden"
                    style={{ backgroundColor: widgetTheme?.bot_button_color }}
                  >
                    {renderIcon("w-full h-full icon")}
                  </button>
                  <div
                    className="px-6 py-2 rounded-full text-sm font-medium status-bar"
                    style={{
                      backgroundColor: widgetTheme?.bot_status_bar_color,
                      color: widgetTheme?.bot_status_bar_text_color,
                    }}
                  >
                    {speech}
                  </div>
                </div>

                {/* Transcription Box */}
                {widgetTheme?.bot_show_transcript && (
                  <div className="px-6 py-4 flex-1">
                    <div
                      ref={containerRef}
                      className="bg-white rounded-2xl p-4 h-32 text-gray-600 shadow-inner border overflow-y-auto text-sm transcript-box"
                      style={{
                        fontStyle: transcripts ? "normal" : "italic",
                        color: transcripts ? "#374151" : "#9CA3AF",
                      }}
                    >
                      {transcripts || "Your conversation will appear here..."}
                    </div>
                  </div>
                )}

                {/* Input Area */}
                {widgetTheme?.bot_show_chat && (
                  <div className="p-6 pt-0">
                    <div className="flex items-center space-x-3">
                      <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        placeholder="Type your message..."
                        disabled={
                          status === "disconnected" || status === "connecting"
                        }
                        className="flex-1 bg-white text-gray-700 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder-gray-400 border border-gray-200 chat-input"
                      />
                      <button
                        type="button"
                        onClick={handleSubmit}
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-md"
                        style={{
                          backgroundColor: widgetTheme?.bot_button_color,
                        }}
                      >
                        <Send
                          className="w-5 h-5 icon"
                          style={{ color: widgetTheme?.bot_button_text_color }}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={toggleExpand}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 overflow-hidden"
            style={{ backgroundColor: widgetTheme?.bot_button_color }}
          >
            {renderIcon("w-full h-full")}
          </button>
          <div
            className="px-4 py-2 rounded-full text-sm font-medium shadow-lg text-center status-bar"
            style={{
              backgroundColor: widgetTheme?.bot_button_color,
              color: widgetTheme?.bot_button_text_color,
            }}
          >
            {widgetTheme?.bot_tagline ||
              `TALK TO ${widgetTheme?.bot_name || "AI Assistant"}`}
          </div>
        </div>
      )}
    </div>
  );
};

export default TestWidget;
