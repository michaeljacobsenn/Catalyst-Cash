import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jacobsen.portfoliopro',
  appName: 'Catalyst Cash',
  webDir: 'dist',
  ios: {
    // Let the web view span full screen; CSS env() handles safe areas
    contentInset: 'never',
    preferredContentMode: 'mobile',
    // Allow direct Anthropic API calls from the native WebView
    allowsLinkPreview: false,
    // Enable native iOS swipe-to-go-back gesture (uses history API)
    allowsBackForwardNavigationGestures: true,
  } as CapacitorConfig['ios'] & { allowsBackForwardNavigationGestures?: boolean },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#060910',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      iosSpinnerStyle: 'small',
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#060910',
    },
    Preferences: {
      group: 'CatalystCashStorage',
    },
  },
};

export default config;
