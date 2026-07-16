import Link from "next/link";

export function SiteNav() {
  return <header className="site-nav"><Link className="brand" href="/">Fydor</Link><nav aria-label="Main navigation"><Link href="/library">Library</Link><Link href="/contribute">Contribute</Link><Link href="/moderate">Moderate</Link></nav></header>;
}
