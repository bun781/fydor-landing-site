import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-user";

export default async function AdminPage() {
  await requireAdmin();
  redirect("/admin.html");
}
