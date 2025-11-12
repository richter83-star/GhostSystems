import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, query, where, onSnapshot, updateDoc, doc 
} from "firebase/firestore";
import { spawn } from "child_process";
import path from "path";

// 1. Firebase Config (Loaded from Render Environment Variables)
// You MUST set these in your Render Dashboard under "Environment"
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// 2. Initialize Connection
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export function startNexusListener() {
  console.log("📡 Nexus Listener: Online & Watching for Commands...");

  // Listen for jobs where status is 'pending'
  const q = query(collection(db, "jobs"), where("status", "==", "pending"));

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const job = change.doc.data();
        const jobId = change.doc.id;

        console.log(`[COMMAND RECEIVED] Topic: ${job.topic} | Niche: ${job.niche}`);

        // Acknowledge receipt
        await updateDoc(doc(db, "jobs", jobId), { status: "processing" });

        try {
          // -------------------------------------------------------
          // TRIGGER YOUR PYTHON GENERATOR
          // -------------------------------------------------------
          console.log(`[GHOST] Spawning Python Generator for: ${job.topic}`);
          
          // This runs the equivalent of: python python/product_generator.py "topic" "niche"
          // Ensure your python script is set up to read sys.argv[1] and sys.argv[2]
          const scriptPath = path.join(process.cwd(), 'python', 'product_generator.py');
          
          const pythonProcess = spawn('python', [
             scriptPath, 
             job.topic, 
             job.niche || "general" 
          ]);

          // Capture Output from Python
          let scriptOutput = "";
          
          pythonProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log(`[PY]: ${msg}`);
            scriptOutput += msg;
          });

          pythonProcess.stderr.on('data', (data) => {
            console.error(`[PY ERR]: ${data}`);
          });

          // When Python finishes
          pythonProcess.on('close', async (code) => {
            if (code === 0) {
               // Success!
               // We assume your python script prints the final Image URL or Result 
               // as the last line, or we just mock it for now.
               
               await updateDoc(doc(db, "jobs", jobId), { 
                 status: "draft",
                 // If your python script outputs a URL, parse it here.
                 // For now, we generate a placeholder so the UI looks good.
                 imageUrl: "https://placehold.co/600x600/101010/FFF?text=" + job.topic.replace(/ /g, "+"),
                 logs: scriptOutput
               });
               console.log(`[JOB COMPLETE] Draft sent to Nexus.`);
            } else {
               throw new Error(`Python script exited with code ${code}`);
            }
          });

        } catch (error: any) {
          console.error("Nexus Job Failed:", error);
          await updateDoc(doc(db, "jobs", jobId), { 
            status: "failed",
            error: error.message 
          });
        }
      }
    });
  });
}



