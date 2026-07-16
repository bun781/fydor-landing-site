import "server-only";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function supabasePublicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    key: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  };
}

export function supabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}
