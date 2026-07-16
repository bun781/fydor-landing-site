import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabasePublicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server Components cannot mutate cookies. Proxy and Route Handlers own refresh writes.
      setAll: () => undefined
    }
  });
}
