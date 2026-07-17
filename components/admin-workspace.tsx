"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/website-api";

type RoleRow = { version: number; suspended_at: string | null; expires_at: string | null; roles?: { name?: string } };
type User = { id: string; email: string; display_name: string | null; verified_at: string | null; publishing_suspended_at: string | null; protected_administrator: boolean; user_roles?: RoleRow[] };
type Submission = { id: string; title: string; target_language: string; base_language: string; state: string; current_version: number; created_at: string; lesson_count: number; sentence_count: number; level: string; possible_duplicate?: boolean; validation_warnings: Array<{ path: string; message: string }>; moderation_history_count: number; contributor?: { email: string; display_name: string | null } };
type Pack = { submission_id: string; title: string; target_language: string; base_language: string; level: string; published_at: string; archived_at: string | null; submissions?: { state: string; row_version: number } };
type AuditEvent = { id: string; event_type?: string; action?: string; actor?: { email: string }; target?: { email: string }; target_title?: string; previous_state?: string | null; next_state?: string | null; reason?: string | null; created_at: string; submission_version?: number | null };

export function AdminWorkspace({ section = "moderation" }: { section?: string }) {
  if (["moderation", "rejected", "archived"].includes(section)) return <Queue section={section} />;
  if (["users", "contributors"].includes(section)) return <Users contributorsOnly={section === "contributors"} />;
  if (["published", "packs"].includes(section)) return <Packs includeArchived={section === "packs"} />;
  return <History />;
}

function Queue({ section }: { section: string }) {
  const defaultStatus = section === "rejected" ? "rejected" : section === "archived" ? "archived" : "submitted,language_approved,approved";
  const [items, setItems] = useState<Submission[]>([]); const [status, setStatus] = useState(""); const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: defaultStatus, language: "", baseLanguage: "", level: "", contributor: "", submittedAfter: "", hasProblems: false, sort: "submitted", direction: "desc" });
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== false) query.set(key, String(value)); }); const data = await api<{ submissions: Submission[] }>(`/api/moderation?action=queue&${query}`); setItems(data.submissions); setStatus(""); } catch (error) { setStatus(message(error)); } finally { setLoading(false); } }, [filters]);
  useEffect(() => { void load(); }, [load]);
  return <section className="workspace-card admin-panel"><div className="workspace-header"><div><span className="eyebrow">Administration</span><h1>{section === "moderation" ? "Moderation queue" : section === "rejected" ? "Rejected submissions" : "Archived submissions"}</h1></div><button className="button secondary" onClick={() => void load()}>Refresh</button></div>
    <div className="admin-filters">
      <label>Status<input value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} placeholder="submitted,approved" /></label>
      <label>Target language<input value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value })} placeholder="vi" /></label>
      <label>Base language<input value={filters.baseLanguage} onChange={(event) => setFilters({ ...filters, baseLanguage: event.target.value })} placeholder="en" /></label>
      <label>Level<input value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })} /></label>
      <label>Contributor ID<input value={filters.contributor} onChange={(event) => setFilters({ ...filters, contributor: event.target.value })} /></label>
      <label>Submitted after<input type="date" value={filters.submittedAfter} onChange={(event) => setFilters({ ...filters, submittedAfter: event.target.value })} /></label>
      <label>Sort<select value={`${filters.sort}:${filters.direction}`} onChange={(event) => { const [sort, direction] = event.target.value.split(":"); setFilters({ ...filters, sort, direction }); }}><option value="submitted:desc">Newest</option><option value="submitted:asc">Oldest</option><option value="title:asc">Title</option><option value="status:asc">Status</option></select></label>
      <label className="checkbox"><input type="checkbox" checked={filters.hasProblems} onChange={(event) => setFilters({ ...filters, hasProblems: event.target.checked })} /> Validation problems</label>
    </div>
    {status && <p className="admin-alert" role="status">{status}</p>}{loading ? <p>Loading…</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pack</th><th>Contributor</th><th>Languages</th><th>Level</th><th>Content</th><th>Revision</th><th>Submitted</th><th>Status</th><th>Checks</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Link className="text-link" href={`/admin/submissions/${item.id}`}>{item.title}</Link></td><td>{item.contributor?.display_name || item.contributor?.email || "Unknown"}</td><td>{item.target_language} → {item.base_language}</td><td>{item.level || "—"}</td><td>{item.lesson_count} lessons · {item.sentence_count} sentences</td><td>v{item.current_version}</td><td>{formatDate(item.created_at)}</td><td><span className="pill">{label(item.state)}</span></td><td>{item.validation_warnings.length || item.possible_duplicate ? <span className="pill pill-warning">{item.validation_warnings.length + (item.possible_duplicate ? 1 : 0)} warning(s)</span> : "Clear"}<small>{item.moderation_history_count} history events</small></td></tr>)}</tbody></table>{!items.length && <p>No matching submissions.</p>}</div>}
  </section>;
}

function Users({ contributorsOnly }: { contributorsOnly: boolean }) {
  const [users, setUsers] = useState<User[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState("");
  const load = useCallback(async () => { try { const data = await api<{ users: User[] }>(`/api/admin?action=users&q=${encodeURIComponent(query)}`); setUsers(data.users); setStatus(""); } catch (error) { setStatus(message(error)); } }, [query]);
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => contributorsOnly ? users.filter((user) => activeRoles(user).includes("contributor")) : users, [users, contributorsOnly]);
  async function change(user: User, action: string, enabled: boolean) { const reason = window.prompt("Reason for this role or access change:"); if (!reason) return; if (!window.confirm(`Apply this change to ${user.email}?`)) return; try { const role = action === "set_moderator" ? user.user_roles?.find((item) => item.roles?.name === "moderator") : null; await api("/api/admin", { method: "POST", body: { action, userId: user.id, enabled, suspended: enabled, languages: action === "set_moderator" && enabled ? promptLanguages() : [], expectedVersion: role?.version || 0, reason } }); await load(); } catch (error) { setStatus(message(error)); } }
  return <section className="workspace-card admin-panel"><div className="workspace-header"><div><span className="eyebrow">Access control</span><h1>{contributorsOnly ? "Contributors" : "Users and roles"}</h1><p>Role mutations are verified and audited by database functions.</p></div></div><form className="workspace-actions" onSubmit={(event) => { event.preventDefault(); void load(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or display name" /><button className="button secondary">Search</button></form>{status && <p className="admin-alert" role="status">{status}</p>}<div className="card-list">{visible.map((user) => { const roles = activeRoles(user); const contributor = roles.includes("contributor"); const moderator = roles.includes("moderator"); const admin = roles.includes("admin"); return <article className="sentence-review" key={user.id}><div className="workspace-header"><div><strong>{user.display_name || user.email}</strong><p>{user.email} · {user.verified_at ? "verified" : "unverified"}</p></div>{user.protected_administrator && <span className="pill pill-accent">Protected administrator</span>}</div><p>{roles.join(", ") || "user"}{user.publishing_suspended_at ? " · publishing suspended" : ""}</p><div className="workspace-actions"><button className="button secondary" disabled={user.protected_administrator} onClick={() => void change(user, "set_contributor", !contributor)}>{contributor ? "Remove contributor" : "Grant contributor"}</button><button className="button secondary" disabled={user.protected_administrator} onClick={() => void change(user, "set_moderator", !moderator)}>{moderator ? "Remove moderator" : "Grant moderator"}</button><button className="button secondary" disabled={user.protected_administrator} onClick={() => void change(user, "suspend_publishing", !user.publishing_suspended_at)}>{user.publishing_suspended_at ? "Restore publishing" : "Suspend publishing"}</button><button className="button danger" disabled={user.protected_administrator} onClick={() => void change(user, "set_administrator", !admin)}>{admin ? "Remove admin" : "Grant admin"}</button></div></article>; })}</div></section>;
}

function Packs({ includeArchived }: { includeArchived: boolean }) {
  const [packs, setPacks] = useState<Pack[]>([]); const [status, setStatus] = useState("");
  const load = useCallback(async () => { try { const data = await api<{ packs: Pack[] }>("/api/admin?action=packs"); setPacks(includeArchived ? data.packs : data.packs.filter((pack) => !pack.archived_at)); setStatus(""); } catch (error) { setStatus(message(error)); } }, [includeArchived]);
  useEffect(() => { void load(); }, [load]);
  async function archive(pack: Pack) { const reason = window.prompt("Reason for archiving and removing this public pack:"); if (!reason || !window.confirm(`Remove “${pack.title}” from Fydor Exchange?`)) return; try { await api("/api/admin", { method: "POST", body: { action: "delete_pack", submissionId: pack.submission_id, reason } }); await load(); } catch (error) { setStatus(message(error)); } }
  const replacementDeletes = deletableReplacementPacks(packs);
  async function permanentlyDeleteReplacements() {
    if (!replacementDeletes.length) return;
    const reason = window.prompt("Reason for permanently deleting these legacy published packs:");
    if (!reason) return;
    const phrase = `DELETE ${replacementDeletes.length} PACKS`;
    if (window.prompt(`Type “${phrase}” to permanently delete the selected pack records and their public files:`) !== phrase) return;
    try {
      for (const pack of replacementDeletes) {
        await api("/api/admin", { method: "POST", body: { action: "hard_delete_pack", submissionId: pack.submission_id, expectedRowVersion: pack.submissions?.row_version, reason, actionId: `pack-hard-delete:${crypto.randomUUID()}` } });
      }
      await load(); setStatus(`Permanently deleted ${replacementDeletes.length} published pack record(s).`);
    } catch (error) { setStatus(message(error)); }
  }
  return <section className="workspace-card admin-panel"><div className="workspace-header"><div><span className="eyebrow">Platform library</span><h1>{includeArchived ? "Pack management" : "Published packs"}</h1><p>{replacementDeletes.length ? `${replacementDeletes.length} legacy publication(s) are queued for permanent replacement cleanup. The oldest Korean publication is protected.` : "No title-matched replacement cleanup is pending."}</p></div><div className="workspace-actions"><button className="button danger" disabled={!replacementDeletes.length} onClick={() => void permanentlyDeleteReplacements()}>Permanently delete replacement set</button><button className="button secondary" onClick={() => void load()}>Refresh</button></div></div>{status && <p className="admin-alert" role="status">{status}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pack</th><th>Languages</th><th>Level</th><th>Published</th><th>State</th><th /></tr></thead><tbody>{packs.map((pack) => <tr key={pack.submission_id}><td><Link className="text-link" href={`/admin/submissions/${pack.submission_id}`}>{pack.title}</Link>{isProtectedKorean(pack, packs) && <small>Oldest Korean publication — retained</small>}</td><td>{pack.target_language} → {pack.base_language}</td><td>{pack.level}</td><td>{formatDate(pack.published_at)}</td><td>{pack.archived_at ? "Archived" : pack.submissions?.state || "Published"}</td><td>{!pack.archived_at && <button className="button danger" onClick={() => void archive(pack)}>Archive</button>}</td></tr>)}</tbody></table></div></section>;
}

function History() {
  const [events, setEvents] = useState<AuditEvent[]>([]); const [permissions, setPermissions] = useState<AuditEvent[]>([]); const [status, setStatus] = useState("");
  useEffect(() => { void Promise.all([api<{ events: AuditEvent[] }>("/api/moderation?action=history").then((data) => setEvents(data.events)), api<{ events: AuditEvent[] }>("/api/admin?action=permissions").then((data) => setPermissions(data.events))]).catch((error) => setStatus(message(error))); }, []);
  return <div className="stack"><HistoryTable title="Moderation history" events={events} status={status} /><HistoryTable title="Role and access history" events={permissions} /></div>;
}

function HistoryTable({ title, events, status }: { title: string; events: AuditEvent[]; status?: string }) { return <section className="workspace-card admin-panel"><h1>{title}</h1>{status && <p className="admin-alert">{status}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Transition</th><th>Reason</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.created_at)}</td><td>{event.actor?.email || "System"}</td><td>{label(event.event_type || event.action || "event")}</td><td>{event.target_title || event.target?.email || "—"}</td><td>{event.previous_state || "—"} → {event.next_state || "—"}{event.submission_version ? ` · v${event.submission_version}` : ""}</td><td>{event.reason || "—"}</td></tr>)}</tbody></table></div></section>; }

function activeRoles(user: User) { const now=Date.now(); return (user.user_roles || []).filter((row) => !row.suspended_at && (!row.expires_at || Date.parse(row.expires_at) > now)).map((row) => row.roles?.name).filter((role): role is string => Boolean(role)); }
function promptLanguages() { return (window.prompt("Target language codes for this moderator, separated by commas:") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean); }
function formatDate(value: string) { return value ? new Date(value).toLocaleString() : "—"; }
function label(value: string) { return value.replaceAll("_", " "); }
function message(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }

const REPLACEMENT_TITLES = new Set([
  "German for Beginners: A0 to A2",
  "Korean Beginner Megapack: A0 to A2",
  "Spanish for Beginners: A0 to A2 Complete Course",
  "Humongous Mandarin: Daily Life, Work & School",
  "Humongous Vietnamese: Daily Life, Work & School"
]);
const KOREAN_TITLE = "Korean Beginner Megapack: A0 to A2";
function isProtectedKorean(pack: Pack, all: Pack[]) {
  if (pack.title !== KOREAN_TITLE || pack.archived_at) return false;
  return [...all].filter((candidate) => candidate.title === KOREAN_TITLE && !candidate.archived_at).sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at))[0]?.submission_id === pack.submission_id;
}
function deletableReplacementPacks(packs: Pack[]) {
  return packs.filter((pack) => !pack.archived_at && REPLACEMENT_TITLES.has(pack.title) && !isProtectedKorean(pack, packs));
}
