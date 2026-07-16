#!/usr/bin/env node

const INITIAL_ADMIN_EMAIL = "minhnhannguyen28@gmail.com";
const args = parseArgs(process.argv.slice(2));
args.email ||= INITIAL_ADMIN_EMAIL;
if (!/^\S+@\S+\.\S+$/.test(args.email) || args.email.toLowerCase() !== INITIAL_ADMIN_EMAIL) fail(`The protected bootstrap account must be ${INITIAL_ADMIN_EMAIL}.`);
const supabaseUrl = (process.env.SUPABASE_URL || requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
if (args.create) await createVerifiedUser(supabaseUrl, serviceKey, args.email, requiredEnv("ADMIN_BOOTSTRAP_PASSWORD"), args.username);
const action = args.verify ? "super_admin_status" : args.revoke ? "revoke_super_admin" : "bootstrap_super_admin";
const body = args.revoke ? { p_email: args.email, p_reason: args.reason || "controlled operator revocation" } : { p_email: args.email };

const data = process.env.DATABASE_URL
  ? await callBootstrapThroughDatabase(action, body)
  : await callBootstrapThroughRest(supabaseUrl, serviceKey, action, body);
if (args.verify) console.log(`Super-admin status: found=${Boolean(data.found)} verified=${Boolean(data.verified)} assigned=${Boolean(data.assigned)}`);
else if (args.revoke) console.log("Super-admin role revoked. Audit event created.");
else console.log(data.assigned ? "Super-admin role assigned. Audit event created." : "Super-admin role already present. Audit event created.");

async function createVerifiedUser(url, key, email, password, username) {
  if (args.verify || args.revoke) fail("--create cannot be used with --verify or --revoke.");
  if (password.length < 12) fail("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.");
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceAuthHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: username ? { username } : {} })
  });
  if (response.ok) return;
  const data = await response.json().catch(() => ({}));
  const message = String(data.message || data.msg || `Account creation failed (${response.status}).`);
  if (response.status === 422 && /already|exists|registered/i.test(message)) return;
  fail(message.replace(/token|key|jwt|password/gi, "credential"));
}

async function callBootstrapThroughRest(url, key, action, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${action}`, {
    method: "POST",
    headers: { ...serviceAuthHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(String(data.message || `Bootstrap operation failed (${response.status}).`).replace(/token|key|jwt/gi, "credential"));
  return data;
}

async function callBootstrapThroughDatabase(action, body) {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: "require" });
  try {
    await sql`select set_config('request.jwt.claim.role', 'service_role', false)`;
    const rows = action === "bootstrap_super_admin"
      ? await sql`select public.bootstrap_super_admin(${body.p_email}) as result`
      : action === "super_admin_status"
        ? await sql`select public.super_admin_status(${body.p_email}) as result`
        : await sql`select public.revoke_super_admin(${body.p_email}, ${body.p_reason}) as result`;
    return rows[0]?.result || {};
  } finally { await sql.end({ timeout: 5 }); }
}

function parseArgs(values){const result={};for(let i=0;i<values.length;i+=1){const value=values[i];if(value==="--email")result.email=values[++i];else if(value==="--username")result.username=values[++i];else if(value==="--create")result.create=true;else if(value==="--verify")result.verify=true;else if(value==="--revoke")result.revoke=true;else if(value==="--reason")result.reason=values[++i];else fail(`Unknown argument: ${value}`);}return result;}
function serviceAuthHeaders(key){return key.startsWith("sb_secret_")?{apikey:key}:{apikey:key,Authorization:`Bearer ${key}`};}
function requiredEnv(name){const value=process.env[name];if(!value)fail(`${name} is required.`);return value;}
function fail(message){console.error(message);process.exit(1);}
