"use client";

import { type ReactNode } from "react";

type DownloadLinkProps = {
  children: ReactNode;
  className?: string;
  file: string;
  platform: "mac" | "windows";
};

export function DownloadLink({ children, className, file, platform }: DownloadLinkProps) {
  return (
    <a
      className={className}
      href={file}
      download
      onClick={() => window.open(`/install?platform=${platform}`, "_blank", "noopener,noreferrer")}
    >
      {children}
    </a>
  );
}
