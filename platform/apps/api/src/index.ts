import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });
import { createApp } from "./app.js";
import { startBackupIntegrityWorker } from "./services/backup-integrity-worker.js";
import { startBackupWorker } from "./services/backup-worker.js";
import { startRunRecoveryWorker } from "./services/recovery-worker.js";
import { startSiteWatchWorker } from "./services/site-watch-worker.js";
import { store } from "./store.js";
const app = createApp();

const PORT = Number(process.env.PORT ?? 8787);

startRunRecoveryWorker();
startSiteWatchWorker();
startBackupWorker();
startBackupIntegrityWorker();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Umbrella API listening on http://localhost:${info.port}`);
  console.log(`Data file: ${store.path()}`);
});
