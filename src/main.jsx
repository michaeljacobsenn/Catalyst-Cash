import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.
import { SplashScreen } from '@capacitor/splash-screen';

const root = createRoot(document.getElementById('root'));
root.render(<App />);

// Hide splash after React renders
SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
