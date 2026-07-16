"use client";

import { useEffect, useState } from "react";

type Platform = "mac" | "windows";

function requestedPlatform(): Platform | null {
  const platform = new URLSearchParams(window.location.search).get("platform");
  return platform === "mac" || platform === "windows" ? platform : null;
}

function detectedPlatform(): Platform {
  return /mac/i.test(navigator.userAgent) ? "mac" : "windows";
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("windows");
  const [copied, setCopied] = useState(false);

  useEffect(() => setPlatform(requestedPlatform() ?? detectedPlatform()), []);

  const isMac = platform === "mac";
  const command = "xattr -cr /Applications/Fydor.app";

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  }

  return (
    <section className="install-guide" aria-labelledby="install-page-title">
      <header className="page-hero">
        <span className="eyebrow">Desktop install</span>
        <h1 id="install-page-title">Open Fydor safely.</h1>
        <p>Fydor is currently distributed without Apple or Microsoft code signing. Choose your system for the exact first-launch steps.</p>
      </header>
      <div className="install-platform-switcher" aria-label="Choose your operating system">
        <button type="button" aria-pressed={isMac} onClick={() => setPlatform("mac")}>macOS</button>
        <button type="button" aria-pressed={!isMac} onClick={() => setPlatform("windows")}>Windows</button>
      </div>
      {isMac ? (
        <>
          <div className="install-warning">macOS may say Fydor cannot be opened because its developer cannot be verified. This is expected for the current unsigned release.</div>
          <ol className="install-steps">
            <li>Open the downloaded DMG and drag <strong>Fydor</strong> into <strong>Applications</strong>.</li>
            <li>In Finder, Control-click Fydor in Applications and choose <strong>Open</strong>, then confirm.</li>
            <li>If macOS still blocks it, open Terminal and run this command:</li>
          </ol>
          <div className="install-command"><code>{command}</code><button type="button" onClick={() => void copyCommand()}>{copied ? "Copied" : "Copy"}</button></div>
          <p className="muted">You can also use System Settings → Privacy &amp; Security → Open Anyway after attempting to open Fydor once.</p>
        </>
      ) : (
        <>
          <div className="install-warning">Windows SmartScreen may warn that Fydor is from an unrecognized publisher. This is expected for the current unsigned release.</div>
          <ol className="install-steps">
            <li>Open the downloaded Fydor installer.</li>
            <li>On the SmartScreen window, choose <strong>More info</strong>.</li>
            <li>Confirm the app name is Fydor, then choose <strong>Run anyway</strong> to continue installation.</li>
          </ol>
          <p className="muted">Only continue if you downloaded Fydor from this website or the official Fydor GitHub Release.</p>
        </>
      )}
    </section>
  );
}
