import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="514e1c5a-72c8-4670-a2f7-3851f7b49bae"
      schema="09483b13-47ac-47b2-95cf-4ca89b3debfa"
      type="thunderemotionlite"
      tool="whatsapp"
      agni_agent_id="019e9315-e11e-7580-a785-5dc14877d996"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);