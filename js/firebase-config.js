// =============================================
// Firebase Configuration — AI Clinic Management
// =============================================
// Using Firebase Compat SDK (loaded via CDN in HTML files)

const firebaseConfig = {
  apiKey: "AIzaSyDT_W8BlYBkgy0JZ0kAU07N2imN7hnA24Q",
  authDomain: "atta-clinic.firebaseapp.com",
  projectId: "atta-clinic",
  storageBucket: "atta-clinic.firebasestorage.app",
  messagingSenderId: "465279040741",
  appId: "1:465279040741:web:6f9f9348a6bfc1d80aa80c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export references
const auth = firebase.auth();
const db = firebase.firestore();
