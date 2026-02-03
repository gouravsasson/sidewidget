import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="35a9b70d-a3c0-4231-a595-24aafe55db32"
      schema="6af30ad4-a50c-4acc-8996-d5f562b6987f"
      type="thunderemotionlite"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
