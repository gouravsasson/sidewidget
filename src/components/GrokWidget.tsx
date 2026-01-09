import React, { useState, useEffect, useRef } from "react";
import EventEmitter from "eventemitter3";
import { useWidgetContext } from "../constexts/WidgetContext";
import { Mic, Send, Loader2, X, Minimize2, Volume2, VolumeX } from "lucide-react";
import logo from "../assets/logo.png";
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
    Track,
} from "livekit-client";
import axios from "axios";

export interface WidgetTheme {
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
    is_glowing: boolean;
    is_transparent: boolean;
    custom_form_fields: Array<{
        id: number;
        type: "text" | "email" | "tel" | "number" | "textarea";
        label: string;
        isDefault: boolean;
    }>;
}

// Main Component
const RetellaiAgent = () => {
    const decoder = new TextDecoder();
    const containerRef = useRef<HTMLDivElement>(null);
    const { agent_id, schema } = useWidgetContext();
    const [widgetTheme, setWidgetTheme] = useState<WidgetTheme | null>(null);
    const onlyOnce = useRef(false);
    const [expanded, setExpanded] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const room = useRoomContext();
    const status = useConnectionState(room);

    const [speech, setSpeech] = useState("");
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
    const serverUrl = "wss://abcd-sw47y5hk.livekit.cloud";
    const audioTrackRef = useRef<MediaStreamTrack | null>(null);
    const [muted, setMuted] = useState(false);
    const [transcripts, setTranscripts] = useState("");
    const transcriptEmitterRef = useRef(new EventEmitter());

    // LiveKit Transcriptions hook
    const transcriptionSegments = useTranscriptions();

    // LiveKit Chat hook
    const { chatMessages, send, isSending: isSendingChat } = useChat();
    const [chatInput, setChatInput] = useState("");

    // Form & UI state (to match CustomWidget design)
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [showform, setShowform] = useState(false);
    const [formSubmitting, setFormSubmitting] = useState(false);

    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const getFieldIcon = (type: string) => {
        if (type === "email") return <svg className="h-5 w-5 text-gray-400" />;
        if (type === "tel") return <svg className="h-5 w-5 text-gray-400" />;
        return <svg className="h-5 w-5 text-gray-400" />;
    };

    const renderIcon = (className: string) => {
        if (widgetTheme?.bot_logo) {
            return (
                <img
                    src={widgetTheme.bot_logo}
                    alt="Custom Icon"
                    className={className}
                    style={{ objectFit: "cover", width: "100%", height: "100%", borderRadius: "50%" }}
                />
            );
        }
        return <Mic className={className} style={{ color: widgetTheme?.bot_icon_color }} />;
    };

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

    const handleSendChat = () => {
        if (chatInput.trim() && !isSendingChat) {
            send(chatInput);
            setChatInput("");
        }
    };

    const baseUrl = "https://test.snowie.ai/api/create-room/";
    const settingsBaseUrl = "https://test.snowie.ai";

    // Fetch widget theme settings
    useEffect(() => {
        if (onlyOnce.current) return;
        const getWidgetTheme = async () => {
            try {
                const response = await axios.get(
                    `${settingsBaseUrl}/api/thunder-widget-settings/${schema}/${agent_id}/?type=thunder_emotion`
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

    // Apply bot_mute_on_tab_change setting
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
                document.removeEventListener("visibilitychange", handleVisibilityChange);
            };
        }
    }, [widgetTheme?.bot_mute_on_tab_change]);

    // Apply bot_show_form setting
    useEffect(() => {
        if (widgetTheme?.bot_show_form) {
            // Form will be shown based on bot_show_form setting
        }
    }, [widgetTheme?.bot_show_form]);

    // Apply bot_auto_start setting
    useEffect(() => {
        const callId = localStorage.getItem("callId");
        if (widgetTheme?.bot_auto_start && !callId && status === "disconnected") {
            handleSubmit();
        }
    }, [widgetTheme?.bot_auto_start, status]);

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

    // Clear transcripts when disconnected (don't persist)
    useEffect(() => {
        if (status === "disconnected") {
            setTranscripts("");
        }
    }, [status]);

    const startRecording = async () => {
        try {
            // Check if already connected
            if (status === "connected") {
                // Enable the local audio track if it exists
                if (audioTrackRef.current) {
                    audioTrackRef.current.enabled = true;
                    setMuted(false);
                    setIsRecording(true);

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

    const togglemute = () => {
        setExpanded(!expanded);
        if (audioTrackRef.current) {
            audioTrackRef.current.enabled = !audioTrackRef.current.enabled;
            setMuted(!muted);
        } else {
            setMuted(!muted);
        }
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
            setMuted(false);
            setTranscripts("");
            setExpanded(false);
        } catch (err) {
            console.error("Error closing:", err);
        }
    };

    const doStart = async (payload: Record<string, any>) => {
        try {
            const res = await axios.post(`${baseUrl}`, payload);
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
                },
            });

            const [audioTrack] = stream.getAudioTracks();

            audioTrack.enabled = true;

            // Publish the track
            await room.localParticipant.publishTrack(audioTrack, {
                name: "microphone",
                source: Track.Source.Microphone,
            });

            audioTrackRef.current = audioTrack;
            setMuted(false);
            setIsRecording(true);

            localStorage.setItem("formshow", "false");
            setTranscripts("");
        } catch (err) {
            console.error("Form error:", err);
            alert("Failed to start call. Please check your microphone and try again.");
        }
    };

    const handleSubmit = async () => {
        const microphonePermission = localStorage.getItem("microphonePermission");
        if (microphonePermission === "denied") {
            alert("Microphone permission is required. Please enable it in your browser settings.");
            return;
        }

        await doStart({ agent_code: agent_id, schema_name: schema });
    };

    const startFromForm = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            if (status === "disconnected") {
                setFormSubmitting(true);
                const payload: Record<string, any> = {
                    agent_code: agent_id,
                    schema_name: schema,
                };
                Object.entries(formData).forEach(([key, value]) => {
                    payload[key] = value;
                });
                await doStart(payload);
            } else {
                // If already connected, stop the call similar to handleClose
                await handleClose();
            }
        } catch (err) {
            console.error("Error in startFromForm:", err);
        } finally {
            setFormSubmitting(false);
        }
    };

    // Auto-scroll transcript
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [transcripts, transcriptionSegments, chatMessages]);

    // Loading state check
    if (!onlyOnce.current || !widgetTheme) {
        return <div className="text-white text-center">Loading...</div>;
    }

    return (
        <div
            className="fixed bottom-[74px] right-6 z-50 flex flex-col items-end"
            style={{
                zIndex: 999,
                ...(() => {
                    const baseStyles: React.CSSProperties = {
                        position: "fixed",
                        zIndex: 1000,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                    };

                    if (expanded) {
                        baseStyles.width = "min(90vw, 400px)";
                        baseStyles.height = "min(90vh, 600px)";
                    } else {
                        baseStyles.width = "min(40vw, 160px)";
                        baseStyles.height = "min(20vh, 80px)";
                    }

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
                })(),
            }}
        >
            <style>{`
              @keyframes glowPulse {
                0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
                70% { box-shadow: 0 0 0 20px rgba(37, 99, 235, 0); }
                100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
              }
              .glow-pulsate { animation: glowPulse 2s infinite; }
              .pulse-ring { position: absolute; top: 50%; left: 50%; width: 100px; height: 100px; background: rgba(37, 99, 235, 0.3); border-radius: 50%; transform: translate(-50%, -50%); animation: pulseRing 2s infinite; pointer-events: none; }
              @keyframes pulseRing { 0% { transform: translate(-50%, -50%) scale(0.8); opacity:1 } 100% { transform: translate(-50%, -50%) scale(1.8); opacity:0 } }

              @media (max-width: 640px) {
                .widget-container { width: 90vw !important; height: 80vh !important; }
                .mic-button { width: 30vw !important; height: 30vw !important; }
                .status-bar { font-size: 0.8rem !important; padding: 0.5rem 1rem !important; }
                .form-input { padding: 0.5rem 2rem !important; font-size: 0.9rem !important; }
              }

              .transparent-background { background: ${widgetTheme?.bot_background_color}15 !important; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid ${widgetTheme?.bot_border_color}30; }

              .transparent-widget .header, .transparent-widget .mic-button, .transparent-widget .status-bar, .transparent-widget .transcript-box, .transparent-widget .chat-input, .transparent-widget input, .transparent-widget button, .transparent-widget .form-container, .transparent-widget form { background: inherit !important; opacity: 1 !important; color: inherit !important; }

              .transparent-widget .transcript-box, .transparent-widget input, .transparent-widget .chat-input { background: white !important; color: #374151 !important; }

            `}</style>

            {expanded ? (
                <div className="bg-gray-900/50 backdrop-blur-sm w-[309px] rounded-2xl shadow-2xl overflow-hidden border"
                    style={{
                        backgroundColor: widgetTheme?.is_transparent
                            ? `${widgetTheme?.bot_background_color}15`
                            : widgetTheme?.bot_background_color || "#1f2937",
                        borderColor: widgetTheme?.bot_border_color || "#374151",
                        backdropFilter: widgetTheme?.is_transparent ? "blur(12px)" : "none",
                    }}>
                    <div className="pt-10 flex flex-col items-center justify-center relative h-full w-full">
                        {widgetTheme?.bot_show_form && showform ? (
                            <div className="flex flex-col items-center justify-center h-full p-6 form-container">
                                <h3 className="text-lg font-semibold mb-6" style={{ color: widgetTheme?.bot_text_color }}>Enter Your Details</h3>
                                <form onSubmit={startFromForm} className="w-full max-w-sm space-y-4">
                                    {widgetTheme.custom_form_fields.map((field) => (
                                        <div key={field.id} className="w-full">
                                            <label className="block text-sm font-medium mb-1" style={{ color: widgetTheme?.bot_text_color }}>{capitalize(field.label)}</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                                                    {getFieldIcon(field.type)}
                                                </div>
                                                {field.type === 'tel' ? (
                                                    <PhoneInput
                                                        country={localStorage.getItem('continentcode')?.toLowerCase()}
                                                        value={formData[field.label.toLowerCase()] || ''}
                                                        onChange={(phone) => setFormData({ ...formData, [field.label.toLowerCase()]: phone })}
                                                        inputProps={{ required: true }}
                                                        inputClass="w-full p-3 pl-10 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
                                                    />
                                                ) : (
                                                    <input type={field.type} required value={formData[field.label.toLowerCase()] || ''} onChange={(e) => setFormData({ ...formData, [field.label.toLowerCase()]: e.target.value })} className="w-full p-3 pl-10 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700" placeholder={`Enter your ${field.label.toLowerCase()}`} />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <button type="submit" className="w-full p-3 rounded-xl text-white transition-colors hover:opacity-90 form-button" style={{ backgroundColor: widgetTheme?.bot_button_color }}>
                                        {formSubmitting ? (
                                            <div className="flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin mr-2 icon" />Connecting to AI Assistant</div>
                                        ) : (
                                            'Submit'
                                        )}
                                    </button>
                                </form>
                            </div>
                        ) : (
                            <div className="black/30 w-full h-full flex items-center justify-center">
                                <div className="relative flex flex-col items-center justify-center h-full w-full">
                                    <button
                                        onClick={handleClose}
                                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 px-3 py-1 rounded bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                                        style={{ color: widgetTheme?.bot_text_color }}
                                    >
                                        <X className="w-4 h-4" style={{ color: widgetTheme?.bot_text_color }} />
                                    </button>

                                    {/* Header */}
                                    <div className="px-6 py-4 flex justify-between items-center header" style={{ backgroundColor: widgetTheme?.bot_bubble_color }}>
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: widgetTheme?.bot_button_color }}>
                                                {renderIcon("w-full h-full icon")}
                                            </div>
                                            <span className="font-semibold text-lg" style={{ color: widgetTheme?.bot_text_color }}>{widgetTheme?.bot_name || 'AI Assistant'}</span>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <button onClick={togglemute} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button">
                                                {muted ? <VolumeX className="w-5 h-5 icon" style={{ color: widgetTheme?.bot_text_color }} /> : <Volume2 className="w-5 h-5 icon" style={{ color: widgetTheme?.bot_text_color }} />}
                                            </button>
                                            <button onClick={() => setExpanded(!expanded)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button">
                                                <Minimize2 className="w-5 h-5 icon" style={{ color: widgetTheme?.bot_text_color }} />
                                            </button>
                                            <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors header-button">
                                                <X className="w-5 h-5 icon" style={{ color: widgetTheme?.bot_text_color }} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center justify-center py-8">
                                        <button onClick={handleMicClick} className={`w-40 h-40 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg mb-6 mic-button overflow-hidden`} style={{ backgroundColor: widgetTheme?.bot_button_color }}>
                                            {renderIcon("w-full h-full")}
                                        </button>
                                        <div className="px-6 py-2 rounded-full text-sm font-medium status-bar" style={{ backgroundColor: widgetTheme?.bot_status_bar_color, color: widgetTheme?.bot_status_bar_text_color }}>{speech}</div>
                                    </div>
                                </div>
                            </div>
                        )}

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

                                {widgetTheme?.bot_show_transcript ? (
                                    <div ref={containerRef} className="bg-white rounded-2xl p-4 h-32 text-gray-600 shadow-inner border overflow-y-auto text-sm transcript-box" style={{ fontStyle: transcripts ? 'normal' : 'italic', color: transcripts ? '#374151' : '#9CA3AF' }}>
                                        {transcriptionSegments.length > 0 ? (
                                            transcriptionSegments.map((segment: any, index: number) => (
                                                <div key={`seg-${index}`} className="text-sm mb-1" style={{ color: widgetTheme?.bot_text_color }}>{segment.text}</div>
                                            ))
                                        ) : (
                                            transcripts || 'Your conversation will appear here...'
                                        )}
                                    </div>
                                ) : null}

                                {widgetTheme?.bot_show_chat && (
                                    <div className="flex gap-2 mt-3">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                            placeholder="Type your message..."
                                            disabled={status !== 'connected'}
                                            className="flex-1 bg-white text-gray-700 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder-gray-400 border border-gray-200 chat-input"
                                        />
                                        <button type="button" onClick={handleSendChat} disabled={status !== 'connected' || isSendingChat} className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: widgetTheme?.bot_button_color }}>
                                            {isSendingChat ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-5 h-5 icon" style={{ color: widgetTheme?.bot_button_text_color }} />
                                            )}
                                        </button>
                                    </div>
                                )}
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
                        style={{
                            backgroundColor: widgetTheme?.bot_button_color || "#1f2937",
                            borderColor: widgetTheme?.bot_animation_color || "#FBBF24",
                            boxShadow: widgetTheme?.is_glowing
                                ? `0 0 30px ${widgetTheme?.bot_animation_color}80`
                                : undefined,
                        }}
                    >
                        <div className="relative">
                            {widgetTheme?.is_glowing && (
                                <>
                                    <div
                                        className="absolute inset-0 -m-1 rounded-full animate-ping"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color}40` }}
                                    ></div>
                                    <div
                                        className="absolute inset-0 -m-3 rounded-full animate-pulse"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color}20` }}
                                    ></div>
                                </>
                            )}
                            <span className="text-yellow-400 font-bold text-3xl relative z-10 drop-shadow-xl tracking-tighter">
                                <img 
                                    src={widgetTheme?.bot_logo || logo} 
                                    alt="logo" 
                                    className="w-[54px] h-[54px]" 
                                />
                            </span>
                        </div>
                    </button>
                    <button
                        onClick={toggleExpand}
                        className="inline-block px-4 py-1 bg-black text-[#FFD700] border-2 border-[#FFD700] rounded-full font-inter font-bold text-xs no-underline text-center transition-all duration-300 hover:bg-black"
                        style={{
                            backgroundColor: widgetTheme?.bot_button_color || "#000000",
                            color: widgetTheme?.bot_button_text_color || "#FFD700",
                            borderColor: widgetTheme?.bot_animation_color || "#FFD700",
                        }}
                    >
                        {`Talk to ${widgetTheme?.bot_name || "AI Assistant"}`.toUpperCase()}
                    </button>
                </div>
            )}

            <RoomAudioRenderer muted={muted} />
        </div>
    );
};

export default RetellaiAgent;