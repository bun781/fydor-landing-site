"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SiteNav } from "@/components/site-nav";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup" | "forgot" | "reset";

function safeError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as { code?: unknown; message?: unknown; name?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : String(error),
    name: typeof value.name === "string" ? value.name : undefined
  };
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    console.info("[AUTH-UI] form rendered", { mode });
  }, [mode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.info("[AUTH-UI] submit clicked", { mode });
    if (inFlight.current) {
      console.info("[AUTH-UI] duplicate submit ignored", { mode });
      return;
    }
    void submit(new FormData(event.currentTarget));
  }

  async function submit(form: FormData) {
    setMessage("");
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (mode !== "reset" && !email) {
      console.warn("[AUTH-UI] validation failed", { mode, reason: "missing_email" });
      setMessage("Enter your email address.");
      return;
    }
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn("[AUTH-UI] validation failed", { mode, reason: "invalid_email" });
      setMessage("Enter a valid email address.");
      return;
    }
    if (mode !== "forgot" && !password) {
      console.warn("[AUTH-UI] validation failed", { mode, reason: "missing_password" });
      setMessage("Enter your password.");
      return;
    }
    if ((mode === "signup" || mode === "reset") && password.length < 8) {
      console.warn("[AUTH-UI] validation failed", { mode, reason: "short_new_password" });
      setMessage("Use at least 8 characters for your new password.");
      return;
    }

    console.info("[AUTH-UI] validation passed", { mode, hasEmail: Boolean(email) });
    inFlight.current = true;
    setBusy(true);
    console.info("[AUTH-UI] request starting", { mode });
    console.info("[AUTH-ROUTE] browser-direct flow; no Next.js auth handler", { mode });

    try {
      const supabase = createClient();

      if (mode === "login") {
        console.info("[AUTH-SUPABASE] call starting", { operation: "signInWithPassword" });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        console.info("[AUTH-SUPABASE] call completed", {
          operation: "signInWithPassword",
          errorCode: error?.code,
          errorMessage: error?.message,
          sessionExists: Boolean(data.session),
          userIdExists: Boolean(data.user?.id)
        });
        if (error) {
          console.warn("[AUTH-UI] failure rendered", { mode, ...safeError(error) });
          setMessage(error.message);
          return;
        }
        const { data: persisted, error: sessionError } = await supabase.auth.getSession();
        console.info("[AUTH-SESSION] session established", {
          errorCode: sessionError?.code,
          sessionExists: Boolean(persisted.session),
          userIdExists: Boolean(persisted.session?.user.id)
        });
        if (sessionError || !data.session || !persisted.session) {
          setMessage("Sign-in completed without a persistent session. Please try again.");
          console.warn("[AUTH-UI] failure rendered", { mode, reason: "missing_persisted_session" });
          return;
        }
        setMessage("Signed in. Redirecting…");
        console.info("[AUTH-UI] success rendered", { mode, destination: "/contribute" });
        window.setTimeout(() => window.location.assign("/contribute"), 0);
        return;
      }

      if (mode === "signup") {
        console.info("[AUTH-SUPABASE] call starting", { operation: "signUp" });
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback?next=/contribute` }
        });
        console.info("[AUTH-SUPABASE] call completed", {
          operation: "signUp",
          errorCode: error?.code,
          errorMessage: error?.message,
          sessionExists: Boolean(data.session),
          userIdExists: Boolean(data.user?.id)
        });
        if (error) {
          console.warn("[AUTH-UI] failure rendered", { mode, ...safeError(error) });
          setMessage(error.message);
          return;
        }
        if (data.session) {
          const { data: persisted, error: sessionError } = await supabase.auth.getSession();
          console.info("[AUTH-SESSION] session established", {
            errorCode: sessionError?.code,
            sessionExists: Boolean(persisted.session),
            userIdExists: Boolean(persisted.session?.user.id)
          });
          if (sessionError || !persisted.session) {
            setMessage("Account created without a persistent session. Please sign in.");
            console.warn("[AUTH-UI] failure rendered", { mode, reason: "missing_persisted_session" });
            return;
          }
          setMessage("Account created. Redirecting…");
          console.info("[AUTH-UI] success rendered", { mode, destination: "/contribute" });
          window.setTimeout(() => window.location.assign("/contribute"), 0);
          return;
        }
        setMessage("Check your email to confirm your account.");
        console.info("[AUTH-UI] success rendered", { mode, confirmationRequired: true });
        return;
      }

      if (mode === "forgot") {
        console.info("[AUTH-SUPABASE] call starting", { operation: "resetPasswordForEmail" });
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/reset-password`
        });
        console.info("[AUTH-SUPABASE] call completed", {
          operation: "resetPasswordForEmail",
          errorCode: error?.code,
          errorMessage: error?.message
        });
        setMessage(error ? error.message : "If the address is eligible, recovery instructions have been sent.");
        console.info(error ? "[AUTH-UI] failure rendered" : "[AUTH-UI] success rendered", { mode });
        return;
      }

      console.info("[AUTH-SUPABASE] call starting", { operation: "updateUser" });
      const { data, error } = await supabase.auth.updateUser({ password });
      console.info("[AUTH-SUPABASE] call completed", {
        operation: "updateUser",
        errorCode: error?.code,
        errorMessage: error?.message,
        userIdExists: Boolean(data.user?.id)
      });
      setMessage(error ? error.message : "Password updated. You can now continue.");
      console.info(error ? "[AUTH-UI] failure rendered" : "[AUTH-UI] success rendered", { mode });
    } catch (error) {
      console.error("[AUTH-SUPABASE] request failed", { mode, ...safeError(error) });
      setMessage("Account services are unavailable right now. Please try again later.");
      console.warn("[AUTH-UI] failure rendered", { mode, reason: "network_or_configuration" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return <><SiteNav /><main className="auth-page"><section className="auth-card"><div><span className="eyebrow">Fydor Exchange</span><h1>{title}</h1></div><form noValidate onSubmit={handleSubmit}>{mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}{mode !== "forgot" && <label>Password<input name="password" type="password" minLength={mode === "login" ? undefined : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}<button type="submit" className="button" disabled={busy} aria-busy={busy}>{busy ? "Please wait…" : title}</button></form>{message && <p role="status" aria-live="polite">{message}</p>}<div className="auth-links">{mode === "login" && <><Link href="/signup">Create an account</Link><Link href="/forgot-password">Forgot password?</Link></>}{mode === "signup" && <Link href="/login">Already have an account?</Link>}{mode !== "login" && mode !== "signup" && <Link href="/login">Back to sign in</Link>}</div></section></main></>;
}
