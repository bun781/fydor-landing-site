export const LANGUAGE_OPTIONS = [
  ["ar", "Arabic"], ["bn", "Bengali"], ["cs", "Czech"], ["da", "Danish"], ["de", "German"],
  ["el", "Greek"], ["en", "English"], ["es", "Spanish"], ["fa", "Persian"], ["fi", "Finnish"],
  ["fil", "Filipino"], ["fr", "French"], ["he", "Hebrew"], ["hi", "Hindi"], ["hu", "Hungarian"],
  ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"], ["ms", "Malay"],
  ["nl", "Dutch"], ["no", "Norwegian"], ["pl", "Polish"], ["pt", "Portuguese"], ["ro", "Romanian"],
  ["ru", "Russian"], ["sv", "Swedish"], ["sw", "Swahili"], ["ta", "Tamil"], ["th", "Thai"],
  ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["vi", "Vietnamese"], ["yue", "Cantonese"],
  ["zh", "Chinese"]
] as const;

export type ReviewStatus = "unreviewed" | "approved" | "needs_changes";
export type AnnotationKind = "words" | "grammar" | "chunks";
export type Annotation = {
  surface?: string;
  pattern?: string;
  lemma?: string;
  meaning?: string;
  role?: string;
  explanation?: string;
  type?: string;
  level?: string;
  tags?: string[];
};
export type Sentence = {
  text: string;
  translation: string;
  words?: Annotation[];
  grammar?: Annotation[];
  chunks?: Annotation[];
};
export type Lesson = {
  language: string;
  baseLanguage: string;
  title: string;
  description?: string;
  source?: string;
  level?: string;
  tags?: string[];
  sentences: Sentence[];
};
export type Pack = {
  type: "fydor_pack";
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  author?: { name?: string; organization?: string; url?: string };
  version: string;
  license?: string;
  language: string;
  baseLanguage: string;
  level?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  lessons: Lesson[];
};
export type ReviewRow = {
  sentence_index: number;
  status: "unreviewed" | "approved" | "needs_changes" | "reviewed" | "needs_work";
  reviewer_note?: string | null;
  draft_revision?: number;
};
export type Draft = {
  id: string;
  revision: number;
  state: "draft" | "reviewing" | "changes_requested" | "withdrawn";
  title: string;
  target_language: string;
  base_language: string;
  level: string;
  canonical_json: Pack;
  sentence_review_progress?: ReviewRow[];
  created_at?: string;
  updated_at?: string;
};
export type DraftSummary = Omit<Draft, "canonical_json" | "sentence_review_progress">;
export type Submission = {
  id: string;
  title: string;
  target_language: string;
  base_language: string;
  state: "submitted" | "changes_requested" | "language_approved" | "approved" | "published" | "rejected" | "withdrawn" | "archived";
  current_version: number;
  row_version: number;
  created_at: string;
  updated_at: string;
};
export type ValidationIssue = { path: string; message: string; lessonIndex?: number; sentenceIndex?: number };
export type FlatSentence = { sentence: Sentence; lesson: Lesson; lessonIndex: number; sentenceIndex: number; globalIndex: number };

export type PackParseResult = { pack: Pack } | { issues: ValidationIssue[] };

/** Parses enough of the pack shape to safely open a local, editable draft.
 * The server remains the authoritative validator when a contributor submits. */
export function parsePackClient(source: string): PackParseResult {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return { issues: [{ path: "$", message: "Malformed JSON." }] }; }
  if (!isPackShape(value)) return { issues: [{ path: "$", message: "This is not a supported Fydor pack." }] };
  return { pack: value };
}

export function createBlankPack(): Pack {
  const now = new Date().toISOString();
  return {
    type: "fydor_pack", schemaVersion: 1, id: `community-pack-${Date.now()}`, title: "", description: "",
    version: "1.0.0", license: "CC BY 4.0", language: "ko", baseLanguage: "en", level: "beginner", tags: [],
    createdAt: now, updatedAt: now,
    lessons: [{ language: "ko", baseLanguage: "en", title: "", description: "", source: "", level: "beginner", tags: [], sentences: [{ text: "", translation: "", words: [], grammar: [], chunks: [] }] }]
  };
}

export function flattenSentences(pack: Pack): FlatSentence[] {
  let globalIndex = 0;
  return pack.lessons.flatMap((lesson, lessonIndex) => lesson.sentences.map((sentence, sentenceIndex) => ({
    sentence, lesson, lessonIndex, sentenceIndex, globalIndex: globalIndex++
  })));
}

export function reviewStatus(row?: ReviewRow): ReviewStatus {
  if (row?.status === "approved" || row?.status === "reviewed") return "approved";
  if (row?.status === "needs_changes" || row?.status === "needs_work") return "needs_changes";
  return "unreviewed";
}

export function resetChangedReviews(previous: Pack, next: Pack, reviews: Map<number, ReviewStatus>): Map<number, ReviewStatus> {
  const before = reviewKeys(previous);
  const after = reviewKeys(next);
  return new Map([...reviews].filter(([index]) => before[index] === after[index]));
}

export function reviewKeys(pack: Pack): string[] {
  return flattenSentences(pack).map(({ lesson, sentence }) => JSON.stringify({
    language: pack.language, baseLanguage: pack.baseLanguage,
    lesson: { title: lesson.title, description: lesson.description, source: lesson.source, level: lesson.level, tags: lesson.tags },
    sentence
  }));
}

export function validatePackClient(pack: Pack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string, lessonIndex?: number, sentenceIndex?: number) => issues.push({ path, message, lessonIndex, sentenceIndex });
  if (!pack.title.trim()) add("title", "Pack title is required.");
  if (!LANGUAGE_OPTIONS.some(([code]) => code === pack.language)) add("language", "Choose a supported learning language.");
  if (!LANGUAGE_OPTIONS.some(([code]) => code === pack.baseLanguage)) add("baseLanguage", "Choose a supported translation language.");
  if (!pack.lessons.length) add("lessons", "Add at least one lesson.");
  pack.lessons.forEach((lesson, lessonIndex) => {
    if (!lesson.title.trim()) add(`lessons[${lessonIndex}].title`, "Lesson title is required.", lessonIndex);
    if (!lesson.sentences.length) add(`lessons[${lessonIndex}].sentences`, "Empty lessons cannot be submitted.", lessonIndex);
    const sentenceTexts = new Set<string>();
    lesson.sentences.forEach((sentence, sentenceIndex) => {
      const base = `lessons[${lessonIndex}].sentences[${sentenceIndex}]`;
      if (!sentence.text.trim()) add(`${base}.text`, "Source sentence is required.", lessonIndex, sentenceIndex);
      if (!sentence.translation.trim()) add(`${base}.translation`, "Translation is required.", lessonIndex, sentenceIndex);
      const sentenceKey = sentence.text.normalize("NFC").trim().toLocaleLowerCase();
      if (sentenceKey && sentenceTexts.has(sentenceKey)) add(`${base}.text`, "Sentence duplicates another sentence in this lesson.", lessonIndex, sentenceIndex);
      sentenceTexts.add(sentenceKey);
      (["words", "grammar", "chunks"] as AnnotationKind[]).forEach((kind) => {
        const seen = new Set<string>();
        (sentence[kind] ?? []).forEach((annotation, annotationIndex) => {
          // A grammar pattern names a teaching rule; it is not necessarily a
          // verbatim span of the sentence. Only an explicit surface is a
          // highlight that must occur in the source text.
          const surface = annotation.surface;
          if (!surface?.trim()) add(`${base}.${kind}[${annotationIndex}]`, "Annotation text is required.", lessonIndex, sentenceIndex);
          else if (!sentence.text.normalize("NFC").includes(surface.normalize("NFC"))) add(`${base}.${kind}[${annotationIndex}]`, "Annotation text must occur in the sentence.", lessonIndex, sentenceIndex);
          const key = JSON.stringify(annotation);
          if (seen.has(key)) add(`${base}.${kind}[${annotationIndex}]`, "Duplicate annotation.", lessonIndex, sentenceIndex);
          seen.add(key);
        });
      });
    });
  });
  return issues;
}

export function tagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function moveItem<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAnnotation(value: unknown): value is Annotation {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string" || isStringArray(item));
}

function isSentence(value: unknown): value is Sentence {
  if (!isRecord(value) || typeof value.text !== "string" || typeof value.translation !== "string") return false;
  return ["words", "grammar", "chunks"].every((key) => value[key] === undefined || (Array.isArray(value[key]) && value[key].every(isAnnotation)));
}

function isLesson(value: unknown): value is Lesson {
  if (!isRecord(value) || typeof value.language !== "string" || typeof value.baseLanguage !== "string" || typeof value.title !== "string" || !Array.isArray(value.sentences) || !value.sentences.every(isSentence)) return false;
  return ["description", "source", "level"].every((key) => value[key] === undefined || typeof value[key] === "string") && (value.tags === undefined || isStringArray(value.tags));
}

function isPackShape(value: unknown): value is Pack {
  if (!isRecord(value) || value.type !== "fydor_pack" || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.version !== "string" || typeof value.language !== "string" || typeof value.baseLanguage !== "string" || !Array.isArray(value.lessons) || !value.lessons.every(isLesson)) return false;
  return ["description", "license", "level", "createdAt", "updatedAt"].every((key) => value[key] === undefined || typeof value[key] === "string") && (value.tags === undefined || isStringArray(value.tags));
}
