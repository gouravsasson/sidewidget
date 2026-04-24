import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="019db4d9-c997-771a-8fc6-2d3d1dae2ff0"
      schema="abf30a87-7e52-4d37-a386-a0f0820fc2f5"
      type="thunderemotionlite"
      tool="whatsapp"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
