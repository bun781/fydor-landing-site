import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const metadata: Metadata = { title: "About" };

export default function About() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="page-hero">
          <span className="eyebrow">About Fydor</span>
          <h1>Language learning should feel like reading, not account management.</h1>
          <p>Fydor is a local-first desktop study space built around useful sentences, portable lessons, and calm review.</p>
        </section>
        <section className="section about-grid">
          <article><h2>Local first</h2><p>Your lessons, progress, and review history live on your computer—not behind a subscription.</p></article>
          <article><h2>Context first</h2><p>Vocabulary stays attached to the sentences that make it meaningful and memorable.</p></article>
          <article><h2>Open exchange</h2><p>Portable lesson packs can be shared, moderated, downloaded, and studied by the community.</p></article>
        </section>
        <section className="section split">
          <div><span className="eyebrow">Start studying</span><h2>Use the material you already care about.</h2></div>
          <div className="feature-list">
            <article><p>Download the desktop app, bring a lesson pack, or browse community-reviewed material in the Exchange.</p><div className="workspace-actions"><Link className="button" href="/#download">Download Fydor</Link><Link className="button secondary" href="/library">Browse the Exchange</Link></div></article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
