import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="c82c91c5-b8a2-4a80-b43b-5e4908981b27"
      schema="6af30ad4-a50c-4acc-8996-d5f562b6987f"
      type="thunderemotionlite"
      tool="whatsapp"
      agni_agent_id="019da353-fed1-73ae-bb3b-d2276836adc6"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
