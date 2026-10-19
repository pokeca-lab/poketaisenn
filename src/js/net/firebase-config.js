/**
 * Firebase Configuration & Realtime Database Initialization
 * pokelaboareana - Asia Southeast 1 (Singapore)
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBvwDsdtaemhX6puM2DI5Ls0B_19EWp7fA",
  authDomain: "pokelaboareana.firebaseapp.com",
  databaseURL: "https://pokelaboareana-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pokelaboareana",
  storageBucket: "pokelaboareana.firebasestorage.app",
  messagingSenderId: "350656097703",
  appId: "1:350656097703:web:39480de285b8303073da82"
};

(function () {
  if (typeof firebase === "undefined") {
    console.error("[Firebase] Firebase SDK is not loaded.");
    return;
  }
  if (!firebase.apps || !firebase.apps.length) {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      console.log("[Firebase] Successfully initialized Firebase Realtime Database.");
    } catch (e) {
      console.error("[Firebase] Initialization error:", e);
    }
  }
})();
