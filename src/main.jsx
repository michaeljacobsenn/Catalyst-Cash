import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Capacitor core — boots native plugins when running on iOS.
// On web (vite dev server) this is a no-op.

const root = createRoot(document.getElementById('root'));
root.render(<App />);

// Splash is now dismissed from App.jsx after React has painted the loading screen.

