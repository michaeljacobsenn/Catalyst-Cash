import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { injectCachedOTA } from "./modules/ota.js";
import { ToastProvider } from "./modules/Toast.js";
import { SettingsProvider } from "./modules/contexts/SettingsContext.js";
import { SecurityProvider } from "./modules/contexts/SecurityContext.js";
import { PortfolioProvider } from "./modules/contexts/PortfolioContext.js";
import { BudgetProvider } from "./modules/contexts/BudgetContext.js";
import { NavigationProvider } from "./modules/contexts/NavigationContext.js";
import { AuditProvider } from "./modules/contexts/AuditContext.js";

// Call synchronously to overlay any cached Over-The-Air configurations
// onto the hardcoded defaults before the first React render.
injectCachedOTA();

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found");
}

const root = createRoot(rootElement);
root.render(
  <ToastProvider>
    <SettingsProvider>
      <SecurityProvider>
        <PortfolioProvider>
          <BudgetProvider>
            <NavigationProvider>
              <AuditProvider>
                <App />
              </AuditProvider>
            </NavigationProvider>
          </BudgetProvider>
        </PortfolioProvider>
      </SecurityProvider>
    </SettingsProvider>
  </ToastProvider>
);

// Splash is now dismissed from App.jsx after React has painted the loading screen.
