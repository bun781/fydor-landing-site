"use client";

import { useState } from "react";
import {
  LANGUAGE_OPTIONS, moveItem, tagsFromInput,
  type Annotation, type AnnotationKind, type Lesson, type Pack, type Sentence, type ValidationIssue
} from "@/lib/contributor-pack";

type Props = {
  pack: Pack;
  issues: ValidationIssue[];
  saving: boolean;
  onChange: (pack: Pack) => void;
  onSave: () => void;
  onReview: () => void;
  onPreview: () => void;
  onBack: () => void;
};

export function PackEditor({ pack, issues, saving, onChange, onSave, onReview, onPreview, onBack }: Props) {
  const [lessonIndex, setLessonIndex] = useState(0);
  const lesson = pack.lessons[lessonIndex];
  function update(next: Pack) { onChange({ ...next, updatedAt: new Date().toISOString() }); }
  function updateLesson(nextLesson: Lesson) {
    const lessons = [...pack.lessons]; lessons[lessonIndex] = nextLesson; update({ ...pack, lessons });
  }
  function addLesson() {
    const next: Lesson = { language: pack.language, baseLanguage: pack.baseLanguage, title: "", description: "", source: "", level: pack.level, tags: [], sentences: [{ text: "", translation: "", words: [], grammar: [], chunks: [] }] };
    update({ ...pack, lessons: [...pack.lessons, next] }); setLessonIndex(pack.lessons.length);
  }
  function duplicateLesson(index: number) {
    const lessons = [...pack.lessons]; lessons.splice(index + 1, 0, structuredClone(pack.lessons[index])); update({ ...pack, lessons }); setLessonIndex(index + 1);
  }
  function deleteLesson(index: number) {
    if (!window.confirm("Delete this lesson and all its sentences?")) return;
    const lessons = pack.lessons.filter((_, itemIndex) => itemIndex !== index); update({ ...pack, lessons }); setLessonIndex(Math.max(0, Math.min(index, lessons.length - 1)));
  }
  function reorderLesson(index: number, direction: -1 | 1) { update({ ...pack, lessons: moveItem(pack.lessons, index, direction) }); setLessonIndex(index + direction); }
  function changeLanguages(language: string, baseLanguage: string) {
    update({ ...pack, language, baseLanguage, lessons: pack.lessons.map((item) => ({ ...item, language, baseLanguage })) });
  }

  return <div className="contributor-layout">
    <aside className="contributor-sidebar" aria-label="Pack lessons">
      <button className="text-button" onClick={onBack}>← My packs</button>
      <div><span className="eyebrow">Draft editor</span><strong>{pack.title || "Untitled pack"}</strong></div>
      <nav className="lesson-nav">
        {pack.lessons.map((item, index) => <button className={index === lessonIndex ? "active" : ""} key={index} onClick={() => setLessonIndex(index)}>
          <span>{index + 1}</span><span>{item.title || "Untitled lesson"}<small>{item.sentences.length} sentences</small></span>
        </button>)}
      </nav>
      <button className="button secondary" onClick={addLesson}>+ Add lesson</button>
    </aside>
    <div className="stack contributor-main">
      <section className="workspace-card compact-card">
        <div className="workspace-header"><div><span className="eyebrow">Pack details</span><h1>{pack.title || "New lesson pack"}</h1></div><div className="workspace-actions"><button className="button secondary" onClick={onPreview}>Preview</button><button className="button secondary" onClick={onReview}>Review & submit</button><button className="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save draft"}</button></div></div>
        <div className="form-grid">
          <Field label="Pack title" value={pack.title} onChange={(title) => update({ ...pack, title })} />
          <Field label="Version" value={pack.version} onChange={(version) => update({ ...pack, version })} />
          <label className="span-2">Description<textarea value={pack.description ?? ""} onChange={(event) => update({ ...pack, description: event.target.value })} rows={3} /></label>
          <label>Learning language<select value={pack.language} onChange={(event) => changeLanguages(event.target.value, pack.baseLanguage)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label>Translation language<select value={pack.baseLanguage} onChange={(event) => changeLanguages(pack.language, event.target.value)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <Field label="Level" value={pack.level ?? ""} onChange={(level) => update({ ...pack, level })} />
          <Field label="Course / topic tags" value={(pack.tags ?? []).join(", ")} onChange={(value) => update({ ...pack, tags: tagsFromInput(value) })} hint="Comma-separated" />
          <Field label="Author name" value={pack.author?.name ?? ""} onChange={(name) => update({ ...pack, author: { ...pack.author, name } })} />
          <Field label="Organization" value={pack.author?.organization ?? ""} onChange={(organization) => update({ ...pack, author: { ...pack.author, organization } })} />
        </div>
      </section>

      {lesson ? <section className="workspace-card compact-card">
        <div className="workspace-header"><div><span className="eyebrow">Lesson {lessonIndex + 1}</span><h2>{lesson.title || "Untitled lesson"}</h2></div><div className="icon-actions"><button title="Move lesson up" disabled={lessonIndex === 0} onClick={() => reorderLesson(lessonIndex, -1)}>↑</button><button title="Move lesson down" disabled={lessonIndex === pack.lessons.length - 1} onClick={() => reorderLesson(lessonIndex, 1)}>↓</button><button title="Duplicate lesson" onClick={() => duplicateLesson(lessonIndex)}>Duplicate</button><button className="danger-text" title="Delete lesson" onClick={() => deleteLesson(lessonIndex)}>Delete</button></div></div>
        <div className="form-grid">
          <Field label="Lesson title" value={lesson.title} onChange={(title) => updateLesson({ ...lesson, title })} />
          <Field label="Level" value={lesson.level ?? ""} onChange={(level) => updateLesson({ ...lesson, level })} />
          <label className="span-2">Description<textarea value={lesson.description ?? ""} onChange={(event) => updateLesson({ ...lesson, description: event.target.value })} rows={2} /></label>
          <Field label="Source / notes" value={lesson.source ?? ""} onChange={(source) => updateLesson({ ...lesson, source })} />
          <Field label="Tags" value={(lesson.tags ?? []).join(", ")} onChange={(value) => updateLesson({ ...lesson, tags: tagsFromInput(value) })} hint="Comma-separated" />
        </div>
        <div className="sentence-editor-list">
          {lesson.sentences.map((sentence, sentenceIndex) => <SentenceEditor key={sentenceIndex} sentence={sentence} number={sentenceIndex + 1} issues={issues.filter((issue) => issue.lessonIndex === lessonIndex && issue.sentenceIndex === sentenceIndex)} canDelete={lesson.sentences.length > 1}
            onChange={(nextSentence) => { const sentences = [...lesson.sentences]; sentences[sentenceIndex] = nextSentence; updateLesson({ ...lesson, sentences }); }}
            onDuplicate={() => { const sentences = [...lesson.sentences]; sentences.splice(sentenceIndex + 1, 0, structuredClone(sentence)); updateLesson({ ...lesson, sentences }); }}
            onMove={(direction) => updateLesson({ ...lesson, sentences: moveItem(lesson.sentences, sentenceIndex, direction) })}
            onDelete={() => updateLesson({ ...lesson, sentences: lesson.sentences.filter((_, index) => index !== sentenceIndex) })} />)}
        </div>
        <button className="button secondary" onClick={() => updateLesson({ ...lesson, sentences: [...lesson.sentences, { text: "", translation: "", words: [], grammar: [], chunks: [] }] })}>+ Add sentence</button>
      </section> : <section className="workspace-card empty-state"><h2>No lessons yet</h2><p>Add a lesson to continue.</p><button className="button" onClick={addLesson}>Add lesson</button></section>}
    </div>
  </div>;
}

function SentenceEditor({ sentence, number, issues, canDelete, onChange, onDuplicate, onMove, onDelete }: { sentence: Sentence; number: number; issues: ValidationIssue[]; canDelete: boolean; onChange: (sentence: Sentence) => void; onDuplicate: () => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  return <article className="sentence-editor">
    <div className="sentence-editor-heading"><strong>Sentence {number}</strong><div className="icon-actions"><button title="Move up" onClick={() => onMove(-1)}>↑</button><button title="Move down" onClick={() => onMove(1)}>↓</button><button onClick={onDuplicate}>Duplicate</button><button className="danger-text" disabled={!canDelete} onClick={onDelete}>Delete</button></div></div>
    <div className="form-grid"><label>Source sentence<textarea rows={2} value={sentence.text} onChange={(event) => onChange({ ...sentence, text: event.target.value })} /></label><label>Translation<textarea rows={2} value={sentence.translation} onChange={(event) => onChange({ ...sentence, translation: event.target.value })} /></label></div>
    {issues.length ? <ul className="validation-list">{issues.map((issue) => <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>)}</ul> : null}
    <div className="annotation-columns">
      <AnnotationEditor title="Vocabulary" kind="words" items={sentence.words ?? []} onChange={(words) => onChange({ ...sentence, words })} />
      <AnnotationEditor title="Grammar" kind="grammar" items={sentence.grammar ?? []} onChange={(grammar) => onChange({ ...sentence, grammar })} />
      <AnnotationEditor title="Chunks" kind="chunks" items={sentence.chunks ?? []} onChange={(chunks) => onChange({ ...sentence, chunks })} />
    </div>
  </article>;
}

function AnnotationEditor({ title, kind, items, onChange }: { title: string; kind: AnnotationKind; items: Annotation[]; onChange: (items: Annotation[]) => void }) {
  const primary = kind === "grammar" ? "pattern" : "surface";
  return <div className="annotation-editor"><div className="annotation-title"><strong>{title}</strong><button onClick={() => onChange([...items, kind === "grammar" ? { pattern: "", surface: "", meaning: "" } : { surface: "", meaning: "" }])}>+ Add</button></div>
    {items.map((item, index) => <div className="annotation-row" key={index}>
      <input aria-label={`${title} text`} placeholder={kind === "grammar" ? "Pattern" : "Text in sentence"} value={item[primary] ?? ""} onChange={(event) => { const next = [...items]; next[index] = { ...item, [primary]: event.target.value, ...(kind === "grammar" && !item.surface ? { surface: event.target.value } : {}) }; onChange(next); }} />
      {kind === "grammar" ? <input aria-label="Grammar surface" placeholder="Exact text" value={item.surface ?? ""} onChange={(event) => { const next = [...items]; next[index] = { ...item, surface: event.target.value }; onChange(next); }} /> : null}
      <input aria-label={`${title} meaning`} placeholder="Meaning / note" value={item.meaning ?? item.explanation ?? ""} onChange={(event) => { const next = [...items]; next[index] = { ...item, meaning: event.target.value }; onChange(next); }} />
      <button aria-label={`Delete ${title} annotation`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>
    </div>)}
    {!items.length ? <small>No annotations</small> : null}
  </div>;
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} />{hint ? <small>{hint}</small> : null}</label>;
}
