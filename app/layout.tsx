import type { Metadata } from "next";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "Fydor — Local-first language learning", template: "%s — Fydor" },
  description: "Build, import, and review language lessons with sentence-first spaced repetition.",
  icons: { icon: "/assets/fydor-logo.png" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
