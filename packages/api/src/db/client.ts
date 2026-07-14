import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

// Single shared connection pool for the api process.
export const sql = postgres(config.db.url, { max: 10 });
export const db = drizzle(sql, { schema });

export type DB = typeof db;
