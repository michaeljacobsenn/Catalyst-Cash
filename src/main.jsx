import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { injectCachedOTA } from "./modules/ota.js";

// Call synchronously to overlay any cached Over-The-Air configurations
// onto the hardcoded defaults before the first React render.
injectCachedOTA();

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.

const root = createRoot(document.getElementById("root"));
root.render(<App />);

// Splash is now dismissed from App.jsx after React has painted the loading screen.
