import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo CLI carga `.env` en process.env antes de evaluar este archivo.
// Los valores se exponen a la app vía expo-constants (Constants.expoConfig.extra).
const env = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Bodegón Digital',
  slug: 'mi-bodega-digital',
  version: '1.0.0',
  // 'default': vertical en teléfonos y también horizontal en tablets (layout adaptable).
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FAF7F2',
  scheme: 'mibodega',
  ios: {
    supportsTablet: true,
    bundleIdentifier: env('APP_IOS_BUNDLE_ID', 'com.arnoldcode.mibodega'),
    infoPlist: {
      NSCameraUsageDescription:
        'Bodegón Digital usa la cámara para escanear códigos de barras de tus productos.',
    },
  },
  android: {
    package: env('APP_ANDROID_PACKAGE', 'com.arnoldcode.mibodega'),
    adaptiveIcon: {
      backgroundColor: '#08392B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.VIBRATE'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission:
          'Bodegón Digital usa la cámara para escanear códigos de barras de tus productos.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    ['expo-notifications', { color: '#0B6B4F' }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#FAF7F2',
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#0E1311' },
      },
    ],
    'expo-system-ui',
    '@react-native-community/datetimepicker',
    // Inicio de sesión con Google vía Credential Manager (Android). Se usa con un
    // `webClientId` explícito (GOOGLE_WEB_CLIENT_ID), sin google-services.json.
    // Android solo usa el webClientId (Credential Manager). iosUrlScheme (REVERSED_CLIENT_ID del
    // cliente iOS) solo toca Info.plist; el plugin lo exige aunque hoy no compilemos iOS.
    [
      'react-native-nitro-google-signin',
      { iosUrlScheme: env('GOOGLE_IOS_URL_SCHEME', 'com.googleusercontent.apps.pendiente') },
    ],
    './plugins/rutasCortasWindows',
  ],
  extra: {
    firebase: {
      apiKey: env('FIREBASE_API_KEY'),
      authDomain: env('FIREBASE_AUTH_DOMAIN'),
      projectId: env('FIREBASE_PROJECT_ID'),
      storageBucket: env('FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: env('FIREBASE_MESSAGING_SENDER_ID'),
      appId: env('FIREBASE_APP_ID'),
    },
    dataAppId: env('FIREBASE_DATA_APP_ID', 'mi-bodega-app'),
    /** "ID de cliente web" del proveedor Google en Firebase Auth. Vacío = botón oculto. */
    googleWebClientId: env('GOOGLE_WEB_CLIENT_ID'),
    ...(env('EAS_PROJECT_ID') ? { eas: { projectId: env('EAS_PROJECT_ID') } } : {}),
  },
});
