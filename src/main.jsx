import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.
import { SplashScreen } from '@capacitor/splash-screen';

const root = createRoot(document.getElementById('root'));
root.render(<App />);

// Hide splash AFTER React has had time to mount and paint.
// Without this delay, iOS 18 WKWebView shows a white flash or crashes
// because the DOM isn't ready when the splash is dismissed.
setTimeout(() => {
  SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
}, 600);

