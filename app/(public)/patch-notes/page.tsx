import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site-nav";

type PatchNote = {
  date: string;
  title: string;
  detail: string;
};

type Release = {
  version: string;
  date: string;
  dateTime: string;
  status: "Current release" | "Content & quality-of-life" | "Desktop release" | "Early release";
  statusTone: "current" | "content" | "desktop" | "early";
  summary: string;
  highlights: string[];
  patches: PatchNote[];
};

const releases: Release[] = [
  {
    version: "v4.2.1",
    date: "July 18, 2026",
    dateTime: "2026-07-18",
    status: "Current release",
    statusTone: "current",
    summary: "A small quality-of-life patch that makes the library easier to handle and gives the desktop app a calmer, more cohesive color scheme.",
    highlights: [
      "Refreshed the desktop palette with softer greens, clearer primary actions, and warm accents for learning states.",
      "Made the full lesson-library row select a lesson while preserving direct controls for opening, editing, exporting, and sharing it.",
      "Kept practice setup and loading behavior reliable across Fill Blank and Multiple Choice.",
      "Published the current first-party lesson packs through the Exchange seed workflow.",
    ],
    patches: [
      { date: "July 18", title: "A calmer study space", detail: "The desktop color system now uses a gentler green foundation, clearer actions, and warmer learning highlights across the app." },
      { date: "July 18", title: "Less fiddling in the library", detail: "Select a lesson from anywhere on its row, while the row’s open, edit, export, and share controls keep doing exactly what you expect." },
    ],
  },
  {
    version: "v4.2.0",
    date: "July 18, 2026",
    dateTime: "2026-07-18",
    status: "Current release",
    statusTone: "current",
    summary: "A release-readiness and usability update that makes starting, studying, and managing a growing local library easier.",
    highlights: [
      "Replaced the long first-run tour with goal-based, localized guidance in English, Vietnamese, and Spanish.",
      "Fixed Fill Blank lesson loading and kept multi-question setup choices intact.",
      "Added indexed lesson search, faster study loading, and atomic pack installation.",
      "Expanded migration, import, tutorial, and release verification before producing the new installers.",
    ],
    patches: [
      { date: "July 18", title: "A shorter way in", detail: "New learners can choose to install a course or create a lesson and see only the guide they need." },
      { date: "July 18", title: "Practice starts when you ask", detail: "Corrected lazy loading in Fill Blank and preserved the chosen question count until the real lesson pool is ready." },
    ],
  },
  {
    version: "v4.1.0",
    date: "July 16, 2026",
    dateTime: "2026-07-16",
    status: "Desktop release",
    statusTone: "desktop",
    summary: "The previous desktop installer release, bringing Fydor's local-first study workflow together for Windows and macOS.",
    highlights: [
      "Prepared Windows and macOS installers around the Vite + Tauri desktop architecture.",
      "Rebuilt Reading Mode and added local lesson-pack management and pack export.",
      "Added in-app contributor publishing plus public Exchange and library integration.",
      "Strengthened annotation resolution, curriculum and language foundations, guided tours, integrity checks, and moderation routing.",
    ],
    patches: [
      { date: "July 16", title: "Ready for the desktop", detail: "Prepared the Windows and macOS installer release so the new study experience could move from active development into people’s hands." },
      { date: "July 8–16", title: "The little things caught up", detail: "Resolved reading, publishing, and release-readiness issues uncovered as the new architecture, contributor tools, and lesson workflow came together." },
    ],
  },
  {
    version: "Post-v4.1.0 content and QoL patches",
    date: "July 18, 2026",
    dateTime: "2026-07-18",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "A content refresh and a few small touches to make the growing lesson library feel faster and easier to manage.",
    highlights: [
      "Updated bundled lesson packs to v2.",
      "Refreshed Vietnamese, Mandarin, Korean, Spanish, and German packs.",
      "Added the Japanese Intermediate: Natural Conversation pack.",
      "Optimized loading and lesson management, including a small lesson-library quality-of-life update.",
    ],
    patches: [
      { date: "July 18", title: "A richer starter shelf", detail: "Moved bundled packs to v2 and refreshed Vietnamese, Mandarin, Korean, Spanish, and German content—then added Japanese Intermediate: Natural Conversation." },
      { date: "July 18", title: "Less waiting, more learning", detail: "Tuned lesson loading and management so a growing local library stays quick to open, browse, and maintain." },
    ],
  },
  {
    version: "Release readiness & language foundations patch",
    date: "July 16, 2026",
    dateTime: "2026-07-16",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "The final desktop-app work collected before the v4.1.0 installers were prepared.",
    highlights: [
      "Added annotation resolution alongside curriculum and language foundations.",
      "Exposed the new curriculum capabilities through the desktop bridge.",
      "Added new guided tours and tightened release-readiness checks.",
      "Routed Exchange submissions through moderation and verified downloaded-pack integrity.",
    ],
    patches: [
      { date: "July 16", title: "Annotations without the drag", detail: "Batched cached lesson-annotation resolution and added performance coverage, reducing repeated work while opening annotated material." },
      { date: "July 16", title: "Guardrails for shared packs", detail: "Verified downloaded-pack integrity and sent Exchange submissions through moderation, bringing more confidence to community sharing." },
    ],
  },
  {
    version: "Local packs & community workspace patch",
    date: "July 14, 2026",
    dateTime: "2026-07-14",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "A desktop-focused push to make lessons portable, manageable, and easier to share through the Fydor community.",
    highlights: [
      "Added local lesson-pack management in the desktop app.",
      "Added desktop .fydorpack export.",
      "Hardened release readiness while the public community workspace came online.",
    ],
    patches: [
      { date: "July 14", title: "Your library, exportable", detail: "Made it possible to manage packs locally and export a desktop .fydorpack when a lesson is ready to travel." },
      { date: "July 14", title: "Local work meets community", detail: "Smoothed the bridge between private lesson work on a device and the public Fydor community workspace." },
    ],
  },
  {
    version: "Contributor publishing & Exchange workflow patch",
    date: "July 10, 2026",
    dateTime: "2026-07-10",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "A major workflow update that connected desktop lesson creation with contribution and community-sharing paths.",
    highlights: [
      "Added the in-app contributor publishing workflow.",
      "Refined Exchange and community workflows around publishing and review.",
      "Fixed guided-tour route scopes and guide-button destinations.",
    ],
    patches: [
      { date: "July 10", title: "From lesson to contribution", detail: "Added the first in-app publishing path, giving contributors a clearer route from a finished lesson to a shareable submission." },
      { date: "July 10", title: "Guidance that stays on course", detail: "Corrected guide-button destinations and tour route scopes so help appears where it is useful instead of losing people in the flow." },
    ],
  },
  {
    version: "Reading Mode & Vite architecture patch",
    date: "July 8, 2026",
    dateTime: "2026-07-08",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "A substantial desktop foundation update that gave reading a dedicated workspace and modernized the app shell.",
    highlights: [
      "Migrated the desktop frontend from Next.js to Vite + React inside Tauri.",
      "Rebuilt Reading Mode as a lesson reader with an analyzer tab.",
      "Overhauled review logic and refined the review-page button layout.",
    ],
    patches: [
      { date: "July 8", title: "A desktop shell built to last", detail: "Moved the desktop frontend to Vite + React inside Tauri, creating a cleaner foundation for the app’s next stage." },
      { date: "July 8", title: "Reading gets a home", detail: "Recast Reading Mode as a real lesson reader with an analyzer tab, so study can start from meaningful text rather than isolated prompts." },
    ],
  },
  {
    version: "Lesson library quality-of-life patch",
    date: "July 5, 2026",
    dateTime: "2026-07-05",
    status: "Content & quality-of-life",
    statusTone: "content",
    summary: "A small usability pass on the local lesson library ahead of the larger Reading Mode and publishing work.",
    highlights: [
      "Added lesson deletion support.",
      "Made general quality-of-life and cleanup improvements to lesson handling.",
    ],
    patches: [
      { date: "July 5", title: "Make room for better lessons", detail: "Added lesson deletion, a small but important control for keeping a personal study library useful rather than cluttered." },
      { date: "July 5", title: "Quiet cleanup", detail: "Polished the surrounding lesson-management experience ahead of the larger Reading Mode and publishing work." },
    ],
  },
  {
    version: "v2.0.0",
    date: "June 27, 2026",
    dateTime: "2026-06-27",
    status: "Desktop release",
    statusTone: "desktop",
    summary: "A compatibility and review-focused release that made portable packs more reliable and the review experience more complete.",
    highlights: [
      "Made pack export and import compatible with optional and null fields, including Rust-side export fixes and backward-compatible stripNulls() parsing.",
      "Introduced Review Page v2 with stronger stats, dashboard fixes, tutorials, and charts.",
      "Completed a focused round of review and release cleanup fixes.",
    ],
    patches: [
      { date: "June 27", title: "Packs that survive the trip", detail: "Fixed Rust optional-field export behavior and made stripNulls() parsing backward compatible, so null fields no longer break imports between app versions." },
      { date: "June 27", title: "A review page worth returning to", detail: "Completed Review Page v2 with stronger dashboard and stats fixes, tutorial support, and charts that make progress easier to read." },
    ],
  },
  {
    version: "v0.1.1",
    date: "June 26, 2026",
    dateTime: "2026-06-26",
    status: "Desktop release",
    statusTone: "desktop",
    summary: "A rapid iteration on lesson creation and evidence-based study, with progress and session details made more dependable.",
    highlights: [
      "Refreshed Lesson Builder metadata and improved language imports.",
      "Added the evidence-based review engine, Exchange groundwork, and tutorial guidance.",
      "Persisted study progress and added review-session completion insights.",
      "Preserved loading state and fixed review-space, reveal, and smaller review-mode issues.",
    ],
    patches: [
      { date: "June 26", title: "Progress that stays put", detail: "Preserved loading state and study-tab progress, so returning to a lesson feels like picking up a book where you left it." },
      { date: "June 26", title: "A calmer review session", detail: "Fixed review-space and reveal behavior, sharpened mode handling, and added completion insights for a more coherent end-of-session moment." },
    ],
  },
  {
    version: "Lesson import & study modes patch",
    date: "June 23, 2026",
    dateTime: "2026-06-23",
    status: "Early release",
    statusTone: "early",
    summary: "An early post-launch update that made building lessons and practicing their content more flexible.",
    highlights: [
      "Expanded lesson import and export work and made adding lessons easier.",
      "Fixed audio playback and improved annotation handling.",
      "Refined fill-in-the-blank study mode.",
    ],
    patches: [
      { date: "June 23", title: "More ways in", detail: "Expanded lesson import and export work and made adding material easier, reinforcing Fydor’s bring-your-own-content approach." },
      { date: "June 23", title: "More ways to practice", detail: "Fixed audio playback, improved annotation handling, and refined fill-in-the-blank practice for a better sentence-study loop." },
    ],
  },
  {
    version: "v0.1.0 — first feature patch",
    date: "June 21, 2026",
    dateTime: "2026-06-21",
    status: "Early release",
    statusTone: "early",
    summary: "The first day of rapid feature work after the initial app foundation landed.",
    highlights: [
      "Added the native Tauri desktop shell, app icon, and UI revamp.",
      "Added review, improved imports, audio options, shuffle and reveal fixes.",
      "Added highlighted annotated spans, overlapping annotations, a first-run tour, and multiple-choice mode.",
    ],
    patches: [
      { date: "June 21", title: "The desktop app takes shape", detail: "Added the native Tauri shell, app icon, and a full UI revamp—the first moment Fydor began to feel like a dedicated study place." },
      { date: "June 21", title: "Study modes get personality", detail: "Added multiple choice, audio options, a guided first run, highlighted sentence annotations, and support for overlapping notes." },
      { date: "June 21", title: "A clearer early-release record", detail: "Fixed lesson loading and added GPLv3 licensing. The git tag reads 1.0.0, but the app metadata correctly remained v0.1.0." },
    ],
  },
  {
    version: "v0.1.0 — initial foundation",
    date: "June 20, 2026",
    dateTime: "2026-06-20",
    status: "Early release",
    statusTone: "early",
    summary: "The initial foundation for Fydor: import useful material and shape it into canonical lessons.",
    highlights: [
      "Implemented the canonical lesson-import system.",
      "Added the first Lesson Builder experience.",
      "Established the initial project and import foundation for the desktop app.",
    ],
    patches: [
      { date: "June 20", title: "The first brick", detail: "The canonical lesson-import system and Lesson Builder established the original promise: turn real language material into study-ready lessons." },
      { date: "June 20", title: "One day before momentum", detail: "This foundation made the dense next-day v0.1.0 feature patch possible." },
    ],
  },
];

export const metadata: Metadata = {
  title: "Patch Notes",
  description: "Desktop app release notes and curated fixes for Fydor.",
};

export default function PatchNotesPage() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="page-hero patch-notes-hero">
          <div className="patch-notes-hero-copy">
            <span className="eyebrow">Desktop app history</span>
            <h1>Fydor, in motion.</h1>
            <p>From a first lesson importer to a full local-first study space: reading, review, portable packs, and a community Exchange—built in public and made to stay yours.</p>
            <div className="patch-notes-hero-links">
              <Link className="button" href="/#download">Download v4.2.1</Link>
              <a className="text-link" href="#release-history">Explore the journey <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <aside className="patch-release-spotlight" aria-label="Current desktop release">
            <span className="eyebrow">Now shipping</span>
            <strong>v4.2.1</strong>
            <p>Fydor for Windows and macOS, with a calmer color scheme and smoother lesson-library controls.</p>
            <div className="patch-spotlight-meta"><span>July 18, 2026</span><span>Windows + macOS</span></div>
          </aside>
        </section>

        <section className="patch-story" aria-labelledby="patch-story-title">
          <div className="patch-story-intro"><span className="eyebrow">What changed</span><h2 id="patch-story-title">A bigger app, without giving up the quiet parts.</h2></div>
          <div className="patch-story-grid">
            <article><span>01</span><h3>Study in context</h3><p>Reading Mode, sentence annotations, and flexible review modes keep language connected to the material it came from.</p></article>
            <article><span>02</span><h3>Keep it portable</h3><p>Lesson packs can be built, exported, checked for integrity, shared, and brought back to your own device.</p></article>
            <article><span>03</span><h3>Share with care</h3><p>Contributor publishing, moderation routing, and the Exchange make community material easier to discover and trust.</p></article>
          </div>
        </section>

        <section className="patch-notes-timeline" id="release-history" aria-label="Fydor desktop app release history">
          <div className="patch-timeline-heading"><span className="eyebrow">Release history</span><p>Every shipped milestone, plus the smaller changes that made the big ones land.</p></div>
          {releases.map((release) => (
            <article className="patch-release" key={release.version}>
              <div className="patch-release-meta">
                <time dateTime={release.dateTime}>{release.date}</time>
                <span className={`patch-status patch-status-${release.statusTone}`}>{release.status}</span>
              </div>
              <div className="patch-release-content">
                <h2>{release.version}</h2>
                <p className="patch-summary">{release.summary}</p>
                <ul className="patch-highlights">
                  {release.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                </ul>
                <div className="patch-fixes">
                  <h3>Smaller patches &amp; fixes</h3>
                  {release.patches.map((patch) => (
                    <article key={`${patch.date}-${patch.title}`}>
                      <time>{patch.date}</time>
                      <div><strong>{patch.title}</strong><p>{patch.detail}</p></div>
                    </article>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="section patch-notes-cta">
          <div><span className="eyebrow">Current release</span><h2>Ready to study with Fydor?</h2></div>
          <p className="body-copy">Download the current desktop release for a local-first space for lessons, reading, and review.</p>
          <Link className="button" href="/#download">Download Fydor</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
