import type { CapacitorConfig } from '@capacitor/cli'

// The Android app wraps the phone build (npm run mobile:build → out/mobile).
const config: CapacitorConfig = {
  appId: 'com.studywise.courses',
  appName: 'Studywise',
  webDir: 'out/mobile',
  android: {
    // The page talks to the computer on the local network over plain HTTP, through native HTTP.
    allowMixedContent: false
  },
  plugins: {
    // window.fetch stays the WebView's own; sync calls CapacitorHttp directly.
    CapacitorHttp: { enabled: false },
    StatusBar: { overlaysWebView: false }
  }
}

export default config
