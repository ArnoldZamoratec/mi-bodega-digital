// Firebase por npm (antes: SDK 11.6.1 desde el CDN de gstatic). Misma versión que la app móvil.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- Configuración de Firebase por proyecto ---
// Estos valores son públicos por diseño: la seguridad la dan las reglas de Firestore.
// El proyecto se elige al compilar (vite.config.ts → __FIREBASE_PROJECT__): `firebase deploy
// --project dev` compila contra desarrollo y `--project prod` contra producción.
const CONFIGS = {
  "bodega-difital": {
    apiKey: "AIzaSyCelSZbt81Knw1sZLMZR9wNgi-7XWRwUpQ",
    authDomain: "bodega-difital.firebaseapp.com",
    projectId: "bodega-difital",
    storageBucket: "bodega-difital.firebasestorage.app",
    messagingSenderId: "319605782287",
    appId: "1:319605782287:web:084c12037b794d5226f07a",
    measurementId: "G-H40MNY2KR9",
  },
  "bodegon-digital-dev": {
    apiKey: "AIzaSyAb2O8E4bKWwKmmXRjtLbE-MVdQ8_vZZNI",
    authDomain: "bodegon-digital-dev.firebaseapp.com",
    projectId: "bodegon-digital-dev",
    storageBucket: "bodegon-digital-dev.firebasestorage.app",
    messagingSenderId: "168837503149",
    appId: "1:168837503149:web:7bc5bcd38b45261ea40e24",
  },
} as const;

type Proyecto = keyof typeof CONFIGS;
export const proyectoFirebase: Proyecto =
  __FIREBASE_PROJECT__ in CONFIGS
    ? (__FIREBASE_PROJECT__ as Proyecto)
    : "bodega-difital";
const firebaseConfig = CONFIGS[proyectoFirebase];

// --- Constantes de la App ---
export const appId = "mi-bodega-app";

// --- Inicialización ---
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
