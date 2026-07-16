import Link from "next/link";

export function SiteNav({ home = false }: { home?: boolean }) {
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
        <Link href="/admin">Admin</Link>
        {home && <a href="#features">Features</a>}
        <Link href="/about">About</Link>
        <Link className="nav-account" href="/login">Sign in</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return <footer className="footer"><span>Fydor</span><span>No paywall. No subscriptions.</span></footer>;
}
