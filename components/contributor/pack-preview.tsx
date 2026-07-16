"use client";

import { flattenSentences, type Pack } from "@/lib/contributor-pack";

export function PackPreview({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const sentences = flattenSentences(pack);
  return <div className="stack"><section className="workspace-card compact-card"><div className="workspace-header"><div><button className="text-button" onClick={onBack}>← Back to editor</button><span className="eyebrow">Learner preview</span><h1>{pack.title || "Untitled pack"}</h1><p>{pack.description || "No pack description"}</p></div><div className="preview-meta"><strong>{pack.language} → {pack.baseLanguage}</strong><span>{pack.level || "No level"} · {pack.lessons.length} lessons · {sentences.length} sentences</span><span>{(pack.tags ?? []).join(" · ")}</span></div></div></section>
    {pack.lessons.map((lesson, lessonIndex) => <section className="workspace-card compact-card" key={lessonIndex}><span className="eyebrow">Lesson {lessonIndex + 1}</span><h2>{lesson.title || "Untitled lesson"}</h2><p>{lesson.description}</p><div className="learner-sentences">{lesson.sentences.map((sentence, sentenceIndex) => <article key={sentenceIndex}><strong>{sentence.text || "Empty sentence"}</strong><p>{sentence.translation || "No translation"}</p><div className="preview-annotation-line">{[...(sentence.words ?? []), ...(sentence.grammar ?? []), ...(sentence.chunks ?? [])].map((item, index) => <span key={index}>{item.surface || item.pattern}: {item.meaning || item.explanation || "annotation"}</span>)}</div></article>)}</div></section>)}
  </div>;
}
