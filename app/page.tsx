import Link from "next/link";
import { DownloadLink } from "@/components/download-link";
import { FrontpageScreenshotCarousel } from "@/components/frontpage-screenshot-carousel";
import { SiteFooter, SiteNav } from "@/components/site-nav";

const desktopRelease = "v4.2.0";
const windowsDownload = "/downloads/fydor-windows-v4.2.0.exe";
const macDownload = "/downloads/fydor-mac-v4.2.0.dmg";

const WindowsIcon = () => (
  <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 4.5 11 3v8H3V4.5Zm0 7.5h8v8l-8-1.5V12Zm9-8.2L21 2v9h-9V3.8Zm0 9.2h9v9l-9-1.5V13Z" />
  </svg>
);

const AppleIcon = () => (
  <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14.7 2.5c.2 1.2-.4 2.5-1.2 3.4-.9 1.1-2.3 2-3.6 1.9-.2-1.2.5-2.5 1.3-3.4.9-1 2.3-1.8 3.5-1.9Zm4.9 16.4c-.7 1.5-1.7 3.4-3.4 3.5-1.5.1-2-1-3.8-1s-2.3 1-3.8 1c-1.7-.1-2.9-1.8-3.6-3.3C3.4 16 2.4 10.5 4.7 7.8c1.1-1.3 2.6-2.1 4.1-2.1 1.7 0 2.9 1 4.1 1 1.1 0 2.7-1 4.5-.9.8 0 3 .3 4.2 2-3.5 1.9-3 6.9.1 8.2-.1.3-.1.5-.1.9Z" />
  </svg>
);

export default function Home() {
  return (
    <>
      <SiteNav home />
      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="pill pill-accent">Free for the people</span>
            <h1 id="hero-title">Fydor</h1>
            <p className="lede">
              A desktop study space for building language lessons, importing sentence-rich material,
              and reviewing what matters with calm spaced repetition.
            </p>
            <div className="hero-actions" id="download">
              <DownloadLink className="button" file={windowsDownload} platform="windows">
                <WindowsIcon /> Download for Windows
              </DownloadLink>
              <DownloadLink className="button secondary" file={macDownload} platform="mac">
                <AppleIcon /> Download for Mac
              </DownloadLink>
            </div>
            <div className="download-help-links" aria-label="Install help">
              <Link href="/install?platform=windows">Open Windows install help</Link>
              <Link href="/install?platform=mac">Open Mac install help</Link>
            </div>
            <p className="muted release-note">
              {desktopRelease} is the current desktop release for Windows and macOS. Your lessons and review
              history stay on your device.
            </p>
            <Link className="text-link" href="/patch-notes">Read the patch notes <span aria-hidden="true">→</span></Link>
            <Link className="text-link" href="/library">Browse the Exchange <span aria-hidden="true">→</span></Link>
          </div>

          <FrontpageScreenshotCarousel />
        </section>

        <section className="section split" id="features" aria-labelledby="features-title">
          <div><span className="eyebrow">How it works</span><h2 id="features-title">Import a lesson. Study the sentences. Keep what sticks.</h2></div>
          <div className="feature-list">
            <article><h3>Bring your own material</h3><p>Load lesson packs with vocabulary, translations, notes, and example sentences in one place.</p></article>
            <article><h3>Practice in context</h3><p>Move between flashcards, fill-in-the-blank prompts, multiple choice, and sentence recall.</p></article>
            <article><h3>Review what is due</h3><p>Missed sentences return sooner. Easy ones wait longer. The queue stays calm and useful.</p></article>
          </div>
        </section>

        <section className="section download-panel" aria-labelledby="download-title">
          <div><span className="eyebrow">Desktop</span><h2 id="download-title">Download Fydor</h2><p className="muted">Choose the installer for your computer.</p></div>
          <div className="download-grid">
            <article className="download-card">
              <span className="pill platform-pill"><WindowsIcon /> Windows</span>
              <strong>Fydor for Windows</strong>
              <span>Install the current desktop release and keep your study library local.</span>
              <div className="download-card-actions"><DownloadLink className="button" file={windowsDownload} platform="windows">Download {desktopRelease}</DownloadLink><Link className="text-link" href="/install?platform=windows">Open after download</Link></div>
            </article>
            <article className="download-card">
              <span className="pill platform-pill"><AppleIcon /> macOS</span>
              <strong>Fydor for Mac</strong>
              <span>Open the disk image, then drag Fydor into Applications.</span>
              <div className="download-card-actions"><DownloadLink className="button" file={macDownload} platform="mac">Download {desktopRelease}</DownloadLink><Link className="text-link" href="/install?platform=mac">Open after download</Link></div>
            </article>
          </div>
        </section>

        <section className="section split" id="format" aria-labelledby="format-title">
          <div><span className="eyebrow">Portable content</span><h2 id="format-title">Share lessons without locking them away.</h2></div>
          <p className="body-copy">Fydor lesson packs let teachers, students, and self-learners move useful material between machines without a subscription or hosted account. Community-reviewed packs live in the Exchange.</p>
        </section>

        <section className="section install-notes" aria-labelledby="install-title">
          <div><span className="eyebrow">Mac install</span><h2 id="install-title">If your Mac blocks Fydor on first launch.</h2><p className="body-copy">The current download may trigger a macOS security warning on first launch.</p></div>
          <div className="feature-list install-notes-list">
            <article><h3>Open it safely</h3><p>Control-click Fydor in Finder and choose <strong>Open</strong>.</p></article>
            <article><h3>If macOS still warns</h3><p>Open <strong>System Settings → Privacy &amp; Security</strong> and choose <strong>Open Anyway</strong>.</p></article>
          </div>
          <Link className="text-link" href="/install?platform=mac">Full install help <span aria-hidden="true">→</span></Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
