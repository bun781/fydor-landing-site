"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { api } from "@/lib/website-api";

type Submission = { id: string; title: string; target_language: string; base_language: string; state: string; current_version: number; row_version: number };

export function ModerationWorkspace() {
  const [signedIn, setSignedIn] = useState(false); const [items, setItems] = useState<Submission[]>([]); const [status, setStatus] = useState("");
  async function load() { try { const result = await api<{ submissions: Submission[] }>("/api/moderation?action=queue&status=submitted"); setItems(result.submissions); setStatus(""); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to load moderation queue."); } }
  useEffect(() => { void createClient().auth.getUser().then(({ data }) => { setSignedIn(Boolean(data.user)); if (data.user) void load(); }); }, []);
  async function claim(item: Submission) { try { await api("/api/moderation", { method: "POST", body: { action: "claim", submissionId: item.id, version: item.current_version } }); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to claim submission."); } }
  if (!signedIn) return <section className="workspace-card"><h1>Moderator dashboard</h1><p>Sign in with a moderator account to review assigned languages.</p><Link className="button" href="/login">Sign in</Link></section>;
  return <section className="workspace-card"><div className="workspace-header"><div><span className="eyebrow">Language review</span><h1>Moderator dashboard</h1><p>Review immutable lesson versions for your assigned languages.</p></div><button className="button secondary" onClick={() => void load()}>Refresh</button></div>{status && <p role="status">{status}</p>}<div className="card-list">{items.map((item) => <article className="sentence-review" key={item.id}><h2>{item.title}</h2><p>{item.target_language} → {item.base_language} · {item.state}</p><button className="button" onClick={() => void claim(item)}>Claim review</button></article>)}{!items.length && !status && <p>No submissions are waiting for review.</p>}</div></section>;
}
