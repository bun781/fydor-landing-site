"use strict";

const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");

let client;
let database;

function getDatabase(env = process.env) {
  if (database) return database;
  const connectionString = validateDatabaseUrl(env.DATABASE_URL);
  client = postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require"
  });
  database = drizzle(client);
  return database;
}

function validateDatabaseUrl(value) {
  if (!value) throw new Error("DATABASE_URL is required.");
  let url;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
  if (!url.username || !url.password || !url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL is missing required connection fields.");
  }
  if (url.password === "YOUR_PASSWORD" || url.password.includes("[YOUR-PASSWORD]")) {
    throw new Error("Replace the DATABASE_URL password placeholder locally.");
  }
  return url.toString();
}

async function closeDatabase() {
  if (client) await client.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}

module.exports = { closeDatabase, getDatabase, validateDatabaseUrl };
