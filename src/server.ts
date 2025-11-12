import 'dotenv/config'; // Loads variables from .env
import express from 'express';
import { startNexusListener } from '../integrations/nexus/listener';

// Initialize Express
const app = express();
const PORT = process.env.PORT || 10000; // Use 10000, as seen in your logs

async function main() {
  console.log("=================================");
  console.log("   GHOST FLEET CONTROLLER     ");
  console.log("=================================");

  // ---------------------------------------------------------
  // 1. Start Web Server
  // This is what Render is checking. 
  // The log [FleetController] live on port 10000 comes from here.
  // ---------------------------------------------------------
  app.get('/', (req, res) => {
    res.status(200).json({
      system: 'Ghost Fleet Controller',
      status: 'Online',
      timestamp: new Date().toISOString()
    });
  });

  app.listen(PORT, () => {
    // This is the log line you are seeing
    console.log(`[FleetController] live on port ${PORT}`); 
  });

  // ---------------------------------------------------------
  // 2. THIS IS THE MISSING PIECE: Initialize The "Ear" 
  // We are adding the Nexus Listener to THIS file.
  // ---------------------------------------------------------
  try {
    console.log("[INIT] 📡 connecting to Nexus Command...");
    startNexusListener(); // <--- THIS IS THE FIX
  } catch (error) {
    console.error("[ERROR] Failed to start Nexus listener:", error);
  }

  console.log("[SYSTEM] 👻 Ghost is fully operational and waiting for jobs.");
}

// Global Error Handling
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the Engine
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
