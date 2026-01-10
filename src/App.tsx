import { VoiceAssistant } from "./components/VoiceAssistant";
import { useState, useEffect, useRef } from "react";
import { useWidgetContext } from "./constexts/WidgetContext";
import { useUltravoxStore } from "./store/ultrasession";
import useSessionStore from "./store/session";
import axios from "axios";
import Forkartik from "./components/Forkartik";
import Autostart from "./components/Autostart";
import CustomWidget from "./components/CustomWidget";
import { WidgetTheme } from "./components/CustomWidget";
import { LiveKitRoom } from "@livekit/components-react";
import { Room } from "livekit-client";


import German from "./components/German";
import RetellaiAgent from "./components/GrokWidget";
import Whatsapp from "./components/Whatsapp";

function App() {
  const [showPopup, setShowPopup] = useState(false);
  const { agent_id, schema, type } = useWidgetContext();
  console.log("type", type);
  const [room] = useState(() => new Room({}))

  useEffect(() => {
    const localCountryCode = localStorage.getItem("countryCode");
    if (!localCountryCode) {
      const fetchIp = async () => {
        const res = await axios.get("https://ipapi.co/json/");
        localStorage.setItem("countryCode", res.data.country_calling_code);
        localStorage.setItem("countryName", res.data.country_name);
        localStorage.setItem("continentcode", res.data.country);
        localStorage.setItem("city", res.data.city);
      };
      fetchIp();
    }
  }, []);

  const widgetMap: Record<string, JSX.Element> = {
    autostart: <Autostart />,
    normal: <Forkartik />,
    customwidget: <CustomWidget />,
    // test: <Test />,
    german: <German />,
    thunderemotion: <LiveKitRoom token="" serverUrl="" room={room} connect={false}>
      <RetellaiAgent />
    </LiveKitRoom>,
    whatsapp:<Whatsapp/>
  };

  return (
    widgetMap[type] || null
  );
}

export default App;
