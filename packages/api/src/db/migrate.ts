import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "../config.js";

/** Applies all pending migrations from ./drizzle then exits. */
async function main() {
  const migrationClient = postgres(config.db.url, { max: 1 });
  const db = drizzle(migrationClient);
  console.log("[migrate] applying migrations…");
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  console.log("[migrate] done.");
  await migrationClient.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
