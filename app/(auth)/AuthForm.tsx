"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(form: FormData) { setBusy(true); setMessage(""); const email = String(form.get("email") || ""); const password = String(form.get("password") || ""); const supabase = createClient();
    if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Unable to sign in. Check your details and try again."); else { router.replace("/contribute"); router.refresh(); } }
    else if (mode === "signup") { const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/contribute` } }); setMessage(error ? "We could not create that account. Try again later." : "Check your email to confirm your account."); }
    else if (mode === "forgot") { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` }); setMessage(error ? "We could not start password recovery. Try again later." : "If the address is eligible, recovery instructions have been sent."); }
    else { const { error } = await supabase.auth.updateUser({ password }); setMessage(error ? "We could not update your password." : "Password updated. You can now continue."); } setBusy(false); }
  const title = mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return <main><h1>{title}</h1><form action={submit}><label>Email{mode !== "reset" && <input name="email" type="email" autoComplete="email" required />}</label>{mode !== "forgot" && <label>Password<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}<button className="button" disabled={busy}>{busy ? "Please wait…" : title}</button></form>{message && <p role="status">{message}</p>}</main>;
}
