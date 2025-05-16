import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="6fea6bfb-ebc8-48e0-b51c-506e46ac9d6c"
      schema="6af30ad4-a50c-4acc-8996-d5f562b6987f"
      type="customwidget"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
