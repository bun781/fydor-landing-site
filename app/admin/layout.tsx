import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { SiteNav } from "@/components/site-nav";
import { requireAdmin } from "@/lib/auth/require-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <><SiteNav /><AdminNav />{children}</>;
}
