import React, { useState, useEffect } from "react";
import { Mic, X, Minimize2, Volume2, VolumeX } from "lucide-react";
import { LiveKitRoom } from "@livekit/components-react";
import { Room } from "livekit-client";
import RetellaiAgent from "./GrokWidget";

interface GrokWidgetProps {
    botName: string;
    icon: string | null;
    colors: {
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
    selectedPosition: string;
}

const GrokWidget: React.FC<GrokWidgetProps> = ({
    botName,
    icon,
    colors,
    selectedPosition,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [room] = useState(() => new Room());
    const [isMuted, setIsMuted] = useState(false);

    const getWidgetStyles = () => {
        const styles: React.CSSProperties = {
            position: "fixed",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
        };

        if (expanded) {
            styles.width = "400px";
            styles.height = "600px";
        } else {
            styles.width = "160px";
            styles.height = "80px";
        }

        switch (selectedPosition) {
            case "top-left":
                styles.top = "20px";
                styles.left = "20px";
                break;
            case "top-center":
                styles.top = "20px";
                styles.left = "50%";
                styles.transform = expanded ? "translateX(-50%)" : "none";
                break;
            case "top-right":
                styles.top = "20px";
                styles.right = "20px";
                break;
            case "bottom-left":
                styles.bottom = "44px";
                styles.left = "20px";
                break;
            case "bottom-center":
                styles.bottom = "44px";
                styles.left = "50%";
                styles.transform = expanded ? "translateX(-50%)" : "none";
                break;
            case "bottom-right":
                styles.bottom = "44px";
                styles.right = "24px";
                break;
            default:
                styles.bottom = "44px";
                styles.right = "24px";
        }

        return styles;
    };

    const renderIcon = (className: string) => {
        if (icon) {
            return (
                <img
                    src={icon}
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
        return <Mic className={className} style={{ color: colors.iconColor }} />;
    };

    return (
        <div style={getWidgetStyles()} className="flex flex-col items-end">
            {expanded ? (
                <div
                    className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                    style={{ width: "400px", height: "600px" }}
                >
                    {/* Header */}
                    <div
                        className="px-6 py-4 flex justify-between items-center"
                        style={{ backgroundColor: colors.headerBubbleColor }}
                    >
                        <div className="flex items-center space-x-3">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                                style={{ backgroundColor: colors.buttonColor }}
                            >
                                {renderIcon("w-full h-full")}
                            </div>
                            <span
                                className="font-semibold text-lg"
                                style={{ color: colors.textColor }}
                            >
                                {botName || "Thunder Emotion"}
                            </span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                            >
                                {isMuted ? (
                                    <VolumeX className="w-5 h-5" style={{ color: colors.textColor }} />
                                ) : (
                                    <Volume2 className="w-5 h-5" style={{ color: colors.textColor }} />
                                )}
                            </button>
                            <button
                                onClick={() => setExpanded(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                            >
                                <Minimize2 className="w-5 h-5" style={{ color: colors.textColor }} />
                            </button>
                            <button
                                onClick={() => setExpanded(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors"
                            >
                                <X className="w-5 h-5" style={{ color: colors.textColor }} />
                            </button>
                        </div>
                    </div>

                    {/* Grok Content */}
                    <div className="flex-1 flex flex-col">
                        <LiveKitRoom
                            token="" // Token handled inside RetellaiAgent
                            serverUrl="" // Server URL handled inside RetellaiAgent
                            room={room}
                            connect={false}
                        >
                            <RetellaiAgent isWidget={true} />
                        </LiveKitRoom>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={() => setExpanded(true)}
                        className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 overflow-hidden"
                        style={{ backgroundColor: colors.buttonColor }}
                    >
                        {renderIcon("w-full h-full")}
                    </button>
                    <div
                        className="px-4 py-2 rounded-full text-sm font-medium shadow-lg text-center"
                        style={{
                            backgroundColor: colors.buttonColor,
                            color: colors.buttonTextColor,
                        }}
                    >
                        Talk to {botName || "AI Assistant"}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrokWidget;
