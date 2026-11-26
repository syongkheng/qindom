/**
 * Loads the server's env file. Must be the FIRST import of `src/index.ts`: ESM evaluates imports in order,
 * so everything imported after it sees the loaded values. Nothing else imports this module (tests load no
 * env file at all). `npm run migrate` / `src/migrate.ts` load `.env` themselves (see config/README.md).
 */
import dotenv from "dotenv";
import { IS_PRD } from "./env.js";

/** prd (PM2 `--env prd`) → `.env`; anything else (`npm run dev`, `dev:log`) → `.env.dev`. Relative to the working directory. */
export const ENV_FILE = IS_PRD ? ".env" : ".env.dev";

// override: the env file wins over variables already set in the shell (an exported prod DB_URL can't leak into dev).
dotenv.config({ path: ENV_FILE, override: true, quiet: true });
