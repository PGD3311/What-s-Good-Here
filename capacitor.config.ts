import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.whatsgoodhere.app',
  appName: "What's Good Here",
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    scheme: 'WhatsGoodHere',
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
