import type { Draft, DraftSummary, Pack, ReviewStatus } from "@/lib/contributor-pack";

const KEY = "fydor.contributor-drafts.v1";
type LocalDraft = Draft & { reviews: Array<[number, ReviewStatus]> };

function read(): LocalDraft[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function write(drafts: LocalDraft[]) { window.localStorage.setItem(KEY, JSON.stringify(drafts)); }
function id() { return crypto.randomUUID(); }

export function listLocalDrafts(): DraftSummary[] {
  return read().map(({ canonical_json, sentence_review_progress, reviews, ...draft }) => draft).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
export function getLocalDraft(draftId: string): Draft | null {
  const draft = read().find((item) => item.id === draftId);
  return draft ? { ...draft, sentence_review_progress: draft.reviews.map(([sentence_index, status]) => ({ sentence_index, status, draft_revision: draft.revision })) } : null;
}
export function saveLocalDraft(input: { draft?: Draft | null; pack: Pack; reviews: Map<number, ReviewStatus>; state?: Draft["state"] }): Draft {
  const now = new Date().toISOString();
  const current = input.draft;
  const draft: LocalDraft = {
    id: current?.id ?? id(), revision: (current?.revision ?? 0) + 1, state: input.state ?? current?.state ?? "draft",
    title: input.pack.title || "Untitled pack", target_language: input.pack.language, base_language: input.pack.baseLanguage,
    level: input.pack.level || "", canonical_json: input.pack, reviews: [...input.reviews], created_at: current?.created_at ?? now, updated_at: now
  };
  const drafts = read().filter((item) => item.id !== draft.id); drafts.push(draft); write(drafts);
  return getLocalDraft(draft.id)!;
}
export function deleteLocalDraft(draftId: string) { write(read().filter((draft) => draft.id !== draftId)); }
export function duplicateLocalDraft(draftId: string): Draft | null {
  const source = getLocalDraft(draftId); if (!source) return null;
  const pack = structuredClone(source.canonical_json); pack.id = `${pack.id}-copy-${Date.now()}`; pack.title = `${pack.title || "Untitled pack"} (copy)`;
  return saveLocalDraft({ pack, reviews: new Map(), state: "draft" });
}
