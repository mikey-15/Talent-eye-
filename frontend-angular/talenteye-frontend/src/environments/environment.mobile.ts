/**
 * Used by `ng build --configuration=mobile` for Capacitor Android builds.
 *
 * Android emulator: `10.0.2.2` reaches the host machine’s localhost (your Django API).
 * Physical device on same Wi‑Fi: replace with your PC’s LAN IP (e.g. http://192.168.1.x:8000).
 */
export const environment = {
  production: true,
  apiUrl: 'http://10.0.2.2:8000/api',
  mediaOrigin: 'http://10.0.2.2:8000',
  appName: 'TalentEye Football',
  version: '1.0.0'
};

export const environmentprod = environment;
