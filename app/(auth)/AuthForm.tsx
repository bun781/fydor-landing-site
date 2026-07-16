"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { createClient } from "@/lib/supabase/browser";
export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setMessage("");
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    try {
      const supabase = createClient();
      if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Unable to sign in. Check your details and try again."); else { router.replace("/contribute"); router.refresh(); } }
      else if (mode === "signup") { const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/contribute` } }); setMessage(error ? "We could not create that account. Try again later." : "Check your email to confirm your account."); }
      else if (mode === "forgot") { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` }); setMessage(error ? "We could not start password recovery. Try again later." : "If the address is eligible, recovery instructions have been sent."); }
      else { const { error } = await supabase.auth.updateUser({ password }); setMessage(error ? "We could not update your password." : "Password updated. You can now continue."); }
    } catch (error) {
      console.error("Supabase authentication request failed.", error);
      setMessage("Account services are unavailable right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }
  const title = mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return <><SiteNav /><main className="auth-page"><section className="auth-card"><div><span className="eyebrow">Fydor Exchange</span><h1>{title}</h1></div><form action={submit}>{mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}{mode !== "forgot" && <label>Password<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}<button className="button" disabled={busy}>{busy ? "Please wait…" : title}</button></form>{message && <p role="status">{message}</p>}<div className="auth-links">{mode === "login" && <><Link href="/signup">Create an account</Link><Link href="/forgot-password">Forgot password?</Link></>}{mode === "signup" && <Link href="/login">Already have an account?</Link>}{mode !== "login" && mode !== "signup" && <Link href="/login">Back to sign in</Link>}</div></section></main></>;
}
