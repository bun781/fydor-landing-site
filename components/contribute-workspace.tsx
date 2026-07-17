"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContributorDashboard } from "@/components/contributor/dashboard";
import { LlmGenerator, type GenerationSource } from "@/components/contributor/llm-generator";
import { PackEditor } from "@/components/contributor/pack-editor";
import { PackPreview } from "@/components/contributor/pack-preview";
import { SentenceReview } from "@/components/contributor/sentence-review";
import { ContributorApplicationGate, ProbationGuide, type ContributorApplication } from "@/components/contributor/contributor-application";
import { SubmissionStatus, type Feedback, type SubmissionDetail, type SubmissionVersion } from "@/components/contributor/submission-status";
import {
  createBlankPack, parsePackClient, resetChangedReviews, reviewStatus, validatePackClient,
  type Draft, type DraftSummary, type Pack, type ReviewStatus, type Submission
} from "@/lib/contributor-pack";
import { createClient } from "@/lib/supabase/browser";
import { api, WebsiteApiError } from "@/lib/website-api";
import { deleteLocalDraft, duplicateLocalDraft, getLocalDraft, listLocalDrafts, saveLocalDraft } from "@/lib/local-contributor-drafts";

type View = "dashboard" | "editor" | "review" | "preview" | "submission" | "llm";

export function ContributeWorkspace() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [application, setApplication] = useState<ContributorApplication | null>(null);
  const [isContributor, setIsContributor] = useState(false);
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
  const [generationSource, setGenerationSource] = useState<GenerationSource>("manual");
  const [creationMethod, setCreationMethod] = useState<"manual" | "upload" | "ai">("manual");
  const issues = useMemo(() => pack ? validatePackClient(pack) : [], [pack]);

  const loadDashboard = useCallback(async () => {
    setBusy(true);
    try {
      const [submissionResult, applicationResult, meResult] = await Promise.all([
        api<{ submissions: Submission[] }>("/api/contributor?action=submissions"),
        api<{ application: ContributorApplication | null }>("/api/contributor?action=application"),
        api<{ actor: { roles: string[] } }>("/api/contributor?action=me")
      ]);
      setDrafts(listLocalDrafts()); setSubmissions(submissionResult.submissions); setMessage("");
      setApplication(applicationResult.application); setIsContributor(meResult.actor.roles.includes("contributor"));
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
  function startCreate() { setGenerationSource("manual"); setCreationMethod("manual"); setDraft(null); setPack(createBlankPack()); setReviews(new Map()); setDirty(true); setView("editor"); setMessage(""); }
  async function importPack(text: string, source: GenerationSource = "manual") {
    setBusy(true);
    try {
      const result = parsePackClient(text);
      if ("issues" in result) throw new Error(result.issues[0]?.message ?? "Unable to read that pack.");
      setGenerationSource(source); setCreationMethod(source === "manual" ? "upload" : "ai"); setDraft(null); setPack(result.pack); setReviews(new Map()); setDirty(true); setView("editor"); setMessage("Pack loaded locally. Save it as a draft, then use Review & submit to send it for moderation.");
    } catch (error) { captureError(error, "Unable to import that pack."); }
    finally { setBusy(false); }
  }
  async function openDraft(id: string, nextView: View = "editor") {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setBusy(true);
    try {
      const result = getLocalDraft(id); if (!result) throw new Error("This local draft is no longer available.");
      setDraft(result); setPack(result.canonical_json);
      setReviews(new Map((result.sentence_review_progress ?? []).map((row) => [row.sentence_index, reviewStatus(row)])));
      setDirty(false); setServerIssues([]); setView(nextView); setMessage("");
    } catch (error) { captureError(error, "Unable to open this draft."); }
    finally { setBusy(false); }
  }
  async function saveDraft(startReview = false): Promise<Draft | null> {
    if (!pack) return null;
    try {
      const result = saveLocalDraft({ draft, pack, reviews, state: startReview ? "reviewing" : draft?.state === "changes_requested" ? "changes_requested" : "draft" });
      setDraft(result); setPack(result.canonical_json);
      setReviews(new Map((result.sentence_review_progress ?? []).map((row) => [row.sentence_index, reviewStatus(row)])));
      setDirty(false); setServerIssues([]); setMessage(startReview ? "Draft saved. Review the latest sentence revisions." : "Draft saved.");
      void loadDashboard();
      return result;
    } catch (error) { captureError(error, "Unable to save this draft."); return null; }
    finally { setBusy(false); }
  }
  async function startReview() { const saved = await saveDraft(true); if (saved) setView("review"); }
  async function markReview(index: number, status: Exclude<ReviewStatus, "unreviewed">) {
    if (!draft) return;
    try {
      const next = new Map(reviews).set(index, status);
      setReviews(next); saveLocalDraft({ draft, pack: draft.canonical_json, reviews: next, state: "reviewing" });
      setMessage(status === "approved" ? "Sentence approved." : "Sentence marked as needing changes.");
    } catch (error) { captureError(error, "Unable to update sentence review."); }
  }
  async function submit(approvedReviews = reviews) {
    if (!draft || !pack || issues.length || [...approvedReviews.values()].filter((item) => item === "approved").length !== pack.lessons.reduce((total, lesson) => total + lesson.sentences.length, 0)) return;
    setBusy(true);
    try {
      await api("/api/contributor", { method: "POST", idempotencyKey: `submit:${crypto.randomUUID()}`, body: { action: "submit_pack", pack, confirmed: true, generationSource, creationMethod } });
      setDirty(false); setMessage("Submitted for moderation. Your local working copy remains in this browser."); setView("dashboard"); await loadDashboard();
    } catch (error) { captureError(error, "Unable to submit this pack."); }
    finally { setBusy(false); }
  }
  async function markAllAndSubmit() {
    if (!pack || !draft || !window.confirm("Mark every sentence as reviewed and submit this pack for moderation?")) return;
    const next = new Map(flattenIndexes(pack).map((index) => [index, "approved" as ReviewStatus]));
    setReviews(next); saveLocalDraft({ draft, pack, reviews: next, state: "reviewing" });
    await submit(next);
  }
  async function applyForContributor(value: { targetLanguages: string[]; experience: string; samplePlan: string }) {
    setBusy(true);
    try {
      await api("/api/contributor", { method: "POST", body: { action: "apply_for_contributor", ...value } });
      setMessage("Application sent. You can prepare packs locally while an administrator reviews it.");
      await loadDashboard();
    } catch (error) { captureError(error, "Unable to send your contributor application."); }
    finally { setBusy(false); }
  }
  async function duplicateDraft(id: string) {
    setBusy(true);
    try { const result = duplicateLocalDraft(id); if (!result) throw new Error("This local draft is no longer available."); await loadDashboard(); await openDraft(result.id); setMessage("Draft duplicated."); }
    catch (error) { captureError(error, "Unable to duplicate this draft."); }
    finally { setBusy(false); }
  }
  async function deleteDraft(id: string) {
    if (!window.confirm("Delete this draft permanently?")) return;
    setBusy(true);
    try { deleteLocalDraft(id); await loadDashboard(); setMessage("Draft deleted."); }
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
    {!isContributor ? <ContributorApplicationGate application={application} submitting={busy} onSubmit={applyForContributor} /> : <>
      <ProbationGuide until={application?.probation_until} />
      {view === "dashboard" ? <ContributorDashboard drafts={drafts} submissions={submissions} loading={busy} onCreate={startCreate} onGenerate={() => { setMessage(""); setView("llm"); }} onImport={(text) => void importPack(text, "manual")} onOpen={(id) => void openDraft(id)} onDuplicate={(id) => void duplicateDraft(id)} onDelete={(id) => void deleteDraft(id)} onSubmission={(id) => void openSubmission(id)} onRefresh={() => void loadDashboard()} /> : null}
    </>}
    {view === "llm" ? <LlmGenerator onBack={() => setView("dashboard")} onLoadJson={(text, source) => void importPack(text, source)} /> : null}
    {view === "editor" && pack ? <PackEditor pack={pack} issues={issues} saving={busy} onChange={changePack} onSave={() => void saveDraft()} onReview={() => void startReview()} onPreview={() => setView("preview")} onBack={backToDashboard} /> : null}
    {view === "review" && pack ? <SentenceReview pack={pack} reviews={reviews} issues={issues} saving={busy} onReview={markReview} onEdit={() => setView("editor")} onSubmit={() => void submit()} onMarkAllAndSubmit={() => void markAllAndSubmit()} onBack={() => setView("editor")} /> : null}
    {view === "preview" && pack ? <PackPreview pack={pack} onBack={() => setView("editor")} /> : null}
    {view === "submission" && selectedSubmission ? <SubmissionStatus submission={selectedSubmission} versions={versions} feedback={feedback} onBack={backToDashboard} /> : null}
  </>;
}

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function flattenIndexes(pack: Pack) { let index = 0; return pack.lessons.flatMap((lesson) => lesson.sentences.map(() => index++)); }
