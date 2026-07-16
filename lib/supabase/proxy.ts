import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest, requestHeaders = new Headers(request.headers)) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  // getUser validates the session and gives Supabase time to write refreshed cookies.
  // Authorization remains the responsibility of pages and handlers.
  const { data, error } = await supabase.auth.getUser();
  const missingSession = error?.code === "session_not_found" || error?.message === "Auth session missing!";
  if (error && !missingSession) {
    console.warn("[AUTH-SESSION] proxy refresh failed", {
      errorCode: error.code,
      errorMessage: error.message
    });
  } else if (data.user) {
    console.info("[AUTH-SESSION] proxy session refreshed", { userIdExists: true });
  }
  return response;
}
