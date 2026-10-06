/**
 * npm prebuild. Applies migrations only when VERCEL_ENV is production and
 * DATABASE_URL is set. Preview and local builds skip so a branch cannot
 * migrate the shared database. A failure exits non-zero and fails the build.
 */
import { migrate } from "../src/lib/pg/migrate";
import { runProductionMigrate } from "../src/lib/pg/prebuild";

const code = await runProductionMigrate({ env: process.env, migrate });
if (code !== 0) process.exit(code);
