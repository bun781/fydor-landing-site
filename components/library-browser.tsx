"use client";

import { useEffect, useState } from "react";
import { publicApi } from "@/lib/website-api";

type Pack = { id: string; title: string; description: string; targetLanguage: string; baseLanguage: string; level: string; sentenceCount: number; lessonVersion: string; license: string; compatibility: string };
type Result = { lessons: Pack[]; hasMore: boolean };

export function LibraryBrowser() {
  const [query, setQuery] = useState(""); const [packs, setPacks] = useState<Pack[]>([]); const [page, setPage] = useState(1); const [more, setMore] = useState(false); const [message, setMessage] = useState("");
  async function load(nextPage = 1) { setMessage("Loading published packs…"); try { const data = await publicApi<Result>(`/api/library?page=${nextPage}&pageSize=50&q=${encodeURIComponent(query)}`); setPacks(nextPage === 1 ? data.lessons : (current) => [...current, ...data.lessons]); setPage(nextPage); setMore(data.hasMore); setMessage(data.lessons.length ? "" : "No published packs match this search."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load the library."); } }
  useEffect(() => { void load(); }, []);
  return <section className="workspace-card"><div className="workspace-header"><div><span className="eyebrow">Verified community content</span><h1>Find something to study.</h1><p>Browse immutable lesson packs checked by the moderation team.</p></div></div><form className="workspace-actions" onSubmit={(event) => { event.preventDefault(); void load(1); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons" aria-label="Search lessons" /><button className="button">Search</button></form>{message && <p role="status">{message}</p>}<div className="card-list">{packs.map((pack) => <article className="sentence-review" key={pack.id}><h2>{pack.title}</h2><p>{pack.description}</p><p>{pack.targetLanguage} → {pack.baseLanguage} · {pack.level} · {pack.sentenceCount} sentences · version {pack.lessonVersion}</p><p>{pack.license} · {pack.compatibility}</p><a className="button secondary" href={`/api/library?id=${encodeURIComponent(pack.id)}&download=1`}>Download verified Fydor pack</a></article>)}</div>{more && <button className="button secondary" onClick={() => void load(page + 1)}>Load more</button>}</section>;
}
