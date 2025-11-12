import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, query, where, onSnapshot, updateDoc, doc 
} from "firebase/firestore";
import { spawn } from "child_process"; 

// 1. Config (Set these in Render Environment Variables)
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
          // EXECUTION LOGIC
          // This is where we trigger your existing Python or TS logic
          // -------------------------------------------------------
          
          // OPTION A: Trigger your Python Generator
          // This runs: python python/product_generator.py --topic "..."
          console.log("...Spawning Python Generator...");
          
          /* Uncomment this block to actually run your python script
             Ensure your python script accepts command line args!
          */
          // await runPythonScript(job.topic, job.niche);

          // -------------------------------------------------------
          
          // Simulate success for now so you see it in the Dashboard
          await new Promise(r => setTimeout(r, 2000)); 

          // Report success back to Dashboard
          await updateDoc(doc(db, "jobs", jobId), { 
            status: "draft",
            imageUrl: "https://placehold.co/600x600/101010/FFF?text=" + job.topic.replace(/ /g, "+")
          });
          
          console.log(`[JOB COMPLETE] Draft sent to Nexus.`);

        } catch (error) {
          console.error("Nexus Job Failed:", error);
          await updateDoc(doc(db, "jobs", jobId), { status: "failed" });
        }
      }
    });
  });
}

// Helper to run your Python scripts if needed
function runPythonScript(topic: string, niche: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Adjust arguments to match what your python script expects
    const pythonProcess = spawn('python', ['python/product_generator.py', topic, niche]);

    pythonProcess.stdout.on('data', (data) => console.log(`[PYTHON]: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`[PYTHON ERR]: ${data}`));
    
    pythonProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python script exited with code ${code}`));
    });
  });
}

