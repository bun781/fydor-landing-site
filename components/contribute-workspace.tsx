"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContributorDashboard } from "@/components/contributor/dashboard";
import { PackEditor } from "@/components/contributor/pack-editor";
import { PackPreview } from "@/components/contributor/pack-preview";
import { SentenceReview } from "@/components/contributor/sentence-review";
import { SubmissionStatus, type Feedback, type SubmissionDetail, type SubmissionVersion } from "@/components/contributor/submission-status";
import {
  createBlankPack, resetChangedReviews, reviewStatus, validatePackClient,
  type Draft, type DraftSummary, type Pack, type ReviewStatus, type Submission
} from "@/lib/contributor-pack";
import { createClient } from "@/lib/supabase/browser";
import { api, WebsiteApiError } from "@/lib/website-api";

type View = "dashboard" | "editor" | "review" | "preview" | "submission";

export function ContributeWorkspace() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [reviews, setReviews] = useState<Map<number, ReviewStatus>>(new Map());
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
  const [versions, setVersions] = useState<SubmissionVersion[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
  const issues = useMemo(() => pack ? validatePackClient(pack) : [], [pack]);

  const loadDashboard = useCallback(async () => {
    setBusy(true);
    try {
      const [draftResult, submissionResult] = await Promise.all([
        api<{ drafts: DraftSummary[] }>("/api/contributor?action=drafts"),
        api<{ submissions: Submission[] }>("/api/contributor?action=submissions")
      ]);
      setDrafts(draftResult.drafts); setSubmissions(submissionResult.submissions); setMessage("");
    } catch (error) { setMessage(errorMessage(error, "Unable to load your packs.")); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    void createClient().auth.getUser().then(({ data, error }) => {
      if (error) { setSessionMessage("We could not verify your session. Please sign in again."); setSignedIn(false); return; }
      setSignedIn(Boolean(data.user));
      if (data.user) void loadDashboard();
    }).catch(() => { setSessionMessage("Account services are unavailable right now. Please try again later."); setSignedIn(false); });
  }, [loadDashboard]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changePack(next: Pack) {
    if (pack) setReviews((current) => resetChangedReviews(pack, next, current));
    setPack(next); setDirty(true); setServerIssues([]);
  }
  function startCreate() { setDraft(null); setPack(createBlankPack()); setReviews(new Map()); setDirty(true); setView("editor"); setMessage(""); }
  async function importPack(text: string) {
    setBusy(true);
    try {
      const result = await api<{ pack: Pack }>("/api/contributor", { method: "POST", body: { action: "validate_pack", pack: text } });
      setDraft(null); setPack(result.pack); setReviews(new Map()); setDirty(true); setView("editor"); setMessage("Pack imported. Save it as your draft when ready.");
    } catch (error) { captureError(error, "Unable to import that pack."); }
    finally { setBusy(false); }
  }
  async function openDraft(id: string, nextView: View = "editor") {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setBusy(true);
    try {
      const result = await api<{ draft: Draft }>(`/api/contributor?action=draft&id=${encodeURIComponent(id)}`);
      setDraft(result.draft); setPack(result.draft.canonical_json);
      setReviews(new Map((result.draft.sentence_review_progress ?? []).map((row) => [row.sentence_index, reviewStatus(row)])));
      setDirty(false); setServerIssues([]); setView(nextView); setMessage("");
    } catch (error) { captureError(error, "Unable to open this draft."); }
    finally { setBusy(false); }
  }
  async function saveDraft(startReview = false): Promise<Draft | null> {
    if (!pack) return null;
    setBusy(true);
    try {
      const result = await api<{ draft: Draft }>("/api/contributor", { method: "POST", body: {
        action: "save_draft", pack, state: startReview ? "reviewing" : draft?.state === "changes_requested" ? "changes_requested" : "draft",
        generationSource: "manual", creationMethod: draft ? "manual" : "upload",
        ...(draft ? { draftId: draft.id, expectedRevision: draft.revision } : {})
      } });
      setDraft(result.draft); setPack(result.draft.canonical_json);
      setReviews(new Map((result.draft.sentence_review_progress ?? []).map((row) => [row.sentence_index, reviewStatus(row)])));
      setDirty(false); setServerIssues([]); setMessage(startReview ? "Draft saved. Review the latest sentence revisions." : "Draft saved.");
      void loadDashboard();
      return result.draft;
    } catch (error) { captureError(error, "Unable to save this draft."); return null; }
    finally { setBusy(false); }
  }
  async function startReview() { const saved = await saveDraft(true); if (saved) setView("review"); }
  async function markReview(index: number, status: Exclude<ReviewStatus, "unreviewed">) {
    if (!draft) return;
    try {
      await api("/api/contributor", { method: "POST", body: { action: "review_sentence", draftId: draft.id, sentenceIndex: index, status } });
      setReviews((current) => new Map(current).set(index, status)); setMessage(status === "approved" ? "Sentence approved." : "Sentence marked as needing changes.");
    } catch (error) { captureError(error, "Unable to update sentence review."); }
  }
  async function submit() {
    if (!draft || issues.length || [...reviews.values()].filter((item) => item === "approved").length !== (pack?.lessons.reduce((total, lesson) => total + lesson.sentences.length, 0) ?? 0)) return;
    setBusy(true);
    try {
      await api("/api/contributor", { method: "POST", idempotencyKey: `submit:${crypto.randomUUID()}`, body: { action: "submit", draftId: draft.id, expectedRevision: draft.revision, confirmed: true } });
      setDirty(false); setMessage("Submitted for moderation. The submitted revision is now immutable."); setView("dashboard"); await loadDashboard();
    } catch (error) { captureError(error, "Unable to submit this pack."); }
    finally { setBusy(false); }
  }
  async function duplicateDraft(id: string) {
    setBusy(true);
    try { const result = await api<{ draft: Draft }>("/api/contributor", { method: "POST", body: { action: "duplicate_draft", draftId: id } }); await loadDashboard(); await openDraft(result.draft.id); setMessage("Draft duplicated."); }
    catch (error) { captureError(error, "Unable to duplicate this draft."); }
    finally { setBusy(false); }
  }
  async function deleteDraft(id: string) {
    if (!window.confirm("Delete this draft permanently?")) return;
    setBusy(true);
    try { await api("/api/contributor", { method: "POST", body: { action: "delete_draft", draftId: id } }); await loadDashboard(); setMessage("Draft deleted."); }
    catch (error) { captureError(error, "Unable to delete this draft."); }
    finally { setBusy(false); }
  }
  async function openSubmission(id: string) {
    setBusy(true);
    try {
      const result = await api<{ submission: SubmissionDetail; versions: SubmissionVersion[]; feedback: Feedback[] }>(`/api/contributor?action=submission&id=${encodeURIComponent(id)}`);
      setSelectedSubmission(result.submission); setVersions(result.versions); setFeedback(result.feedback); setView("submission"); setMessage("");
    } catch (error) { captureError(error, "Unable to load submission status."); }
    finally { setBusy(false); }
  }
  function backToDashboard() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setDirty(false); setView("dashboard"); void loadDashboard();
  }
  function captureError(error: unknown, fallback: string) {
    setMessage(errorMessage(error, fallback));
    if (error instanceof WebsiteApiError) setServerIssues(error.issues);
  }

  if (signedIn === null) return <section className="workspace-card"><h1>Contribute a lesson pack</h1><p role="status">Checking your session…</p></section>;
  if (!signedIn) return <section className="workspace-card"><h1>Contribute a lesson pack</h1><p>{sessionMessage || "Sign in to create drafts, review sentences, and submit packs for moderation."}</p><div className="workspace-actions"><Link className="button" href="/login">Sign in</Link><Link className="button secondary" href="/signup">Create account</Link></div></section>;
  return <>
    {message ? <div className="workspace-message" role="status">{message}</div> : null}
    {serverIssues.length ? <div className="workspace-errors" role="alert"><strong>Fix these issues</strong><ul>{serverIssues.slice(0, 12).map((issue) => <li key={`${issue.path}:${issue.message}`}><code>{issue.path}</code> {issue.message}</li>)}</ul></div> : null}
    {view === "dashboard" ? <ContributorDashboard drafts={drafts} submissions={submissions} loading={busy} onCreate={startCreate} onImport={(text) => void importPack(text)} onOpen={(id) => void openDraft(id)} onDuplicate={(id) => void duplicateDraft(id)} onDelete={(id) => void deleteDraft(id)} onSubmission={(id) => void openSubmission(id)} onRefresh={() => void loadDashboard()} /> : null}
    {view === "editor" && pack ? <PackEditor pack={pack} issues={issues} saving={busy} onChange={changePack} onSave={() => void saveDraft()} onReview={() => void startReview()} onPreview={() => setView("preview")} onBack={backToDashboard} /> : null}
    {view === "review" && pack ? <SentenceReview pack={pack} reviews={reviews} issues={issues} saving={busy} onReview={markReview} onEdit={() => setView("editor")} onSubmit={() => void submit()} onBack={() => setView("editor")} /> : null}
    {view === "preview" && pack ? <PackPreview pack={pack} onBack={() => setView("editor")} /> : null}
    {view === "submission" && selectedSubmission ? <SubmissionStatus submission={selectedSubmission} versions={versions} feedback={feedback} onRevise={(id) => void openDraft(id)} onBack={backToDashboard} /> : null}
  </>;
}

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
