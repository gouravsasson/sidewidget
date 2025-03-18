import { VoiceAssistant } from "./components/VoiceAssistant";
import { useState, useEffect } from "react";
import { useWidgetContext } from "./constexts/WidgetContext";
import { useUltravoxStore } from "./store/ultrasession";
import useSessionStore from "./store/session";
import axios from "axios";
import Forkartik from "./components/Forkartik";
function App() {
  const [showPopup, setShowPopup] = useState(false);
  const { schema } = useWidgetContext();
  const [exitConfirmed, setExitConfirmed] = useState(false);
  const { session, setTranscripts, setIsListening, status } =
    useUltravoxStore();
  const { callId, callSessionId } = useSessionStore();
  const baseurl = "https://app.snowie.ai";
  // const schema = "6af30ad4-a50c-4acc-8996-d5f562b6987f";

  useEffect(() => {
    if (status === "disconnected" || status === "connecting") {
      return;
    }

    const handleMouseLeave = (event: MouseEvent) => {
      if (event.clientY <= 10 && !exitConfirmed) {
        setShowPopup(true);
      }
    };

    const handleBlur = () => {
      if (!exitConfirmed) {
        setShowPopup(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !exitConfirmed) {
        setShowPopup(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!exitConfirmed) {
        e.preventDefault();
        // e.returnValue = "";
        setShowPopup(true);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [exitConfirmed, status]);

  const handleConfirmExit = async () => {
    console.log(session);
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
    setIsListening(false);
    setShowPopup(false);
  };

  const handleCancelExit = () => setShowPopup(false);

  return (
    <>
      {/* <div className=" flex items-center justify-center p-4 overflow-hidden">
        <VoiceAssistant
          onMessageSend={(message) => console.log("Message:", message)}
          onVoiceStart={() => console.log("Voice started")}
          onVoiceStop={() => console.log("Voice stopped")}
        />
      </div> */}
      <Forkartik />
      {showPopup && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50">
          <div className="max-w-md w-full bg-white/30 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-lg text-center">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Active Call Detected
            </h2>
            <p className="text-white/90 mb-8">
              You're switching away from the call. What would you like to do?
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleCancelExit}
                className="flex-1 py-3 px-4 rounded-lg bg-white/30 text-white font-bold hover:bg-white/40 transition"
              >
                Keep Talking
              </button>
              <button
                onClick={handleConfirmExit}
                className="flex-1 py-3 px-4 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 transition"
              >
                End Call
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
