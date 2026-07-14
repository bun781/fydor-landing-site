"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rateLimit } = require("../lib/rate-limit");

test("uses the Supabase enforce_rate_limit RPC", async () => {
  let call;
  await rateLimit("actor:admin", 60, 30, {
    rpc: async (name, payload) => { call = { name, payload }; return { allowed: true, count: 1 }; }
  });
  assert.deepEqual(call, {
    name: "enforce_rate_limit",
    payload: { p_key: "actor:admin", p_limit: 60, p_window_seconds: 30 }
  });
});

test("rejects a limit exceeded by Supabase", async () => {
  await assert.rejects(
    rateLimit("actor:admin", 1, 60, { rpc: async () => ({ allowed: false, count: 2 }) }),
    (error) => error.status === 429 && error.code === "rate_limited"
  );
});

test("fails closed when the required Supabase limiter is unavailable", async () => {
  await assert.rejects(
    rateLimit("actor:admin", 1, 60, { rpc: async () => { throw new Error("offline"); } }),
    (error) => error.status === 503 && error.code === "rate_limit_unavailable"
  );
});
