"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { createClient } from "@/lib/supabase/browser";
export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(new FormData(event.currentTarget));
  }
  async function submit(form: FormData) {
    setMessage("");
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (mode !== "reset" && !email) return setMessage("Enter your email address.");
    if (mode !== "forgot" && !password) return setMessage("Enter your password.");
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setMessage("Use at least 8 characters for your new password.");

    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage(error.message);
        else if (data.session) window.location.assign("/contribute");
        else setMessage("Sign-in completed without a session. Please try again.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/contribute` } });
        if (error) setMessage(error.message);
        else if (data.session) window.location.assign("/contribute");
        else setMessage("Check your email to confirm your account.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
        setMessage(error ? error.message : "If the address is eligible, recovery instructions have been sent.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        setMessage(error ? error.message : "Password updated. You can now continue.");
      }
    } catch (error) {
      console.error("Supabase authentication request failed.", error);
      setMessage("Account services are unavailable right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }
  const title = mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return <><SiteNav /><main className="auth-page"><section className="auth-card"><div><span className="eyebrow">Fydor Exchange</span><h1>{title}</h1></div><form noValidate onSubmit={handleSubmit}>{mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}{mode !== "forgot" && <label>Password<input name="password" type="password" minLength={mode === "login" ? undefined : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}<button className="button" disabled={busy}>{busy ? "Please wait…" : title}</button></form>{message && <p role="status" aria-live="polite">{message}</p>}<div className="auth-links">{mode === "login" && <><Link href="/signup">Create an account</Link><Link href="/forgot-password">Forgot password?</Link></>}{mode === "signup" && <Link href="/login">Already have an account?</Link>}{mode !== "login" && mode !== "signup" && <Link href="/login">Back to sign in</Link>}</div></section></main></>;
}
