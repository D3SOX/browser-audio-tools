import React from "react";
import ReactDOM from "react-dom/client";
import { injectSpeedInsights } from "@vercel/speed-insights";
import App from "./App";

// Initialize Vercel Speed Insights
injectSpeedInsights();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

