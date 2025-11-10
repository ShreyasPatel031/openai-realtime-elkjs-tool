import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const shouldMockFirebase =
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey === "test-firebase-api-key";

let app: FirebaseApp | null = null;
let auth: Auth;
let googleProvider: GoogleAuthProvider;
let db: Firestore | null = null;

if (!shouldMockFirebase) {
  const existingApps = getApps();
  app = existingApps.length ? existingApps[0] : initializeApp(firebaseConfig);

  try {
    initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch (error) {
    console.log("Firestore already initialized or initialization failed:", error);
  }

  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  db = getFirestore(app);
} else {
  console.warn("⚠️ Firebase configuration missing or mocked; using in-memory implementations.");

  app = null;

  auth = {
    currentUser: null,
    onAuthStateChanged: () => () => {},
    signInWithPopup: async () => ({ user: null }),
    signInWithRedirect: async () => {},
    signOut: async () => {},
  } as unknown as Auth;

  googleProvider = {
    providerId: "mock",
  } as GoogleAuthProvider;

  db = null;
}

export { app };
export { auth, googleProvider, db };
