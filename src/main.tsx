import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="365cb0f5-790b-4ef5-b0b9-4a804721b52b"
      schema="fd2bd1e7-0ecd-4434-9df7-06eefb51b44a"
      type="thunderemotionlite"
      tool=""
      agni_agent_id=""
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
