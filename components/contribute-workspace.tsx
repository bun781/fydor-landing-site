"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { api } from "@/lib/website-api";

type Pack = { title: string; lessons?: Array<{ sentences?: Array<{ text: string; translation: string }> }> };
type Draft = { id: string; revision: number; title: string; canonical_json: Pack };
const sentenceList = (pack: Pack | null) => pack?.lessons?.flatMap((lesson) => lesson.sentences ?? []) ?? [];

export function ContributeWorkspace() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null); const [sessionMessage, setSessionMessage] = useState(""); const [json, setJson] = useState(""); const [pack, setPack] = useState<Pack | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [reviewed, setReviewed] = useState<Set<number>>(new Set()); const [index, setIndex] = useState(0); const [status, setStatus] = useState(""); const [prompt, setPrompt] = useState("");
  const sentences = useMemo(() => sentenceList(pack), [pack]);
  useEffect(() => {
    void createClient().auth.getUser().then(({ data, error }) => {
      if (error) {
        console.warn("[AUTH-SESSION] protected route session check failed", {
          errorCode: error.code,
          errorMessage: error.message
        });
        setSessionMessage("We could not verify your session. Please sign in again.");
        setSignedIn(false);
        return;
      }
      console.info("[AUTH-SESSION] protected route recognized session", {
        userIdExists: Boolean(data.user?.id)
      });
      setSignedIn(Boolean(data.user));
    }).catch((error: unknown) => {
      console.error("[AUTH-SESSION] protected route session request failed", {
        message: error instanceof Error ? error.message : String(error)
      });
      setSessionMessage("Account services are unavailable right now. Please try again later.");
      setSignedIn(false);
    });
  }, []);
  async function validate() { try { const result = await api<{ pack: Pack; sentenceCount: number }>("/api/contributor", { method: "POST", body: { action: "validate", pack: json } }); setPack(result.pack); setJson(JSON.stringify(result.pack, null, 2)); setStatus(`Valid pack: ${result.sentenceCount} sentences.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Validation failed."); } }
  async function save() { if (!pack) return void setStatus("Validate a pack first."); try { const result = await api<{ draft: Draft }>("/api/contributor", { method: "POST", body: { action: "save_draft", pack, state: "reviewing", generationSource: "manual", creationMethod: "ai", ...(draft ? { draftId: draft.id, expectedRevision: draft.revision } : {}) } }); setDraft(result.draft); setReviewed(new Set()); setIndex(0); setStatus("Draft saved. Review each sentence before submission."); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save draft."); } }
  async function mark() { if (!draft) return; try { await api("/api/contributor", { method: "POST", body: { action: "review_sentence", draftId: draft.id, sentenceIndex: index, status: "reviewed" } }); setReviewed((current) => new Set(current).add(index)); setIndex((current) => Math.min(current + 1, Math.max(sentences.length - 1, 0))); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save review."); } }
  async function submit() { if (!draft || reviewed.size !== sentences.length) return void setStatus("Review every sentence first."); try { await api("/api/contributor", { method: "POST", idempotencyKey: `submit:${crypto.randomUUID()}`, body: { action: "submit", draftId: draft.id, expectedRevision: draft.revision, confirmed: true } }); setStatus("Submitted for moderation."); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to submit."); } }
  async function buildPrompt() { try { const result = await api<{ prompt: string }>("/api/contributor", { method: "POST", body: { action: "prompt", input: { targetLanguage: "ko", baseLanguage: "en", level: "beginner", topic: "Everyday introductions", sentenceCount: "10", schemaVersion: "1" } } }); setPrompt(result.prompt); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to build prompt."); } }
  if (signedIn === null) return <section className="workspace-card"><h1>Contribute a lesson pack</h1><p role="status">Checking your session…</p></section>;
  if (!signedIn) return <section className="workspace-card"><h1>Contribute a lesson pack</h1><p>{sessionMessage || "Sign in to save drafts, review sentences, and submit a pack for moderation."}</p><Link className="button" href="/login">Sign in</Link> <Link className="button secondary" href="/signup">Create account</Link></section>;
  const sentence = sentences[index];
  return <div className="stack"><section className="workspace-card"><span className="eyebrow">Contributor workspace</span><h1>Make a pack worth studying.</h1><p>Validate a Fydor pack, review every sentence, then submit an immutable version for moderation.</p><button className="button secondary" onClick={() => void buildPrompt()}>Generate starter prompt</button>{prompt && <textarea readOnly value={prompt} rows={8} />}</section><section className="workspace-card"><h2>Import and validate</h2><textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder="Paste a Fydor pack JSON object" rows={14} /><div className="workspace-actions"><button className="button secondary" onClick={() => void validate()}>Validate pack</button><button className="button" disabled={!pack} onClick={() => void save()}>Save draft</button></div></section>{draft && <section className="workspace-card"><h2>Sentence review</h2><p>{reviewed.size}/{sentences.length} reviewed</p>{sentence ? <article className="sentence-review"><strong>Sentence {index + 1}</strong><p>{sentence.text}</p><p>{sentence.translation}</p><div className="workspace-actions"><button className="button secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button><button className="button" onClick={() => void mark()}>Mark reviewed</button><button className="button secondary" disabled={index >= sentences.length - 1} onClick={() => setIndex(index + 1)}>Next</button></div></article> : <p>No sentences found.</p>}<button className="button" disabled={reviewed.size !== sentences.length} onClick={() => void submit()}>Submit for moderation</button></section>}{status && <p role="status">{status}</p>}</div>;
}
