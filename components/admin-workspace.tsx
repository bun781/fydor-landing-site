"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/website-api";

type User = { id: string; email: string; verified_at: string | null; user_roles?: Array<{ roles?: { name?: string } }> };
type Pack = { submission_id: string; title: string; target_language: string; base_language: string; published_at: string; archived_at: string | null };

export function AdminWorkspace() {
  const [users, setUsers] = useState<User[]>([]); const [packs, setPacks] = useState<Pack[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState("");
  async function loadUsers() { try { const data = await api<{ users: User[] }>(`/api/admin?action=users&q=${encodeURIComponent(query)}`); setUsers(data.users); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to load users."); } }
  async function loadPacks() { try { const data = await api<{ packs: Pack[] }>("/api/admin?action=packs"); setPacks(data.packs.filter((pack) => !pack.archived_at)); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to load packs."); } }
  useEffect(() => { void Promise.all([loadUsers(), loadPacks()]); }, []);
  return <div className="stack"><section className="workspace-card"><span className="eyebrow">Administration</span><h1>Users, moderators, and public packs</h1><form className="workspace-actions" onSubmit={(event) => { event.preventDefault(); void loadUsers(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" /><button className="button secondary">Search</button></form>{status && <p role="status">{status}</p>}<div className="card-list">{users.map((user) => <article className="sentence-review" key={user.id}><strong>{user.email}</strong><p>{user.verified_at ? "Verified" : "Not verified"} · {user.user_roles?.map((role) => role.roles?.name).filter(Boolean).join(", ") || "user"}</p></article>)}</div></section><section className="workspace-card"><div className="workspace-header"><h2>Published packs</h2><button className="button secondary" onClick={() => void loadPacks()}>Refresh</button></div><div className="card-list">{packs.map((pack) => <article className="sentence-review" key={pack.submission_id}><strong>{pack.title}</strong><p>{pack.target_language} → {pack.base_language} · {new Date(pack.published_at).toLocaleString()}</p></article>)}</div></section></div>;
}
