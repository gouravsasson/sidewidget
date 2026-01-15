import React, { useState, useEffect, useRef } from "react";
import EventEmitter from "eventemitter3";
import { useWidgetContext } from "../constexts/WidgetContext";
import { Mic, Send, Loader2, X, Minimize2, Volume2, VolumeX } from "lucide-react";
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

const RetellaiAgent = ({ isWidget = false, colors, botName, botIcon }: RetellaiAgentProps) => {
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
    const [isGlowing, setIsGlowing] = useState(false);

    const [latestEvent, setLatestEvent] = useState<{ type: 'transcription' | 'chat', text: string, isLocal: boolean } | null>(null);
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
        if (status === "disconnected") {
            setIsRecording(false);
            setIsGlowing(false);
            setLatestEvent(null);
        }
    }, [status]);

    console.log("status:", status)

    const serverUrl = "wss://abcd-sw47y5hk.livekit.cloud";
    const audioTrackRef = useRef<MediaStreamTrack | null>(null);
    const [muted, setMuted] = useState(false);
    const [transcripts, setTranscripts] = useState("");
    const transcriptEmitterRef = useRef(new EventEmitter());

    const transcriptionSegments = useTranscriptions();
    const { chatMessages, send, isSending: isSendingChat } = useChat();
    const [chatInput, setChatInput] = useState("");

    // Effect for transcriptions
    useEffect(() => {
        if (transcriptionSegments.length > 0) {
            const segment = transcriptionSegments[transcriptionSegments.length - 1] as any;
            const isLocal = segment.participant?.isLocal || segment.participantInfo?.isLocal;
            setLatestEvent({
                type: 'transcription',
                text: segment.text,
                isLocal: !!isLocal
            });
        }
    }, [transcriptionSegments]);

    // Effect for chat
    useEffect(() => {
        if (chatMessages.length > 0) {
            const msg = chatMessages[chatMessages.length - 1];
            const isLocal = msg.from?.isLocal;
            setLatestEvent({
                type: 'chat',
                text: msg.message,
                isLocal: !!isLocal
            });
        }
    }, [chatMessages]);

    const [formData, setFormData] = useState<Record<string, string>>({});
    const [showform, setShowform] = useState(false);
    const [formSubmitting, setFormSubmitting] = useState(false);

    const baseUrl = "https://test.snowie.ai/api/create-room/";
    const settingsBaseUrl = "https://test.snowie.ai";

    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    const getFieldIcon = (type: string) => {
        if (type === "email") return <svg className="h-5 w-5 text-gray-400" />;
        if (type === "tel") return <svg className="h-5 w-5 text-gray-400" />;
        return <svg className="h-5 w-5 text-gray-400" />;
    };

    const renderIcon = (className: string) => {
        const logoToUse = botIcon || widgetTheme?.bot_logo;
        if (logoToUse) {
            return (
                <img
                    src={logoToUse}
                    alt="Custom Icon"
                    className={className}
                    style={{ objectFit: "cover", width: "100%", height: "100%", borderRadius: "50%" }}
                />
            );
        }
        return <Mic className={className} style={{ color: widgetTheme?.bot_icon_color || "#ffffff" }} />;
    };

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

    // Initialize form data
    useEffect(() => {
        if (widgetTheme?.custom_form_fields) {
            const initialData: Record<string, string> = {};
            widgetTheme.custom_form_fields.forEach((field) => {
                initialData[field.label.toLowerCase()] = "";
            });
            setFormData(initialData);
        }
    }, [widgetTheme?.custom_form_fields]);

    // Show form based on setting
    useEffect(() => {
        if (widgetTheme?.bot_show_form) {
            setShowform(true);
        }
    }, [widgetTheme?.bot_show_form]);

    // Tab change mute setting
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

    // Auto start setting
    useEffect(() => {
        const callId = localStorage.getItem("callId");
        if (widgetTheme?.bot_auto_start && !callId && status === "disconnected") {
            handleSubmit();
        }
    }, [widgetTheme?.bot_auto_start, status]);

    // Setup transcript listener
    useEffect(() => {
        const transcriptEmitter = transcriptEmitterRef.current;

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

    // Clear transcripts when disconnected
    useEffect(() => {
        if (status === "disconnected") {
            setTranscripts("");
        }
    }, [status]);

    // Auto-scroll transcript
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [transcripts, transcriptionSegments, chatMessages]);

    const startRecording = async () => {
        try {
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

    const toggleExpand = async () => {
        const priorCallIdList = JSON.parse(
            localStorage.getItem("priorCallIdList") || "[]"
        );
        setExpanded(true);
        if (!expanded && status === "disconnected" && priorCallIdList.length === 0) {
            localStorage.setItem("formshow", "true");
        } else if (muted) {
            setMuted(false);
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
        } catch (err) {
            console.error("Error closing:", err);
        }
    };

    const doStart = async (payload: Record<string, any>) => {
        try {
            const res = await axios.post(`${baseUrl}`, payload);
            const decryptedPayload = res.data.response;
            const accessToken = decryptedPayload.token;

            await room.connect(serverUrl, accessToken);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const [audioTrack] = stream.getAudioTracks();
            audioTrack.enabled = true;

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
        } catch (err) {
            console.error("Form error:", err);
            alert("Failed to start call. Please check your microphone and try again.");
        }
    };

    // Pulse effects for recording animation


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
                await handleClose();
            }
        } catch (err) {
            console.error("Error in startFromForm:", err);
        } finally {
            setFormSubmitting(false);
        }
    };

    // Loading state
    if (!onlyOnce.current || !widgetTheme) {
        return <div className="text-white text-center">Loading...</div>;
    }

    // Simplified return to match VoiceAssistant UI
    if (isWidget && colors) {
        return (
            <div className="flex flex-col h-full bg-gray-50" style={{ height: "calc(100% - 0px)" }}>
                {/* Microphone Section */}
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
                        {isRecording ? "Listening..." : `Talk To ${botName || "AI Assistant"}`}
                    </div>
                </div>

                {/* Transcription Box */}
                <div className="px-6 py-4 h-48">
                    <div
                        ref={containerRef}
                        className="bg-white rounded-2xl p-4 h-full text-gray-600 shadow-inner border overflow-y-auto text-sm"
                        style={{
                            fontStyle: (latestEvent || transcriptionSegments.length > 0) ? "normal" : "italic",
                            color: "#374151",
                        }}
                    >
                        {latestEvent ? (
                            <div className={`flex flex-col mb-2 ${latestEvent.isLocal ? "items-end" : "items-start"}`}>
                                <div className={`px-3 py-2 rounded-lg max-w-[85%] ${latestEvent.isLocal ? "bg-blue-100 text-black" : " text-black"
                                    }`}>
                                    {latestEvent.text}
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-400 italic text-center mt-4">
                                {isRecording ? "Listening..." : "Your conversation will appear here..."}
                            </div>
                        )}
                        <div ref={containerRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-6 pt-0">
                    <div className="flex items-center space-x-3">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSendChat();
                                }
                            }}
                            placeholder="Type your message..."
                            disabled={status !== "connected"}
                            className="flex-1 bg-white text-gray-700 p-3 rounded-xl focus:outline-none focus:ring-2 placeholder-gray-400 border border-gray-200"
                            style={{
                                borderColor: colors.borderColor,
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleSendChat}
                            disabled={status !== "connected" || isSendingChat}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-md"
                            style={{ backgroundColor: colors.buttonColor }}
                        >
                            {isSendingChat ? (
                                <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.buttonTextColor }} />
                            ) : (
                                <Send className="w-5 h-5" style={{ color: colors.buttonTextColor }} />
                            )}
                        </button>
                    </div>
                </div>
                <RoomAudioRenderer muted={muted} />
            </div>
        );
    }

    // Position styles
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
            <style>{`
                @media (max-width: 640px) {
                    .widget-container {
                        width: 90vw !important;
                        height: ${widgetTheme?.bot_show_form && showform ? "80vh" : "85vh"} !important;
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

                .transparent-widget .header,
                .transparent-widget .mic-button,
                .transparent-widget .status-bar,
                .transparent-widget .transcript-box,
                .transparent-widget .chat-input,
                .transparent-widget input,
                .transparent-widget button,
                .transparent-widget .form-container,
                .transparent-widget form {
                    background: inherit !important;
                    opacity: 1 !important;
                    color: inherit !important;
                }

                .transparent-widget .transcript-box,
                .transparent-widget input,
                .transparent-widget .chat-input {
                    background: white !important;
                    color: #374151 !important;
                }
            `}</style>

            {expanded ? (
                <div
                    className={`rounded-3xl shadow-2xl overflow-hidden widget-container ${widgetTheme?.is_transparent ? "transparent-background transparent-widget" : ""}`}
                    style={{
                        width: "min(90vw, 400px)",
                        height: widgetTheme?.bot_show_form && showform ? "min(90vh, 550px)" : "min(90vh, 600px)",
                        backgroundColor: widgetTheme?.is_transparent ? undefined : (widgetTheme?.bot_background_color || "#ffffff"),
                    }}
                >
                    {/* Header - Blue header like in the design */}
                    <div
                        className="px-6 py-4 flex justify-between items-center"
                        style={{
                            backgroundColor: widgetTheme?.bot_bubble_color || "#2563eb",
                            color: widgetTheme?.bot_text_color || "#ffffff"
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
                                {widgetTheme?.bot_name || 'AI Assistant'}
                            </span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={togglemute}
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                            >
                                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
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

                    {/* Main Content - White background */}
                    <div className="flex flex-col h-[calc(100%-64px)] overflow-hidden">

                        {widgetTheme?.bot_show_form && showform ? (
                            <div className="flex-1 p-6 flex flex-col items-center justify-center">
                                <h3
                                    className="text-lg font-semibold mb-6"
                                    style={{ color: widgetTheme?.bot_text_color || "#1f2937" }}
                                >
                                    Enter Your Details
                                </h3>
                                <form onSubmit={startFromForm} className="w-full space-y-4">
                                    {widgetTheme.custom_form_fields.map((field) => (
                                        <div key={field.id} className="w-full">
                                            <label
                                                className="block text-sm font-medium mb-1"
                                                style={{ color: widgetTheme?.bot_text_color || "#374151" }}
                                            >
                                                {capitalize(field.label)}
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    {getFieldIcon(field.type)}
                                                </div>
                                                {field.type === 'tel' ? (
                                                    <PhoneInput
                                                        country={localStorage.getItem('continentcode')?.toLowerCase() || 'us'}
                                                        value={formData[field.label.toLowerCase()] || ''}
                                                        onChange={(phone) => setFormData({ ...formData, [field.label.toLowerCase()]: phone })}
                                                        inputProps={{ required: true }}
                                                        containerClass="w-full"
                                                        inputClass="w-full p-3 pl-12 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 bg-white"
                                                        buttonClass="border-r border-gray-300"
                                                    />
                                                ) : (
                                                    <input
                                                        type={field.type}
                                                        required
                                                        value={formData[field.label.toLowerCase()] || ''}
                                                        onChange={(e) => setFormData({ ...formData, [field.label.toLowerCase()]: e.target.value })}
                                                        className="w-full p-3 pl-12 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 bg-white"
                                                        placeholder={`Enter your ${field.label.toLowerCase()}`}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="submit"
                                        className="w-full p-3 rounded-lg text-white transition-colors hover:opacity-90"
                                        style={{ backgroundColor: widgetTheme?.bot_button_color || "#2563eb" }}
                                        disabled={formSubmitting}
                                    >
                                        {formSubmitting ? (
                                            <div className="flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                                Connecting to AI Assistant
                                            </div>
                                        ) : 'Submit'}
                                    </button>
                                </form>
                            </div>
                        ) : (
                            <>
                                {/* Mic Button Section */}
                                <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto">

                                    <button
                                        onClick={handleMicClick}
                                        className="w-40 h-40 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg mb-6 overflow-hidden"
                                        style={{
                                            backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                                            boxShadow: isRecording ? `0 0 30px ${widgetTheme?.bot_animation_color || '#ef4444'}80` : '0 4px 20px rgba(37, 99, 235, 0.3)'
                                        }}
                                    >
                                        <div className="relative w-full h-full flex items-center justify-center">

                                            {isGlowing && (
                                                <div className="absolute inset-0 -m-5 bg-blue-400 opacity-50 rounded-full"></div>
                                            )}
                                            {renderIcon("w-16 h-16 text-white relative z-10")}
                                        </div>
                                    </button>

                                    {/* Status Bar - Like in the design */}
                                    <div
                                        className="px-6 py-3 rounded-full text-sm font-medium mb-4"
                                        style={{
                                            backgroundColor: widgetTheme?.bot_status_bar_color || "#f3f4f6",
                                            color: widgetTheme?.bot_status_bar_text_color || "#374151"
                                        }}
                                    >
                                        {speech}
                                    </div>

                                    {/* Live Indicator - Like in the design */}
                                    {isRecording && (
                                        <div className="flex items-center mb-6">
                                            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                                            <span className="text-red-600 font-medium text-sm">LIVE</span>
                                        </div>
                                    )}

                                    {/* Transcript Section - Always visible when expanded */}
                                    <div className="w-full px-4 mb-4">
                                        <div
                                            className="text-sm font-medium mb-2"
                                            style={{ color: widgetTheme?.bot_text_color || "#374151" }}
                                        >
                                            Conversation
                                        </div>
                                        <div
                                            ref={containerRef}
                                            className="transcript-box rounded-lg p-4 h-32 overflow-y-auto text-sm"
                                        >
                                            {latestEvent ? (
                                                <div className={`flex flex-col ${latestEvent.type === 'chat' && latestEvent.isLocal ? "items-end" : "items-start"}`}>
                                                    {latestEvent.type === 'chat' ? (
                                                        <div className={`px-2 py-1 rounded-lg text-[11px] max-w-[80%] ${latestEvent.isLocal ? "bg-blue-600/30 text-black" : "bg-yellow-600/30 text-black"}`}>
                                                            {latestEvent.text}
                                                        </div>
                                                    ) : (
                                                        <span className={`text-[11px] leading-tight text-black`}>
                                                            {latestEvent.text}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-gray-400 italic">Your conversation will appear here...</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Chat Input - Always visible when expanded */}
                                    <div className="w-full px-4">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={chatInput}
                                                onChange={(e) => setChatInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                                placeholder="Type your message..."
                                                disabled={status !== 'connected'}
                                                className="chat-input flex-1 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                                            />
                                            <button
                                                onClick={handleSendChat}
                                                disabled={status !== 'connected' || isSendingChat}
                                                className="w-12 h-12 rounded-lg flex items-center justify-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ backgroundColor: widgetTheme?.bot_button_color || "#2563eb" }}
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
                /* Collapsed State */
                <div className="flex flex-col items-center gap-2">
                    <button
                        onClick={toggleExpand}
                        className="rounded-full w-16 h-16 flex items-center justify-center shadow-lg border-2 transition-all hover:scale-105 hover:shadow-xl"
                        style={{
                            backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                            borderColor: widgetTheme?.bot_animation_color || "#2563eb",
                            boxShadow: widgetTheme?.is_glowing
                                ? `0 0 20px ${widgetTheme?.bot_animation_color || '#2563eb'}80`
                                : '0 4px 12px rgba(37, 99, 235, 0.3)',
                        }}
                    >
                        <div className="relative">
                            {widgetTheme?.is_glowing && (
                                <>
                                    <div
                                        className="absolute inset-0 -m-2 rounded-full"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color || '#2563eb'}40` }}
                                    ></div>
                                    <div
                                        className="absolute inset-0 -m-3 rounded-full"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color || '#2563eb'}20` }}
                                    ></div>
                                </>
                            )}
                            <div className="text-white relative z-10 w-8 h-8 flex items-center justify-center overflow-hidden">
                                {renderIcon("w-full h-full")}
                            </div>
                        </div>
                    </button>
                    <button
                        onClick={toggleExpand}
                        className="px-4 py-2 rounded-full font-semibold text-sm transition-all hover:scale-105 bg-white shadow-md border border-gray-200"
                        style={{
                            color: widgetTheme?.bot_button_color || "#2563eb",
                        }}
                    >
                        {`Talk to ${widgetTheme?.bot_name || "AI Assistant"}`}
                    </button>
                </div>
            )}

            <RoomAudioRenderer muted={muted} />
        </div>
    );
};

export default RetellaiAgent;