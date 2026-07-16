"use client";

import { useEffect, useMemo, useState } from "react";
import { flattenSentences, type Annotation, type Pack, type ReviewStatus, type ValidationIssue } from "@/lib/contributor-pack";

type Filter = "all" | ReviewStatus | "errors";
type Props = {
  pack: Pack;
  reviews: Map<number, ReviewStatus>;
  issues: ValidationIssue[];
  saving: boolean;
  onReview: (index: number, status: Exclude<ReviewStatus, "unreviewed">) => Promise<void>;
  onEdit: () => void;
  onSubmit: () => void;
  onMarkAllAndSubmit: () => void;
  onBack: () => void;
};

export function SentenceReview({ pack, reviews, issues, saving, onReview, onEdit, onSubmit, onMarkAllAndSubmit, onBack }: Props) {
  const sentences = useMemo(() => flattenSentences(pack), [pack]);
  const [filter, setFilter] = useState<Filter>("all");
  const [index, setIndex] = useState(0);
  const issueIndexes = useMemo(() => new Set(issues.filter((issue) => issue.sentenceIndex !== undefined).map((issue) => sentences.find((item) => item.lessonIndex === issue.lessonIndex && item.sentenceIndex === issue.sentenceIndex)?.globalIndex).filter((item): item is number => item !== undefined)), [issues, sentences]);
  const visible = sentences.filter((item) => filter === "all" || (filter === "errors" ? issueIndexes.has(item.globalIndex) : (reviews.get(item.globalIndex) ?? "unreviewed") === filter));
  const current = sentences[index] ?? null;
  const visiblePosition = visible.findIndex((item) => item.globalIndex === index);
  const approved = [...reviews.values()].filter((status) => status === "approved").length;
  const needsChanges = [...reviews.values()].filter((status) => status === "needs_changes").length;
  const unresolved = sentences.length - approved;
  const blockingErrors = issues.length;
  const lessonsReviewed = pack.lessons.filter((lesson, lessonIndex) => {
    const lessonSentences = sentences.filter((item) => item.lessonIndex === lessonIndex);
    return lessonSentences.length > 0 && lessonSentences.every((item) => reviews.get(item.globalIndex) === "approved");
  }).length;
  const ready = sentences.length > 0 && unresolved === 0 && blockingErrors === 0;

  function navigate(direction: -1 | 1) {
    if (!visible.length) return;
    const nextPosition = Math.max(0, Math.min(visible.length - 1, visiblePosition < 0 ? 0 : visiblePosition + direction));
    setIndex(visible[nextPosition].globalIndex);
  }
  function goUnresolved() { const next = sentences.find((item) => reviews.get(item.globalIndex) !== "approved"); if (next) { setFilter("all"); setIndex(next.globalIndex); } }
  useEffect(() => {
    if (visible.length && !visible.some((item) => item.globalIndex === index)) setIndex(visible[0].globalIndex);
  }, [filter, index, visible]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input, textarea, select")) return;
      if (event.key === "ArrowLeft") navigate(-1);
      if (event.key === "ArrowRight") navigate(1);
      if (event.key.toLowerCase() === "a" && current) void onReview(current.globalIndex, "approved");
      if (event.key.toLowerCase() === "n" && current) void onReview(current.globalIndex, "needs_changes");
      if (event.key.toLowerCase() === "e") onEdit();
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  return <div className="stack">
    <section className="workspace-card compact-card">
      <div className="workspace-header"><div><button className="text-button" onClick={onBack}>← Edit pack</button><span className="eyebrow">Contributor review</span><h1>Review every sentence.</h1><p>Approval resets whenever a reviewed sentence or its lesson context changes.</p></div><div className="workspace-actions"><button className="button secondary" disabled={saving || blockingErrors > 0} onClick={onMarkAllAndSubmit}>Mark all as reviewed</button><button className="button" disabled={!ready || saving} onClick={onSubmit}>{saving ? "Submitting…" : "Submit for moderation"}</button></div></div>
      <div className="review-summary" aria-label="Review summary">
        <Summary label="Total sentences" value={sentences.length} />
        <Summary label="Approved" value={approved} tone="good" />
        <Summary label="Unresolved" value={unresolved} tone={unresolved ? "warn" : "good"} />
        <Summary label="Validation errors" value={blockingErrors} tone={blockingErrors ? "bad" : "good"} />
        <Summary label="Lessons reviewed" value={`${lessonsReviewed}/${pack.lessons.length}`} />
      </div>
      <div className={`readiness ${ready ? "ready" : "blocked"}`}><strong>{ready ? "Ready to submit" : "Not ready to submit"}</strong><span>{ready ? "All sentences approved and validation passed." : `${unresolved} unresolved · ${blockingErrors} blocking errors`}</span></div>
      <div className="review-filters" aria-label="Sentence filters">{(["all", "unreviewed", "approved", "needs_changes", "errors"] as Filter[]).map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item.replaceAll("_", " ")}</button>)}<button onClick={goUnresolved}>Return to unresolved</button></div>
    </section>

    {!visible.length ? <section className="workspace-card empty-state"><h2>No sentences in this filter.</h2><button className="button secondary" onClick={() => setFilter("all")}>Show all sentences</button></section> : null}
    {current && visible.some((item) => item.globalIndex === current.globalIndex) ? <section className="workspace-card review-focus">
      <div className="workspace-header"><div><span className="eyebrow">{current.lesson.title || `Lesson ${current.lessonIndex + 1}`} · Sentence {current.sentenceIndex + 1}</span><h2>{current.sentence.text || "Empty sentence"}</h2><p className="review-translation">{current.sentence.translation || "No translation"}</p></div><span className={`review-status status-${reviews.get(current.globalIndex) ?? "unreviewed"}`}>{(reviews.get(current.globalIndex) ?? "unreviewed").replaceAll("_", " ")}</span></div>
      <div className="lesson-context"><strong>Lesson context</strong><span>{current.lesson.description || "No lesson description"}</span><small>{current.lesson.level || pack.level || "No level"} · {(current.lesson.tags ?? []).join(", ") || "No tags"}</small></div>
      <div className="review-annotations"><AnnotationList title="Vocabulary" items={current.sentence.words} primary="surface" /><AnnotationList title="Grammar" items={current.sentence.grammar} primary="pattern" /><AnnotationList title="Chunks" items={current.sentence.chunks} primary="surface" /></div>
      {issues.filter((issue) => issue.lessonIndex === current.lessonIndex && issue.sentenceIndex === current.sentenceIndex).length ? <div className="validation-panel"><strong>Blocking validation</strong><ul>{issues.filter((issue) => issue.lessonIndex === current.lessonIndex && issue.sentenceIndex === current.sentenceIndex).map((issue) => <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>)}</ul></div> : <p className="validation-ok">✓ No sentence validation errors</p>}
      <div className="review-actions"><button className="button secondary" disabled={visiblePosition <= 0} onClick={() => navigate(-1)}>← Previous</button><button className="button approve" onClick={() => void onReview(current.globalIndex, "approved")}>Approve <kbd>A</kbd></button><button className="button secondary needs" onClick={() => void onReview(current.globalIndex, "needs_changes")}>Needs changes <kbd>N</kbd></button><button className="button secondary" onClick={onEdit}>Edit sentence <kbd>E</kbd></button><button className="button secondary" onClick={() => navigate(1)}>Skip temporarily</button><button className="button secondary" disabled={visiblePosition >= visible.length - 1} onClick={() => navigate(1)}>Next →</button></div>
      <p className="review-progress">{visiblePosition + 1} of {visible.length} in this view · {index + 1} of {sentences.length} in pack</p>
    </section> : null}
  </div>;
}

function AnnotationList({ title, items = [], primary }: { title: string; items?: Annotation[]; primary: "surface" | "pattern" }) {
  return <div><strong>{title}</strong>{items.length ? <ul>{items.map((item, index) => <li key={index}><span>{item[primary] || item.surface}</span><small>{item.meaning || item.explanation || "No note"}</small></li>)}</ul> : <small>None</small>}</div>;
}

function Summary({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) { return <div className={tone}><strong>{value}</strong><span>{label}</span></div>; }
