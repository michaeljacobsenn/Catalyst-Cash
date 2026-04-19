  import { Suspense,lazy } from "react";
  import { createRoot } from "react-dom/client";
  import ErrorBoundary from "./modules/ErrorBoundary.js";
  import { AuditProvider } from "./modules/contexts/AuditContext.js";
  import { BudgetProvider } from "./modules/contexts/BudgetContext.js";
  import { NavigationProvider } from "./modules/contexts/NavigationContext.js";
  import { PortfolioProvider } from "./modules/contexts/PortfolioContext.js";
  import { SecurityProvider } from "./modules/contexts/SecurityContext.js";
  import { SettingsProvider } from "./modules/contexts/SettingsContext.js";
  import { injectCachedOTA } from "./modules/ota.js";
  import { ToastProvider } from "./modules/Toast.js";

// Call synchronously to overlay any cached Over-The-Air configurations
// onto the hardcoded defaults before the first React render.
injectCachedOTA();

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.

const App = lazy(() => import("./App.js"));
const BOOT_BG = "#0C121B";

const BootFallback = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: BOOT_BG,
      color: "#f8fafc",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}
  >
    Loading Catalyst Cash…
  </div>
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found");
}

document.documentElement.style.background = BOOT_BG;
document.documentElement.style.colorScheme = "dark";
document.documentElement.style.setProperty("--cc-bg-base", BOOT_BG);
if (document.body) {
  document.body.style.background = BOOT_BG;
  document.body.style.margin = "0";
}
rootElement.style.background = BOOT_BG;

const root = createRoot(rootElement);
root.render(
  <ErrorBoundary name="App">
    <ToastProvider>
      <SettingsProvider>
        <SecurityProvider>
          <PortfolioProvider>
            <BudgetProvider>
              <NavigationProvider>
                <AuditProvider>
                  <Suspense fallback={<BootFallback />}>
                    <App />
                  </Suspense>
                </AuditProvider>
              </NavigationProvider>
            </BudgetProvider>
          </PortfolioProvider>
        </SecurityProvider>
      </SettingsProvider>
    </ToastProvider>
  </ErrorBoundary>
);

// Splash is now dismissed from App.jsx after React has painted the loading screen.
