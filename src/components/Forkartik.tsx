import React, { useState, useEffect, useRef } from "react";
import { Mic, Send, X, Minimize2, Pause } from "lucide-react";
import { MicOff } from "lucide-react";
import axios from "axios";
import { UltravoxSession } from "ultravox-client";
import { useWidgetContext } from "../constexts/WidgetContext";
import useSessionStore from "../store/session";
import { useUltravoxStore } from "../store/ultrasession";
import logo from "../assets/logo.png";

const VoiceAIWidget = () => {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  // const [transcription, setTranscription] = useState("");
  const containerRef = useRef(null);
  const [isGlowing, setIsGlowing] = useState(false);
  const [speech, setSpeech] = useState("");
  const [pulseEffects, setPulseEffects] = useState({
    small: false,
    medium: false,
    large: false,
  });
  const [message, setMessage] = useState("");

  const { agent_id, schema } = useWidgetContext();
  const { callId, callSessionId, setCallId, setCallSessionId } =
    useSessionStore();
  const {
    setSession,
    transcripts,
    setTranscripts,
    isListening,
    setIsListening,
    status,
    setStatus,
  } = useUltravoxStore();
  const baseurl = "https://app.snowie.ai";
  // const agent_id = "43279ed4-9039-49c8-b11b-e90f3f7c588c";
  // const schema = "6af30ad4-a50c-4acc-8996-d5f562b6987f";
  const debugMessages = new Set(["debug"]);
  console.log(status);

  useEffect(() => {
    if (status === "disconnected") {
      setSpeech("Talk To Assistant");
    } else if (status === "connecting") {
      setSpeech("Connecting To Assistant");
    } else if (status === "speaking") {
      setSpeech("Assistant is Speaking");
    } else if (status === "connected") {
      setSpeech("Connected To Assistant");
    } else if (status === "disconnecting") {
      setSpeech("Ending Conversation With Assistant");
    } else if (status === "listening") {
      setSpeech("Assistant is Listening");
    }
  }, [status]);

  useEffect(() => {
    if (status === "disconnecting") {
      const handleClose = async () => {
        await session.leaveCall();
        const response = await axios.post(
          `${baseurl}/api/end-call-session-ultravox/`,
          {
            call_session_id: callSessionId,
            call_id: callId,
            schema_name: schema,
          }
        );

        // console.log("Call left successfully");
        setTranscripts(null);
        toggleVoice(false);
      };
      handleClose();
    }
  }, [status]);

  const sessionRef = useRef<UltravoxSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new UltravoxSession({
      experimentalMessages: debugMessages,
    });

    setSession(sessionRef.current);
  }
  // console.log(sessionRef);

  const session = sessionRef.current;

  // Toggle local listening state
  const toggleVoice = (data) => {
    setIsListening(data);
  };

  // Handle message submission
  const handleSubmit = () => {
    // console.log(status);
    // console.log(message);

    if (status != "disconnected") {
      session.sendText(`${message}`);
      setMessage("");
    }
  };

  // Handle mic button click
  const handleMicClick = async () => {
    try {
      if (!isListening) {
        const response = await axios.post(`${baseurl}/api/start-thunder/`, {
          agent_code: agent_id,
          schema_name: schema,
        });

        const wssUrl = response.data.joinUrl;
        setCallId(response.data.callId);
        setCallSessionId(response.data.call_session_id);
        // console.log("Mic button clicked!", wssUrl);

        if (wssUrl) {
          session.joinCall(`${wssUrl}`);
        } else {
          // console.error("WebSocket URL is not set");
        }
        toggleVoice(true);
      } else {
        await session.leaveCall();
        const response = await axios.post(
          `${baseurl}/api/end-call-session-ultravox/`,
          {
            call_session_id: callSessionId,
            call_id: callId,
            schema_name: schema,
          }
        );

        // console.log("Call left successfully");
        setTranscripts(null);
        toggleVoice(false);
      }
    } catch (error) {
      // console.error("Error in handleMicClick:", error);
    }
  };

  session.addEventListener("transcripts", (event) => {
    // console.log("Transcripts updated: ", session);

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

  // Listen for status changing events
  session.addEventListener("status", (event) => {
    setStatus(session.status);
    // console.log("Session status changed: ", session.status);
  });

  session.addEventListener("experimental_message", (msg) => {
    console.log("Got a debug message: ", JSON.stringify(msg));
  });

  // Animated pulse effects for recording state
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
    setExpanded(!expanded);
  };

  const handleClose = async () => {
    setExpanded(!expanded);
    await session.leaveCall();
    const response = await axios.post(
      `${baseurl}/api/end-call-session-ultravox/`,
      {
        call_session_id: callSessionId,
        call_id: callId,
        schema_name: schema,
      }
    );
    setTranscripts(null);
    toggleVoice(false);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      // Set scrollTop to scrollHeight to always scroll to the bottom
      container.scrollTop = container.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {expanded ? (
        <div
          className={`bg-gray-900/50 backdrop-blur-sm w-[309px] h-[521px] rounded-2xl shadow-2xl overflow-hidden border ${
            isGlowing
              ? "border-yellow-300 shadow-yellow-400/40"
              : "border-yellow-400"
          } transition-all duration-500`}
        >
          {/* Header with glow effect */}
          <div className="relative p-4 flex justify-between bg-black items-center">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-transparent to-yellow-500/5"></div>
            <div className="relative flex items-center">
              <div className="bg-black rounded-full w-8 h-8 flex items-center justify-center mr-2 border border-yellow-400 shadow-lg shadow-yellow-400/20">
                <span className="text-yellow-400 font-bold text-xl">
                  <img src={logo} alt="logo" className="w-6 h-6" />
                </span>
              </div>
              <span className="text-white font-bold text-lg">
                Voice Assistant
              </span>
            </div>
            <div className="relative flex space-x-2">
              <button
                onClick={toggleExpand}
                className="text-gray-300 hover:text-yellow-400 transition-colors"
              >
                <Minimize2 size={18} />
              </button>
              <button
                onClick={handleClose}
                className="text-gray-300 hover:text-yellow-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Microphone Button with enhanced visual effects */}
          <div className="pt-10 flex flex-col items-center justify-center relative overflow-hidden w-full">
            {/* Background glow effects */}
            <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent"></div>
            <div className="absolute w-full h-64 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400/10 rounded-full blur-3xl"></div>
            <div className="absolute w-52 h-52  left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400/20 rounded-full blur-xl animate-pulse"></div>
            <div className="absolute w-40 h-40  left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400/25 rounded-full blur-md animate-pulse"></div>

            {/* Decorative elements */}
            {/* <div className="absolute w-full h-full">
              <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-yellow-300 rounded-full animate-ping"></div>
              <div className="absolute top-3/4 left-1/3 w-1 h-1 bg-yellow-300 rounded-full animate-ping delay-300"></div>
              <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-yellow-300 rounded-full animate-ping delay-700"></div>
              <div className="absolute bottom-1/4 right-1/3 w-1 h-1 bg-yellow-300 rounded-full animate-ping delay-500"></div>
              <div className="absolute top-1/2 left-1/5 w-1 h-1 bg-yellow-300 rounded-full animate-ping delay-200"></div>
            </div> */}

            {/* Microphone button with pulse animations */}
            <div className="relative">
              {isRecording && pulseEffects.small && (
                <div className="absolute inset-0 -m-3 bg-yellow-400 opacity-30 rounded-full animate-ping"></div>
              )}
              {isRecording && pulseEffects.medium && (
                <div className="absolute inset-0 -m-6 bg-yellow-500 opacity-20 rounded-full animate-pulse"></div>
              )}
              {isRecording && pulseEffects.large && (
                <div className="absolute inset-0 -m-12 bg-yellow-600 opacity-10 rounded-full animate-pulse"></div>
              )}
              {isGlowing && (
                <div className="absolute inset-0 -m-5 bg-yellow-400 opacity-50 rounded-full animate-ping"></div>
              )}
              {isGlowing && (
                <div className="absolute inset-0 -m-10 bg-yellow-400 opacity-30 rounded-full animate-pulse"></div>
              )}
              <button
                onClick={handleMicClick}
                className={`relative z-10 bg-black rounded-full w-36 h-36 flex items-center justify-center border-2 ${
                  isGlowing
                    ? "border-yellow-300 shadow-xl shadow-yellow-400/60"
                    : "border-yellow-400 shadow-lg"
                } shadow-yellow-400/30 transition-all duration-500 ${
                  isRecording ? "scale-110" : "hover:scale-105"
                } backdrop-blur-sm`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-yellow-900/20 rounded-full"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/5 via-transparent to-transparent rounded-full"></div>
                <div className="flex items-center justify-center">
                  <span
                    className={`text-yellow-400 font-bold text-6xl drop-shadow-xl tracking-tighter ${
                      isRecording ? "animate-pulse" : ""
                    }`}
                  >
                    <img src={logo} alt="logo" className="w-20 h-20" />
                  </span>
                </div>
              </button>
            </div>

            <p className="text-yellow-400 text-sm mt-5 font-medium drop-shadow-md bg-black/30 px-4 py-1 rounded-full backdrop-blur-sm border border-yellow-400/20">
              {speech}
            </p>

            {/* Transcription Box with enhanced styling */}
            <div className="relative p-4 w-full ">
              <div className="absolute inset-0 "></div>
              <div className="relative">
                <div className="flex justify-between items-center mb-2">
                  {/* <div className="text-yellow-400 text-sm font-medium">
                  Real-time transcription
                </div> */}
                  {isRecording && (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></div>
                      <span className="text-red-400 text-xs">LIVE</span>
                    </div>
                  )}
                </div>
                <div
                  ref={containerRef}
                  className=" bg-white backdrop-blur-sm rounded-xl p-4 h-16 text-white shadow-inner border border-gray-800 overflow-y-auto scrollbar-hide ring-yellow-400/80"
                >
                  <div className="relative">
                    <span className="text-black">{transcripts}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Input Area with glass effect */}
            <div className="relative p-3 ">
              <div className="absolute inset-0"></div>
              <div className="relative flex items-center space-x-2">
                <input
                  type="text"
                  disabled={
                    status === "disconnected" || status === "connecting"
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSubmit(e.target.value);
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 bg-white text-black p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400/80 placeholder-gray-500 border border-gray-700"
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="p-3 bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-xl hover:from-yellow-400 hover:to-yellow-300 transition-colors shadow-md hover:shadow-yellow-400/30"
                >
                  <Send size={20} className="text-black" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={toggleExpand}
          className="bg-black rounded-full w-16 h-16 flex items-center justify-center shadow-2xl border-2 border-yellow-400 hover:bg-gray-900 transition-all hover:scale-110 hover:shadow-yellow-400/50"
        >
          <div className="relative">
            <div className="absolute inset-0 -m-1 bg-yellow-400/40 rounded-full animate-ping"></div>
            <div className="absolute inset-0 -m-3 bg-yellow-400/20 rounded-full animate-pulse"></div>
            <span className="text-yellow-400 font-bold text-3xl relative z-10 drop-shadow-xl tracking-tighter">
              <img src={logo} alt="logo" className="w-10 h-10" />
            </span>
          </div>
        </button>
      )}
    </div>
  );
};
export default VoiceAIWidget;
