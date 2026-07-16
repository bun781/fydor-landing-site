import Link from "next/link";

export default function Home() {
  return <main><nav><Link href="/about">About</Link><Link href="/library">Exchange</Link><Link href="/login">Sign in</Link></nav><p>Local-first language learning</p><h1>Learn from the language you actually want to read.</h1><p className="notice">Fydor keeps your study data on your device while the Exchange lets the community share reviewed lesson packs.</p><p><Link className="button" href="/library">Browse the Exchange</Link></p></main>;
}
