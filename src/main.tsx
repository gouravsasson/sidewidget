import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="e23ffe2b-3fe3-4fb2-b34f-83b66918151a"
      schema="9cd3db15-5dbe-4199-aa8c-80c5701857f7"
      type="thunderemotionlite"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
