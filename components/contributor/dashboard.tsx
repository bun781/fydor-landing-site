"use client";

import type { ChangeEvent } from "react";
import type { DraftSummary, Submission } from "@/lib/contributor-pack";

type Props = {
  drafts: DraftSummary[];
  submissions: Submission[];
  loading: boolean;
  onCreate: () => void;
  onGenerate: () => void;
  onImport: (text: string) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmission: (id: string) => void;
  onRefresh: () => void;
};

export function ContributorDashboard({ drafts, submissions, loading, onCreate, onGenerate, onImport, onOpen, onDuplicate, onDelete, onSubmission, onRefresh }: Props) {
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file) onImport(await file.text());
  }
  const changes = submissions.filter((item) => item.state === "changes_requested");
  const active = submissions.filter((item) => ["submitted", "language_approved", "approved"].includes(item.state));
  const published = submissions.filter((item) => item.state === "published");
  const closed = submissions.filter((item) => ["rejected", "withdrawn", "archived"].includes(item.state));
  return <div className="stack">
    <section className="workspace-card contributor-hero"><div><span className="eyebrow">Contributor workspace</span><h1>Build packs people want to study.</h1><p>Create from scratch, generate lesson JSON with an LLM, or import a supported Fydor JSON pack. Imported and saved drafts stay in this browser; only a final submission is sent for moderation.</p></div><div className="workspace-actions"><button className="button" onClick={onCreate}>Write your own</button><button className="button secondary" onClick={onGenerate}>Generate with an LLM</button><label className="button secondary file-button">Import Fydor JSON<input type="file" accept=".json,.fydorpack,application/json" onChange={(event) => void importFile(event)} /></label><button className="button secondary" disabled={loading} onClick={onRefresh}>Refresh</button></div></section>
    <DashboardSection title="Drafts" subtitle="Saved work you can resume, duplicate, review, or delete before first submission." empty="No drafts yet. Create a pack to begin." emptyState={!drafts.length}>
      {drafts.map((draft) => <article className="pack-row" key={draft.id}><div><span className={`review-status status-${draft.state}`}>{draft.state.replaceAll("_", " ")}</span><h3>{draft.title || "Untitled pack"}</h3><p>{draft.target_language} → {draft.base_language} · {draft.level || "No level"} · Revision {draft.revision}</p><small>Updated {date(draft.updated_at)}</small></div><div className="workspace-actions"><button className="button" onClick={() => onOpen(draft.id)}>Resume</button><button className="button secondary" onClick={() => onDuplicate(draft.id)}>Duplicate</button><button className="button secondary danger-text" onClick={() => onDelete(draft.id)}>Delete</button></div></article>)}
    </DashboardSection>
    {changes.length ? <DashboardSection title="Changes requested" subtitle="Moderator feedback is ready. Revise the editable draft, review it again, and resubmit." empty="" emptyState={false}><SubmissionRows items={changes} onOpen={onSubmission} /></DashboardSection> : null}
    <DashboardSection title="Submitted packs" subtitle="Immutable revisions currently moving through moderation." empty="No packs are awaiting moderation." emptyState={!active.length}><SubmissionRows items={active} onOpen={onSubmission} /></DashboardSection>
    <DashboardSection title="Published packs" subtitle="Approved packs available to learners." empty="No published packs yet." emptyState={!published.length}><SubmissionRows items={published} onOpen={onSubmission} /></DashboardSection>
    <DashboardSection title="Rejected or archived" subtitle="Closed submissions and publication history." empty="No closed submissions." emptyState={!closed.length}><SubmissionRows items={closed} onOpen={onSubmission} /></DashboardSection>
  </div>;
}

function DashboardSection({ title, subtitle, empty, emptyState, children }: { title: string; subtitle: string; empty: string; emptyState: boolean; children: React.ReactNode }) {
  return <section className="workspace-card compact-card"><div><span className="eyebrow">My packs</span><h2>{title}</h2><p>{subtitle}</p></div><div className="pack-list">{emptyState ? <div className="empty-inline">{empty}</div> : children}</div></section>;
}

function SubmissionRows({ items, onOpen }: { items: Submission[]; onOpen: (id: string) => void }) {
  return <>{items.map((item) => <article className="pack-row" key={item.id}><div><span className={`review-status status-${item.state}`}>{item.state.replaceAll("_", " ")}</span><h3>{item.title}</h3><p>{item.target_language} → {item.base_language} · Submission v{item.current_version}</p><small>Updated {date(item.updated_at)}</small></div><button className="button secondary" onClick={() => onOpen(item.id)}>View status</button></article>)}</>;
}

function date(value?: string) { return value ? new Date(value).toLocaleString() : "just now"; }
