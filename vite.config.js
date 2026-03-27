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
