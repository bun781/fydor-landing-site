"use client";

import { type ReactNode } from "react";

type DownloadLinkProps = {
  children: ReactNode;
  className?: string;
  file: string;
};

export function DownloadLink({ children, className, file }: DownloadLinkProps) {
  return <a className={className} href={file} download>{children}</a>;
}
