"use client";

import type { Submission } from "@/lib/contributor-pack";

export type SubmissionDetail = Submission;
export type SubmissionVersion = { version: number; content_hash: string; submitted_at: string; generation_source: string; prompt_template_version?: string | null };
export type Feedback = { id: string; submission_version: number; sentence_index: number | null; category: string; body: string; resolution_state: string; created_at: string };

export function SubmissionStatus({ submission, versions, feedback, onBack }: { submission: SubmissionDetail; versions: SubmissionVersion[]; feedback: Feedback[]; onBack: () => void }) {
  const canRevise = ["changes_requested", "withdrawn"].includes(submission.state);
  return <div className="stack">
    <section className="workspace-card compact-card"><button className="text-button" onClick={onBack}>← My packs</button><div className="workspace-header"><div><span className="eyebrow">Moderation status</span><h1>{submission.title}</h1><p>{submission.target_language} → {submission.base_language} · Submission version {submission.current_version}</p></div><span className={`submission-state state-${submission.state}`}>{submission.state.replaceAll("_", " ")}</span></div>
      <div className="status-timeline"><StatusStep label="Submitted" active /><StatusStep label="Language review" active={["language_approved", "approved", "published"].includes(submission.state)} /><StatusStep label="Approved" active={["approved", "published"].includes(submission.state)} /><StatusStep label="Published" active={submission.state === "published"} /></div>
      {canRevise ? <div className="callout"><div><strong>A revised submission is available.</strong><p>Return to your local drafts, address feedback, and submit a new final pack.</p></div><button className="button" onClick={onBack}>My local drafts</button></div> : null}
    </section>
    <section className="workspace-card compact-card"><div><span className="eyebrow">Reviewer notes</span><h2>Moderator feedback</h2></div>{feedback.length ? <div className="feedback-list">{feedback.map((item) => <article key={item.id}><div><span className="pill">{item.category.replaceAll("_", " ")}</span><span>Version {item.submission_version}{item.sentence_index === null ? " · Pack-level" : ` · Sentence ${item.sentence_index + 1}`}</span></div><p>{item.body}</p><small>{item.resolution_state} · {new Date(item.created_at).toLocaleString()}</small></article>)}</div> : <div className="empty-inline">No moderator feedback has been added.</div>}</section>
    <section className="workspace-card compact-card"><div><span className="eyebrow">Immutable history</span><h2>Submission revisions</h2></div><div className="version-list">{versions.map((version) => <article key={version.version}><strong>Version {version.version}</strong><span>Submitted {new Date(version.submitted_at).toLocaleString()}</span><code>{version.content_hash.slice(0, 16)}…</code></article>)}</div></section>
  </div>;
}

function StatusStep({ label, active = false }: { label: string; active?: boolean }) { return <div className={active ? "active" : ""}><span>✓</span><strong>{label}</strong></div>; }
