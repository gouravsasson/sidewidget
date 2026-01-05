import React, { useState, useEffect, useRef } from "react";
import EventEmitter from "eventemitter3";
import { useWidgetContext } from "../constexts/WidgetContext";
import {
  Mic,
  Send,
  X,
  Minimize2,
  Phone,
  Mail,
  User,
  Loader2,
} from "lucide-react";
import logo from "../assets/logo.png";
import {
  RoomAudioRenderer,
  useConnectionState,
  useRoomContext,
  useIsMuted,
  useTracks,
  TrackReference,
} from "@livekit/components-react";
import {
  DataPacket_Kind,
  RemoteParticipant,
  RoomEvent,
  Track,
} from "livekit-client";
import axios from "axios";

// Main Component
const RetellaiAgent = () => {
  const decoder = new TextDecoder();
  const containerRef = useRef(null);
  const{agent_id,schema}=useWidgetContext();
  const [expanded, setExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);
  const [pulseEffects, setPulseEffects] = useState({
    small: false,
    medium: false,
    large: false,
  });
  const room = useRoomContext();
  const status = useConnectionState(room);
  const serverUrl = "wss://abcd-sw47y5hk.livekit.cloud";
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState("");
  const transcriptEmitterRef = useRef(new EventEmitter());
  
  const baseUrl = "https://test.snowie.ai/api/create-room/";

  // Setup transcript listener
  useEffect(() => {
    const transcriptEmitter = transcriptEmitterRef.current;

    // LiveKit Room event listener
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      kind?: DataPacket_Kind,
      topic?: string
    ) => {
      let decodedData = decoder.decode(payload);
      let event = JSON.parse(decodedData);
      transcriptEmitter.emit("dataReceived", event, participant, kind, topic);
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);

    // Listen for the custom 'dataReceived' event
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
  useEffect(() => {
    const requestMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStorage.setItem("microphonePermission", "granted");
        // Stop the tracks immediately as we just needed permission
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Microphone permission denied:", err);
        localStorage.setItem("microphonePermission", "denied");
      }
    };

    if (!localStorage.getItem("microphonePermission")) {
      requestMicPermission();
    }
  }, []);

  const startRecording = async () => {
    try {
      // Check if already connected
      if (status === "connected") {
        // Enable the local audio track if it exists
        if (audioTrackRef.current) {
          audioTrackRef.current.enabled = true;
          setMuted(false);
          setIsRecording(true);
          setIsGlowing(true);
        }
      } else {
        // Not connected yet, start the call
        await handleSubmit();
      }
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = async () => {
    try {
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
        setMuted(true);
        setIsRecording(false);
        setIsGlowing(false);
      }
    } catch (err) {
      console.error("Error stopping recording:", err);
    }
  };

  const toggleExpand = async () => {
    const priorCallIdList = JSON.parse(
      localStorage.getItem("priorCallIdList") || "[]"
    );
    setExpanded(true);
    if (
      !expanded &&
      status === "disconnected" &&
      priorCallIdList.length === 0
    ) {
      localStorage.setItem("formshow", "true");
    } else if (muted) {
      setMuted(false);
    }
  };

  const handleMicClick = () => {
    isRecording ? stopRecording() : startRecording();
  };

  const handleClose = async () => {
    try {
      // Stop the audio track before disconnecting
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current = null;
      }
      
      // Disconnect from room
      await room.disconnect();
      
      // Reset states
      setIsRecording(false);
      setIsGlowing(false);
      setMuted(false);
      setTranscripts("");
      setExpanded(false);
    } catch (err) {
      console.error("Error closing:", err);
    }
  };

  const handleSubmit = async () => {
    const microphonePermission = localStorage.getItem("microphonePermission");
    console.log("microphonePermission", microphonePermission);

    if (microphonePermission === "denied") {
      alert("Microphone permission is required. Please enable it in your browser settings.");
      return;
    }

    try {
      const res = await axios.post(`${baseUrl}`, {
        "agent_code":agent_id,
        "schema_name": schema
      });
      console.log("Create room response:", res.data);

      const decryptedPayload = res.data.response;
      const accessToken = decryptedPayload.token;

      // Connect to room first
      await room.connect(serverUrl, accessToken);
      
      // Request microphone with proper constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      const [audioTrack] = stream.getAudioTracks();
      
      // Verify the track is enabled and has proper settings
      console.log("Audio track settings:", audioTrack.getSettings());
      console.log("Audio track state:", audioTrack.readyState);
      console.log("Audio track enabled:", audioTrack.enabled);
      
      // Ensure track is enabled
      audioTrack.enabled = true;
      
      // Publish the track
      await room.localParticipant.publishTrack(audioTrack, {
        name: 'microphone',
        source: Track.Source.Microphone,
      });
      
      audioTrackRef.current = audioTrack;
      setMuted(false);
      setIsRecording(true);
      setIsGlowing(true);
      localStorage.setItem("formshow", "false");
      setTranscripts("");
      
      console.log("Audio track published successfully");
    } catch (err) {
      console.error("Form error:", err);
      alert("Failed to start call. Please check your microphone and try again.");
    }
  };

  // Auto-scroll transcript
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcripts]);

  // Pulse effects for recording animation
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

  return (
    <div
      className="fixed bottom-[74px] right-6 z-50 flex flex-col items-end"
      style={{
        zIndex: 999,
      }}
    >
      {expanded ? (
        <div className="bg-gray-900/50 backdrop-blur-sm w-[309px] rounded-2xl shadow-2xl overflow-hidden border">
          <div className="pt-10 flex flex-col items-center justify-center relative h-full w-full">
            <div className="black/30 w-full h-full flex items-center justify-center">
              <div className="relative flex flex-col items-center justify-center h-full w-full">
                <button 
                  onClick={handleClose} 
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 px-3 py-1 rounded bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                >
                  close
                </button>

                <div className="relative group">
                  <button
                    onClick={handleMicClick}
                    className={`relative z-10 bg-black/80 rounded-full w-36 h-36 flex items-center justify-center border-2
                      ${isGlowing
                        ? "border-yellow-300 shadow-[0_0_30px_10px_rgba(250,204,21,0.3)]"
                        : "border-yellow-400 shadow-lg"
                      } transition-all duration-500 ${
                        isRecording ? "scale-110" : "hover:scale-105"
                      } backdrop-blur-sm
                      group-hover:shadow-[0_0_50px_15px_rgba(250,204,21,0.2)]`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-yellow-900/20 rounded-full"></div>
                    <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/5 via-transparent to-transparent rounded-full"></div>

                    <div className="relative">
                      <img
                        src={logo}
                        alt=""
                        className={`w-16 h-16 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]
                          ${isRecording ? "animate-[pulse_1.5s_ease-in-out_infinite]" : ""}
                          transition-transform duration-300 group-hover:scale-110`}
                      />

                      {isRecording && (
                        <div className="absolute -inset-4">
                          <div className="absolute inset-0 border-2 border-yellow-400/50 rounded-full animate-[ripple_2s_ease-out_infinite]"></div>
                          <div className="absolute inset-0 border-2 border-yellow-400/30 rounded-full animate-[ripple_2s_ease-out_infinite_0.5s]"></div>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="relative p-4 w-full">
              <div className="absolute inset-0"></div>
              <div className="relative">
                <div className="flex justify-between items-center mb-2">
                  {isRecording && (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></div>
                      <span className="text-red-400 text-xs">LIVE</span>
                    </div>
                  )}
                </div>
                <div
                  ref={containerRef}
                  className="bg-white backdrop-blur-sm rounded-xl p-4 h-16 text-white shadow-inner border border-gray-800 overflow-y-auto scrollbar-hide ring-yellow-400/80"
                >
                  <div className="relative">
                    <span className="text-black">{transcripts || "Waiting for conversation..."}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {status === "disconnected" && (
              <button 
                onClick={handleSubmit} 
                className="absolute top-2 left-2 text-gray-400 hover:text-gray-200 px-3 py-1 rounded bg-green-800/50 hover:bg-green-700/50 transition-colors"
              >
                start
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 justify-center">
          <button
            onClick={toggleExpand}
            className="bg-black rounded-full w-20 h-20 flex items-center justify-center shadow-2xl border-2 border-yellow-400 hover:bg-gray-900 transition-all hover:scale-110 hover:shadow-yellow-400/50"
          >
            <div className="relative">
              <div className="absolute inset-0 -m-1 bg-yellow-400/40 rounded-full animate-ping"></div>
              <div className="absolute inset-0 -m-3 bg-yellow-400/20 rounded-full animate-pulse"></div>
              <span className="text-yellow-400 font-bold text-3xl relative z-10 drop-shadow-xl tracking-tighter">
                <img src={logo} alt="logo" className="w-[54px] h-[54px]" />
              </span>
            </div>
          </button>
          <button
            onClick={toggleExpand}
            className="inline-block px-4 py-1 bg-black text-[#FFD700] border-2 border-[#FFD700] rounded-full font-inter font-bold text-xs no-underline text-center transition-all duration-300 hover:bg-black"
          >
            TALK TO ME
          </button>
        </div>
      )}

      <RoomAudioRenderer muted={muted} />
    </div>
  );
};

export default RetellaiAgent;