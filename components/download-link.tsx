"use client";

import { type MouseEvent, type ReactNode } from "react";

type DownloadLinkProps = {
  children: ReactNode;
  className?: string;
  file: "/downloads/fydor-mac.dmg" | "/downloads/fydor-windows.exe";
  platform: "mac" | "windows";
};

export function DownloadLink({ children, className, file, platform }: DownloadLinkProps) {
  function startDownload(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.src = file;
    document.body.append(frame);
    window.setTimeout(() => window.location.assign(`/install?platform=${platform}`), 250);
  }

  return <a className={className} href={file} onClick={startDownload}>{children}</a>;
}
