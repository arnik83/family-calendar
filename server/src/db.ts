import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
// In dev (bun ./server/src/index.ts) this is <repo>/data;
// the folder is gitignored — each install gets its own database.
const dataDir = join(here, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(join(dataDir, "family-calendar.db"));
sqlite.exec("PRAGMA journal_mode = WAL;");

export const db = drizzle(sqlite, { schema });

// Apply any pending migrations on startup.
migrate(db, { migrationsFolder: join(here, "..", "..", "drizzle") });
