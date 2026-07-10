export function renderPackPreview(pack, target, options = {}) {
  target.replaceChildren();
  if (!pack) return;
  const heading = document.createElement("div");
  heading.className = "pack-preview-heading";
  heading.append(node("span", options.label || "Pack being submitted", "pill pill-accent"), node("h3", pack.title));
  target.append(heading);

  const details = document.createElement("dl");
  appendDetail(details, "Description", pack.description || "None");
  appendDetail(details, "Languages", `${pack.language} → ${pack.baseLanguage}`);
  appendDetail(details, "Level", pack.level || "Not specified");
  appendDetail(details, "Source", pack.lessons?.map((lesson) => lesson.source).filter(Boolean).join("; ") || "None");
  appendDetail(details, "Tags", pack.tags?.join(", ") || "None");
  appendDetail(details, "Lessons", String(pack.lessons?.length || 0));
  appendDetail(details, "Sentences", String(countSentences(pack)));
  appendDetail(details, "Annotations", annotationSummary(pack));
  target.append(details);

  const list = document.createElement("div");
  list.className = "pack-preview-sentences";
  for (const [lessonIndex, lesson] of (pack.lessons || []).entries()) {
    const lessonHeading = node("h4", `${lessonIndex + 1}. ${lesson.title}`);
    list.append(lessonHeading);
    for (const [sentenceIndex, sentence] of (lesson.sentences || []).entries()) {
      const row = document.createElement("details");
      row.className = "pack-preview-sentence";
      const summary = document.createElement("summary");
      summary.append(node("span", `Sentence ${sentenceIndex + 1}`, "status-badge"), node("span", sentence.text, "preview-source"));
      row.append(summary);
      const body = document.createElement("div");
      body.append(node("p", sentence.translation, "preview-translation"));
      appendAnnotationList(body, "Words", sentence.words);
      appendAnnotationList(body, "Grammar", sentence.grammar);
      appendAnnotationList(body, "Chunks", sentence.chunks);
      row.append(body);
      list.append(row);
    }
  }
  target.append(list);
}

export function countSentences(pack) { return (pack?.lessons || []).reduce((total, lesson) => total + (lesson.sentences?.length || 0), 0); }

function annotationSummary(pack) {
  const counts = { words: 0, grammar: 0, chunks: 0 };
  for (const lesson of pack.lessons || []) for (const sentence of lesson.sentences || []) for (const key of Object.keys(counts)) counts[key] += sentence[key]?.length || 0;
  return `${counts.words} words · ${counts.grammar} grammar · ${counts.chunks} chunks`;
}

function appendAnnotationList(parent, label, items) {
  const section = document.createElement("section");
  section.className = "preview-annotations";
  section.append(node("strong", `${label} (${items?.length || 0})`));
  if (!items?.length) section.append(node("span", " None", "muted"));
  else section.append(node("span", ` ${items.map((item) => item.surface || item.pattern).join(" · ")}`));
  parent.append(section);
}

function appendDetail(dl, label, value) { dl.append(node("dt", label), node("dd", value || "None")); }
function node(tag, value, className) { const element = document.createElement(tag); element.textContent = String(value ?? ""); if (className) element.className = className; return element; }
