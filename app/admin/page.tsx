import { AdminWorkspace } from "@/components/admin-workspace";
import { requireAdmin } from "@/lib/auth/require-user";

export default async function AdminPage() {
  await requireAdmin();
  return <main><AdminWorkspace section="moderation" /></main>;
}
