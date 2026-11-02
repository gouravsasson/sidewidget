import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="6e677cf7-c9b1-4e84-bebe-210073912fe6"
      schema="6af30ad4-a50c-4acc-8996-d5f562b6987f"
      type="thunderemotionlite"
      tool=""
      agni_agent_id=""
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);