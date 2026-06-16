import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, "./serviceAccountKey.json");

const app = initializeApp({
  credential: cert(serviceAccountPath),
});

export const firestoreDB = getFirestore(app);