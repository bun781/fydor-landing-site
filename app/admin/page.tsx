import { AdminWorkspace } from "@/components/admin-workspace";
import { SiteNav } from "@/components/site-nav";
import { requireAdmin } from "@/lib/auth/require-user";

export default async function AdminPage() {
  await requireAdmin();
  return <><SiteNav /><main><AdminWorkspace /></main></>;
}
