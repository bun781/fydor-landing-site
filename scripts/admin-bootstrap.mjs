#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));
if (!args.email || !/^\S+@\S+\.\S+$/.test(args.email)) fail("Pass a valid email with --email.");
const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const action = args.verify ? "super_admin_status" : args.revoke ? "revoke_super_admin" : "bootstrap_super_admin";
const body = args.revoke ? { p_email: args.email, p_reason: args.reason || "controlled operator revocation" } : { p_email: args.email };

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${action}`, {
  method: "POST",
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
const data = await response.json().catch(() => ({}));
if (!response.ok) fail(String(data.message || `Bootstrap operation failed (${response.status}).`).replace(/token|key|jwt/gi, "credential"));
if (args.verify) console.log(`Super-admin status: found=${Boolean(data.found)} verified=${Boolean(data.verified)} assigned=${Boolean(data.assigned)}`);
else if (args.revoke) console.log("Super-admin role revoked. Audit event created.");
else console.log(data.assigned ? "Super-admin role assigned. Audit event created." : "Super-admin role already present. Audit event created.");

function parseArgs(values){const result={};for(let i=0;i<values.length;i+=1){const value=values[i];if(value==="--email")result.email=values[++i];else if(value==="--verify")result.verify=true;else if(value==="--revoke")result.revoke=true;else if(value==="--reason")result.reason=values[++i];else fail(`Unknown argument: ${value}`);}return result;}
function requiredEnv(name){const value=process.env[name];if(!value)fail(`${name} is required.`);return value;}
function fail(message){console.error(message);process.exit(1);}
