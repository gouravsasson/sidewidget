import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WidgetProvider } from "./constexts/WidgetContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WidgetProvider
      agent_id="a0f11b70-a047-497d-b9f9-7d4b1a29230d"
      schema="6af30ad4-a50c-4acc-8996-d5f562b6987f"
      type="customwidget"
    >
      <App />
    </WidgetProvider>
  </StrictMode>
);
