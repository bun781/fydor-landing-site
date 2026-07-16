import type { Metadata } from "next";
import "./site.css";

export const metadata: Metadata = { title: "Fydor", description: "Local-first language learning." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
