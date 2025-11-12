import 'dotenv/config'; // Loads variables from .env
import express from 'express';
import { startNexusListener } from '../integrations/nexus/listener';

// Initialize Express to keep Render happy (Health Checks)
const app = express();
const PORT = process.env.PORT || 3000;

async function main() {
  console.log("=================================");
  console.log("   GHOST SYSTEM CLOUD RUNNER     ");
  console.log("=================================");

  // ---------------------------------------------------------
  // 1. Start Web Server
  // Render requires a web service to listen on a port.
  // This also gives you a URL to ping to check if it's alive.
  // ---------------------------------------------------------
  app.get('/', (req, res) => {
    res.status(200).json({
      system: 'Ghost System',
      status: 'Online',
      timestamp: new Date().toISOString()
    });
  });

  app.listen(PORT, () => {
    console.log(`[SERVER] 🟢 Health check server listening on port ${PORT}`);
  });

  // ---------------------------------------------------------
  // 2. Initialize The "Ear" (Nexus Listener)
  // This connects to Firestore and waits for your React App commands.
  // ---------------------------------------------------------
  try {
    console.log("[INIT] 📡 connecting to Nexus Command...");
    startNexusListener();
  } catch (error) {
    console.error("[ERROR] Failed to start Nexus listener:", error);
  }

  // ---------------------------------------------------------
  // 3. (Optional) Standard Cron Jobs
  // If you have recurring tasks (like 'Weekly Analytics'), 
  // you can initialize them here alongside the listener.
  // ---------------------------------------------------------
  // Example:
  // import { CronJob } from 'cron';
  // new CronJob('0 0 * * 0', () => { console.log("Running weekly task..."); }).start();

  console.log("[SYSTEM] 👻 Ghost is fully operational and waiting for jobs.");
}

// Global Error Handling to prevent crash loops
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  // On Render, it's often better to log and keep running if possible, 
  // or exit 1 to restart.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the Engine
main().catch((error) => {
  console.error("Failed to start runner:", error);
  process.exit(1);
});

