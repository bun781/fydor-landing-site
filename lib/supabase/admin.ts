import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseServiceRoleKey } from "./env";

/** Service role client: server-only and limited to controlled administration. */
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  return createSupabaseClient(url, supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}
