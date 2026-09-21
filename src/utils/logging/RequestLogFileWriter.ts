import fs from "fs";
import path from "path";

// Independent of PM2/stdout capture — qindom writes its own copy of every
// rendered request tree here, so log search works the same whether the app
// is run via `tsx watch` (dev) or PM2 (prod). Deliberately a distinct file
// from PM2's own out_file (qindom.out.log) to avoid double-logging the same
// content twice in prod.
const LOG_DIR = process.env.NODE_ENV === "prd" ? "/home/ubuntu/.pm2/logs" : path.join(process.cwd(), "logs");

export const REQUEST_LOG_DIR = LOG_DIR;
export const REQUEST_LOG_FILE_PREFIX = "qindom-request-tree";

const LOG_FILE = path.join(LOG_DIR, `${REQUEST_LOG_FILE_PREFIX}.log`);
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_SIZE_BYTES) return;
    const rotated = path.join(LOG_DIR, `${REQUEST_LOG_FILE_PREFIX}.${Date.now()}.log`);
    fs.renameSync(LOG_FILE, rotated);
  } catch {
    // File doesn't exist yet — nothing to rotate.
  }
}

export function appendRequestLog(text: string): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, text + "\n");
  } catch {
    // Best-effort only — never let a filesystem hiccup affect the request/response cycle.
  }
}
