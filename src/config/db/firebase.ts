import admin from "firebase-admin";
import path from "path";

// Path to your service account key JSON
const serviceAccountPath = path.join(__dirname, "./serviceAccountKey.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

// Export Firestore instance
export const firestoreDB = admin.firestore();

// Example usage:
// firestoreDB.collection("users").doc("discordUserId").set({ governorId: 12345 });
