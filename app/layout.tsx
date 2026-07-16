import type { Metadata } from "next";
import { connection } from "next/server";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "Fydor — Local-first language learning", template: "%s — Fydor" },
  description: "Build, import, and review language lessons with sentence-first spaced repetition.",
  icons: { icon: "/assets/fydor-logo.png" }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><body>{children}</body></html>;
}
