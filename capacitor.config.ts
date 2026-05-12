import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.whatsgoodhere.app',
  appName: "What's Good Here",
  webDir: 'dist',
  ios: {
    // 'never' so CSS env(safe-area-inset-*) is the single source of truth across
    // web/PWA and native. 'always' double-pads when CSS also applies env() insets.
    contentInset: 'never',
    scheme: 'WhatsGoodHere',
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
