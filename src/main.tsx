import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="c95a3759-bb70-4463-a3b1-390910ed46e8"
      schema="7a5a46c6-a08e-477c-93c8-5afd7565069c"
      type="whatsapp"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
