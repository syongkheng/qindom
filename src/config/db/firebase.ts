import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";

const serviceAccountPath = path.join(__dirname, "./serviceAccountKey.json");

const app = initializeApp({
  credential: cert(serviceAccountPath),
});

export const firestoreDB = getFirestore(app);