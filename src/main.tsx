import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="ca0ec5f2-872a-4ed0-9e5c-f97b0b9d41aa"
      schema="abf30a87-7e52-4d37-a386-a0f0820fc2f5"
      type="thunderemotionlite"
      tool="whatsapp"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
