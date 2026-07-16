"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { api } from "@/lib/website-api";

type AccountState = { signedIn: boolean; isAdmin: boolean };

export function SiteNav({ home = false }: { home?: boolean }) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const supabase = createClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          if (active) setAccount({ signedIn: false, isAdmin: false });
          return;
        }

        if (active) setAccount({ signedIn: true, isAdmin: false });
        try {
          const { actor } = await api<{ actor: { roles: string[] } }>("/api/contributor?action=me");
          const isAdmin = actor.roles.includes("admin") || actor.roles.includes("super_admin");
          if (active) setAccount({ signedIn: true, isAdmin });
        } catch {
          // Account controls remain available if role lookup is temporarily unavailable.
        }
      } catch {
        if (active) setAccount({ signedIn: false, isAdmin: false });
      }
    }

    void loadAccount();
    return () => { active = false; };
  }, []);

  async function logout() {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.assign("/");
    } catch {
      setLogoutFailed(true);
      setLoggingOut(false);
    }
  }

  return (
    <header className="site-header">
      <Link className="brand" href={home ? "#top" : "/"} aria-label="Fydor home">
        <img className="brand-mark" src="/assets/fydor-logo.png" alt="" />
        <span>Fydor</span>
      </Link>
      <nav className="nav" aria-label="Primary navigation">
        {home && <a href="#download">Download</a>}
        <Link href="/library">Exchange</Link>
        <Link href="/contribute">Contribute</Link>
        {account?.isAdmin && <Link href="/admin">Admin</Link>}
        {home && <a href="#features">Features</a>}
        <Link href="/about">About</Link>
        {account?.signedIn ? (
          <button
            className="nav-account nav-account-button"
            type="button"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Logging out…" : logoutFailed ? "Retry logout" : "Log out"}
          </button>
        ) : account ? (
          <Link className="nav-account" href="/login">Sign in</Link>
        ) : null}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return <footer className="footer"><span>Fydor</span><span>No paywall. No subscriptions.</span></footer>;
}
