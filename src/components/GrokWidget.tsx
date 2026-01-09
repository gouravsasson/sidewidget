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

    const transcriptionSegments = useTranscriptions();
    const { chatMessages, send, isSending: isSendingChat } = useChat();
    const [chatInput, setChatInput] = useState("");

    const [formData, setFormData] = useState<Record<string, string>>({});
    const [showform, setShowform] = useState(false);
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [currentTranscripts, setCurrentTranscripts] = useState<string[]>([]);

    const baseUrl = "https://test.snowie.ai/api/create-room/";
    const settingsBaseUrl = "https://test.snowie.ai";

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
                        // Add to current transcripts if not already there
                        if (Trans && !currentTranscripts.includes(Trans)) {
                            setCurrentTranscripts(prev => [...prev, Trans]);
                        }
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

    // Clear current transcripts when disconnected
    useEffect(() => {
        if (status === "disconnected") {
            setCurrentTranscripts([]);
            setTranscripts("");
        }
    }, [status]);

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

    // Auto-scroll transcript
    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [currentTranscripts, chatMessages]);

    const startRecording = async () => {
        try {
            if (status === "connected") {
                if (audioTrackRef.current) {
                    audioTrackRef.current.enabled = true;
                    setMuted(false);
                    setIsRecording(true);
                }
            } else {
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
        isRecording ? stopRecording() : startRecording();
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
            setMuted(false);
            setTranscripts("");
            setCurrentTranscripts([]);
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
            localStorage.setItem("formshow", "false");
            setTranscripts("");
            setCurrentTranscripts([]);
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
                @keyframes glowPulse {
                    0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
                    70% { box-shadow: 0 0 0 20px rgba(37, 99, 235, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
                }
                
                .widget-container {
                    max-height: 80vh;
                }
                
                .transcript-box {
                    background: #f9fafb !important;
                    color: #374151 !important;
                    border: 1px solid #e5e7eb !important;
                }
                
                .chat-input {
                    background: white !important;
                    color: #374151 !important;
                    border: 1px solid #e5e7eb !important;
                }
            `}</style>

            {expanded ? (
                <div 
                    className="w-[400px] rounded-2xl shadow-xl overflow-hidden border border-gray-200 bg-white widget-container"
                    style={{
                        maxHeight: '80vh',
                        height: 'auto',
                    }}
                >
                    {/* Header - Fixed height, won't get cut */}
                    <div 
                        className="px-4 py-3 flex justify-between items-center flex-shrink-0"
                        style={{ 
                            backgroundColor: widgetTheme?.bot_bubble_color || "#2563eb",
                            color: "#ffffff"
                        }}
                    >
                        <div className="flex items-center space-x-3 min-w-0">
                            <div 
                                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                                style={{ backgroundColor: "#ffffff" }}
                            >
                                {renderIcon("w-full h-full")}
                            </div>
                            <span className="font-semibold text-lg truncate">
                                {widgetTheme?.bot_name || 'AI Assistant'}
                            </span>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                            <button 
                                onClick={togglemute} 
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                                title={muted ? "Unmute" : "Mute"}
                            >
                                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <button 
                                onClick={() => setExpanded(false)} 
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                                title="Minimize"
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={handleClose} 
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Main Content - Flexible height */}
                    <div className="flex flex-col h-full bg-white" style={{ height: 'calc(100% - 52px)' }}>
                        {widgetTheme?.bot_show_form && showform ? (
                            <div className="flex-1 p-6 flex flex-col items-center justify-center bg-white overflow-y-auto">
                                <h3 className="text-lg font-semibold mb-6 text-gray-800">
                                    Enter Your Details
                                </h3>
                                <form onSubmit={startFromForm} className="w-full space-y-4">
                                    {widgetTheme.custom_form_fields.map((field) => (
                                        <div key={field.id} className="w-full">
                                            <label className="block text-sm font-medium mb-1 text-gray-700">
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
                            <div className="flex flex-col h-full overflow-hidden">
                                {/* Mic Button and Status Section - Fixed height */}
                                <div className="flex flex-col items-center justify-center p-4 bg-white flex-shrink-0">
                                    <button 
                                        onClick={handleMicClick}
                                        className={`w-32 h-32 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg mb-4 overflow-hidden ${
                                            isRecording ? 'ring-4 ring-red-500' : ''
                                        }`}
                                        style={{ 
                                            backgroundColor: widgetTheme?.bot_button_color || "#2563eb",
                                            boxShadow: isRecording ? `0 0 30px ${widgetTheme?.bot_animation_color || '#ef4444'}80` : '0 4px 20px rgba(37, 99, 235, 0.3)'
                                        }}
                                    >
                                        {renderIcon("w-12 h-12 text-white")}
                                    </button>
                                    
                                    <div className="flex items-center mb-3">
                                        <div 
                                            className="px-4 py-2 rounded-full text-sm font-medium mr-3"
                                            style={{ 
                                                backgroundColor: widgetTheme?.bot_status_bar_color || "#f3f4f6",
                                                color: widgetTheme?.bot_status_bar_text_color || "#374151"
                                            }}
                                        >
                                            {speech}
                                        </div>
                                        
                                        {isRecording && (
                                            <div className="flex items-center">
                                                <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                                                <span className="text-red-600 font-medium text-sm">LIVE</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Transcript Section - Flexible height, scrollable */}
                                <div className="flex-1 overflow-hidden border-t border-gray-200">
                                    <div className="h-full flex flex-col">
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                            <div className="text-sm font-medium text-gray-700">Conversation</div>
                                        </div>
                                        <div 
                                            ref={containerRef}
                                            className="flex-1 p-4 overflow-y-auto"
                                            style={{ maxHeight: '200px', minHeight: '150px' }}
                                        >
                                            {currentTranscripts.length > 0 ? (
                                                currentTranscripts.map((transcript, index) => (
                                                    <div key={index} className="text-sm mb-3">
                                                        <div className="font-medium text-blue-600 mb-1">AI:</div>
                                                        <div className="text-gray-700 pl-4">{transcript}</div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-gray-400 italic text-center py-8">
                                                    Your conversation will appear here...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Chat Input - Fixed height, won't get cut */}
                                <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                            placeholder="Type your message..."
                                            disabled={status !== 'connected'}
                                            className="chat-input flex-1 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-sm"
                                        />
                                        <button 
                                            onClick={handleSendChat} 
                                            disabled={status !== 'connected' || isSendingChat} 
                                            className="w-12 h-12 rounded-lg flex items-center justify-center transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
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
                                        className="absolute inset-0 -m-2 rounded-full animate-ping"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color || '#2563eb'}40` }}
                                    ></div>
                                    <div
                                        className="absolute inset-0 -m-3 rounded-full animate-pulse"
                                        style={{ backgroundColor: `${widgetTheme?.bot_animation_color || '#2563eb'}20` }}
                                    ></div>
                                </>
                            )}
                            <span className="text-white relative z-10">
                                <Mic className="w-6 h-6" />
                            </span>
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