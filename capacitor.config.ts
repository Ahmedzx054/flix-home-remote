import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.flix.homeremote', appName: 'ريموت البيت', webDir: 'dist',
  plugins: { CapacitorHttp: { enabled: true } },
  android: { allowMixedContent: true },
};
export default config;
