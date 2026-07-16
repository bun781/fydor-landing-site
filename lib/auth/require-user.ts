import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function getCurrentRoles(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("expires_at,suspended_at,roles!inner(name)")
    .eq("user_id", userId)
    .is("suspended_at", null);
  if (error) throw new Error("Unable to resolve server authorization.");
  const now = Date.now();
  return (data ?? []).filter((row) => !row.expires_at || Date.parse(row.expires_at) > now)
    .flatMap((row) => Array.isArray(row.roles) ? row.roles : [row.roles])
    .map((role) => role?.name)
    .filter((name): name is string => typeof name === "string");
}

export async function requireAdmin() {
  const user = await requireUser();
  const roles = await getCurrentRoles(user.id);
  if (!roles.includes("admin") && !roles.includes("super_admin")) redirect("/forbidden");
  return { user, roles };
}
