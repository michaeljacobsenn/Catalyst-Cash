import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strip 'crossorigin' from <script> tags — it causes issues in Capacitor's
// WKWebView which serves content from capacitor:// scheme.
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      // Only strip crossorigin from <script> tags, not <link> tags
      return html.replace(/<script([^>]*) crossorigin([^>]*)>/g, '<script$1$2>');
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  // Capacitor requires assets served from root, not a sub-path
  base: '/',
  build: {
    outDir: 'dist',
    // Increase chunk warning limit for the large system prompt
    chunkSizeWarningLimit: 2000,
    // Disable module preload polyfill — not needed in Capacitor WebView
    modulePreload: { polyfill: false },
  },
  server: {
    // Allow LAN access for testing on iPhone over WiFi before native build
    host: true,
    port: 5173,
  },
});
