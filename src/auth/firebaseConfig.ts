// Public Firebase web-app identifiers for project chidush-builder. These are
// safe to commit: they identify the project, they do not grant access. The
// server verifies every token. VITE_FIREBASE_* env vars override them if set,
// which is only needed when pointing local dev at a different project.

export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    "AIzaSyCDX6PQ8VmrDMTYUeqMQbVONb01wkT0AdU",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    "chidush-builder.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "chidush-builder",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    "1:1085338993481:web:efb40f1a019d4d13e29098",
};
