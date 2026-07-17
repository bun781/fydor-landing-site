import { notFound } from "next/navigation";
import { AdminWorkspace } from "@/components/admin-workspace";

const sections = new Set(["moderation", "published", "rejected", "archived", "applications", "contributors", "users", "history", "packs"]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <main><AdminWorkspace section={section} /></main>;
}
