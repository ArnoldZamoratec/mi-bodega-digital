// Firebase por npm (antes: SDK 11.6.1 desde el CDN de gstatic). Misma versión que la app móvil.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- Configuración de Firebase (proyecto "bodega-difital") ---
// Estos valores son públicos por diseño: la seguridad la dan las reglas de Firestore.
const firebaseConfig = {
  apiKey: 'AIzaSyCelSZbt81Knw1sZLMZR9wNgi-7XWRwUpQ',
  authDomain: 'bodega-difital.firebaseapp.com',
  projectId: 'bodega-difital',
  storageBucket: 'bodega-difital.firebasestorage.app',
  messagingSenderId: '319605782287',
  appId: '1:319605782287:web:084c12037b794d5226f07a',
  measurementId: 'G-H40MNY2KR9',
};

// --- Constantes de la App ---
export const appId = 'mi-bodega-app';

// --- Inicialización ---
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
