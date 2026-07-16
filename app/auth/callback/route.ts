import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirect } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = safeRedirect(url.searchParams.get("next"), "/contribute");
  const response = NextResponse.redirect(new URL(destination, url.origin));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  console.info("[AUTH-ROUTE] callback handler reached", {
    codeExists: Boolean(code),
    destination
  });
  if (!code || !supabaseUrl || !key) {
    console.warn("[AUTH-ROUTE] callback configuration or code missing", {
      codeExists: Boolean(code),
      supabaseUrlExists: Boolean(supabaseUrl),
      publishableKeyExists: Boolean(key)
    });
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  const supabase = createServerClient(supabaseUrl, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    }
  });
  console.info("[AUTH-SUPABASE] call starting", { operation: "exchangeCodeForSession" });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  console.info("[AUTH-SUPABASE] call completed", {
    operation: "exchangeCodeForSession",
    errorCode: error?.code,
    errorMessage: error?.message,
    sessionExists: Boolean(data.session),
    userIdExists: Boolean(data.user?.id)
  });
  if (error || !data.session) {
    console.warn("[AUTH-SESSION] callback session not established", { errorCode: error?.code });
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }
  console.info("[AUTH-SESSION] session established", { userIdExists: Boolean(data.user?.id) });
  return response;
}
