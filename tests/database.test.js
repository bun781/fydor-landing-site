"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { validateDatabaseUrl } = require("../lib/database");

test("accepts a complete Supabase transaction-pooler URL without logging it", () => {
  const value = "postgresql://postgres.project:local-test-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
  assert.equal(validateDatabaseUrl(value), value);
});

test("rejects missing, placeholder, and non-Postgres database URLs", () => {
  assert.throws(() => validateDatabaseUrl(""), /required/);
  assert.throws(() => validateDatabaseUrl("https://example.com/database"), /PostgreSQL/);
  assert.throws(
    () => validateDatabaseUrl("postgresql://postgres.project:YOUR_PASSWORD@pooler.supabase.com:6543/postgres"),
    /placeholder/
  );
});

test("transaction-pool mode disables prepared statements", () => {
  const source = readFileSync(join(__dirname, "..", "lib", "database.js"), "utf8");
  assert.match(source, /prepare:\s*false/);
});
