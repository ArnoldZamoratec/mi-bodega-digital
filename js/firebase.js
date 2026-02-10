// js/firebase.js

// Importar funciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword, // <-- Herramienta para "Ingresar"
    createUserWithEmailAndPassword, // <-- NUEVO: Para crear cuentas
    signInWithPopup, // <-- Para login con Google
    GoogleAuthProvider, // <-- Proveedor de Google
    signOut, // <-- Herramienta para "Salir"
    setPersistence, // <-- HERRAMIENTA CORREGIDA
    browserLocalPersistence // <-- HERRAMIENTA CORREGIDA
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    collection,
    query,
    where,
    serverTimestamp,
    Timestamp,
    increment,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuración de Firebase ---
// Nueva configuración del proyecto "bodega-difital"
const firebaseConfig = {
    apiKey: "AIzaSyCelSZbt81Knw1sZLMZR9wNgi-7XWRwUpQ",
    authDomain: "bodega-difital.firebaseapp.com",
    projectId: "bodega-difital",
    storageBucket: "bodega-difital.firebasestorage.app",
    messagingSenderId: "319605782287",
    appId: "1:319605782287:web:084c12037b794d5226f07a",
    measurementId: "G-H40MNY2KR9"
};


// --- Constantes de la App ---
const appId = 'mi-bodega-app';
const initialAuthToken = null;

// --- Inicialización ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // <-- Forma estándar

// --- Exportar servicios ---
export { db, auth, appId, initialAuthToken };

// --- Re-exportar funciones para conveniencia ---
export {
    // Auth
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword, // <-- EXPORTAMOS PARA REGISTRO
    signInWithPopup, // <-- EXPORTAMOS PARA GOOGLE
    GoogleAuthProvider, // <-- EXPORTAMOS PROVEEDOR
    signOut,
    setPersistence, // <-- EXPORTAMOS LA HERRAMIENTA
    browserLocalPersistence, // <-- EXPORTAMOS LA HERRAMIENTA

    // Firestore
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    collection,
    query,
    where,
    serverTimestamp,
    Timestamp,
    increment,
    getDocs
};
