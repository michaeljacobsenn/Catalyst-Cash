import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Strip 'crossorigin' from <script> and <link> tags — it causes issues in Capacitor's
// WKWebView which serves content from capacitor:// scheme.
function stripCrossorigin() {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      // Strip crossorigin from all tags (script and link modulepreload)
      return html.replace(/ crossorigin/g, "");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  // Capacitor requires assets served from root, not a sub-path
  base: "/",
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          // Capacitor plugins (many small packages)
          if (id.includes("node_modules/@capacitor") || id.includes("node_modules/@capacitor-community")) {
            return "vendor-capacitor";
          }
          // AI prompts — large text blob (~85 KB source)
          if (id.includes("/modules/prompts.js")) {
            return "prompts";
          }
          // Issuer card catalog — large static data
          if (id.includes("/modules/issuerCards.js")) {
            return "card-catalog";
          }
          // Market data worker + ticker universe
          if (id.includes("/modules/marketData.js")) {
            return "market-data";
          }
          // Export pipeline stays cold until a user actually exports
          if (id.includes("/modules/auditExports.js")) {
            return "audit-exports";
          }
          if (id.includes("/modules/nativeExport.js")) {
            return "native-export";
          }
          // Charting library (recharts + d3 deps)
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "vendor-charts";
          }
          // Animation library (framer-motion)
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Icon library (lucide-react)
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          // Negotiation scripts — large text blob, cold until user opens negotiation
          if (id.includes("/modules/negotiation.js")) {
            return "negotiation";
          }
          // Decision rules engine — only needed at audit time
          if (id.includes("/modules/decisionRules.js")) {
            return "decision-rules";
          }
          // Rewards catalog — large static data, cold until card wizard
          if (id.includes("/modules/rewardsCatalog.js")) {
            return "rewards-catalog";
          }
          // Merchant database — large static data
          if (id.includes("/modules/merchantDatabase.js")) {
            return "merchant-database";
          }
          // Ticker catalog — only needed in portfolio view
          if (id.includes("/modules/tickerCatalog.js")) {
            return "ticker-catalog";
          }
          // FIRE calculator — niche feature
          if (id.includes("/modules/fire.js")) {
            return "fire-calc";
          }
          // Bank catalog — static data, cold until settings
          if (id.includes("/modules/bankCatalog.js")) {
            return "bank-catalog";
          }
        },
      },
    },
  },
  server: {
    // Allow LAN access for testing on iPhone over WiFi before native build
    host: true,
    port: 5173,
  },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
