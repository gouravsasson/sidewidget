import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

const params = new URLSearchParams(window.location.search);
const widgetConfig = {
  agent_id: params.get("agent_id") || params.get("widget_id") || "",
  schema: params.get("schema") || "",
  type: params.get("type") || "thunderemotionlite",
  tool: params.get("tool") || "",
  agni_agent_id: params.get("agni_agent_id") || "",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider {...widgetConfig}>
      <App />
    </WidgetProvider>
  </StrictMode>
);
