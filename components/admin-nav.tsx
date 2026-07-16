import Link from "next/link";

const links = [
  ["Moderation queue", "/admin/moderation"],
  ["Published packs", "/admin/published"],
  ["Rejected", "/admin/rejected"],
  ["Archived", "/admin/archived"],
  ["Contributors", "/admin/contributors"],
  ["Users & roles", "/admin/users"],
  ["Moderation history", "/admin/history"],
  ["Pack management", "/admin/packs"]
] as const;

export function AdminNav() {
  return <nav className="admin-nav" aria-label="Administration">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>;
}
