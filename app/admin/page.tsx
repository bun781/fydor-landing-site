import { requireAdmin } from "@/lib/auth/require-user";
export default async function AdminPage() { const { user } = await requireAdmin(); return <main><h1>Administration</h1><p>Signed in as {user.email}. The protected administration workspace is being served at its compatibility URL.</p></main>; }
