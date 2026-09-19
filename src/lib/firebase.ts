// Public Firebase browser configuration. These values identify the Firebase
// project to the client SDK; they are not secrets and are safe to ship in the
// bundle (Firebase security relies on server-side token verification and
// project rules, not on hiding this config).
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyDo__uJVdaE_0uptk1aNeAIF_QLAbeIG6o",
  authDomain: "device-streaming-acd6bfae.firebaseapp.com",
  projectId: "device-streaming-acd6bfae",
  storageBucket: "device-streaming-acd6bfae.firebasestorage.app",
  messagingSenderId: "428103238201",
  appId: "1:428103238201:web:ab8d7d31dd292eee7dc3e8",
};

function firebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
  return result.user.getIdToken();
}

/** End a Google session when one was used, without initializing Firebase for password users. */
export async function signOutDashboard() {
  if (!getApps().length) return;
  await signOut(getAuth(getApp()));
}
