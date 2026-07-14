"use strict";

const { createHash } = require("node:crypto");
const { httpError } = require("./http");

const MAX_PACK_BYTES = 5_000_000;
const MAX_PACK_DEPTH = 24;
const MAX_PACK_LESSONS = 80;
const MAX_PACK_SENTENCES = 2_000;
const MAX_ANNOTATIONS = 250;
const MAX_STRING = 20_000;
const SUPPORTED_LANGUAGES = new Set([
  "ar", "bn", "cs", "da", "de", "el", "en", "es", "fa", "fi", "fil", "fr", "he", "hi",
  "hu", "id", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sv", "sw",
  "ta", "th", "tr", "uk", "ur", "vi", "yue", "zh"
]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const BIDI_OR_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const HTML_RISK = /<\s*\/?\s*(script|style|iframe|object|embed|svg|math)|\bon\w+\s*=|javascript\s*:/iu;
const PACK_KEYS = ["type", "schemaVersion", "id", "title", "description", "author", "version", "license", "language", "baseLanguage", "level", "tags", "createdAt", "updatedAt", "lessons"];
const LESSON_KEYS = ["language", "baseLanguage", "title", "description", "source", "level", "tags", "sentences"];
const SENTENCE_KEYS = ["text", "translation", "words", "grammar", "chunks"];
const WORD_KEYS = ["surface", "lemma", "meaning", "role", "explanation"];
const GRAMMAR_KEYS = ["pattern", "surface", "meaning", "explanation"];
const CHUNK_KEYS = ["surface", "meaning", "explanation", "type", "level", "tags"];

function parseAndValidatePack(source) {
  const text = typeof source === "string" ? source.trim() : JSON.stringify(source ?? {});
  if (!text) throw packError(400, "empty_pack", "Pack data is required.", [{ path: "$", message: "Pack data is required." }]);
  if (Buffer.byteLength(text, "utf8") > MAX_PACK_BYTES) {
    throw packError(413, "payload_too_large", `Pack data must be 5 MB (${MAX_PACK_BYTES} bytes) or smaller.`, [{ path: "$", message: `Pack data must be 5 MB (${MAX_PACK_BYTES} bytes) or smaller.` }]);
  }

  scanJson(text, MAX_PACK_DEPTH);
  let value;
  try { value = JSON.parse(text); } catch {
    throw packError(400, "invalid_json", "Pack data must be valid JSON.", [{ path: "$", message: "Malformed JSON." }]);
  }
  scanValue(value, 0);
  const issues = validatePack(value);
  if (issues.length) {
    const detail = issues.slice(0, 8).map((item) => item.path === "type" ? `Pack type ${item.message}` : `${item.path}: ${item.message}`).join(" ");
    throw packError(422, "invalid_pack", `The pack is not valid. ${detail}`, issues);
  }

  const pack = compactAnnotationDuplicates(normalize(value));
  const canonical = canonicalizePack(pack);
  return {
    pack,
    canonical,
    checksum: computePackContentHash(pack),
    contentHash: computePackContentHash(pack),
    sentenceCount: countSentences(pack),
    byteLength: Buffer.byteLength(JSON.stringify(pack, null, 2), "utf8")
  };
}

function validatePack(value) {
  const issues = [];
  if (!isRecord(value)) return [{ path: "$", message: "Pack must be an object." }];
  validateRecord(value, "", PACK_KEYS, issues);
  if (value.type !== "fydor_pack") issues.push(issue("type", "must equal fydor_pack"));
  if (value.schemaVersion !== 1) issues.push(issue("schemaVersion", "must equal 1"));
  validateText(value.id, "id", issues, { required: true, max: 160, pattern: /^[A-Za-z0-9._:-]+$/u });
  validateText(value.title, "title", issues, { required: true, max: 200 });
  validateText(value.description, "description", issues, { max: 4_000 });
  validateAuthor(value.author, issues);
  validateText(value.version, "version", issues, { required: true, max: 80, pattern: /^[A-Za-z0-9._:+-]+$/u });
  validateText(value.license, "license", issues, { max: 120 });
  validateLanguage(value.language, "language", issues);
  validateLanguage(value.baseLanguage, "baseLanguage", issues);
  validateText(value.level, "level", issues, { max: 80 });
  validateStringArray(value.tags, "tags", issues, 30, 80);
  validateIsoDate(value.createdAt, "createdAt", issues);
  validateIsoDate(value.updatedAt, "updatedAt", issues);

  if (!Array.isArray(value.lessons)) {
    issues.push(issue("lessons", "must be an array"));
    return issues;
  }
  if (!value.lessons.length) issues.push(issue("lessons", "must contain at least one lesson"));
  if (value.lessons.length > MAX_PACK_LESSONS) issues.push(issue("lessons", `must contain at most ${MAX_PACK_LESSONS} lessons`));
  let sentenceCount = 0;
  value.lessons.forEach((lesson, index) => {
    validateLesson(lesson, `lessons[${index}]`, issues);
    sentenceCount += Array.isArray(lesson?.sentences) ? lesson.sentences.length : 0;
  });
  if (sentenceCount > MAX_PACK_SENTENCES) issues.push(issue("lessons", `must contain at most ${MAX_PACK_SENTENCES} sentences in total`));
  return issues;
}

function validateLesson(value, path, issues) {
  if (!isRecord(value)) { issues.push(issue(path, "must be an object")); return; }
  validateRecord(value, path, LESSON_KEYS, issues);
  validateLanguage(value.language, `${path}.language`, issues);
  validateLanguage(value.baseLanguage, `${path}.baseLanguage`, issues);
  validateText(value.title, `${path}.title`, issues, { required: true, max: 200 });
  validateText(value.description, `${path}.description`, issues, { max: 4_000 });
  validateText(value.source, `${path}.source`, issues, { max: 4_000 });
  validateText(value.level, `${path}.level`, issues, { max: 80 });
  validateStringArray(value.tags, `${path}.tags`, issues, 30, 80);
  if (!Array.isArray(value.sentences)) { issues.push(issue(`${path}.sentences`, "must be an array")); return; }
  if (!value.sentences.length) issues.push(issue(`${path}.sentences`, "must contain at least one sentence"));
  if (value.sentences.length > MAX_PACK_SENTENCES) issues.push(issue(`${path}.sentences`, `must contain at most ${MAX_PACK_SENTENCES} sentences`));
  const seen = new Set();
  value.sentences.forEach((sentence, index) => {
    const sentencePath = `${path}.sentences[${index}]`;
    validateSentence(sentence, sentencePath, issues);
    if (typeof sentence?.text === "string") {
      const key = sentence.text.normalize("NFC").trim().toLocaleLowerCase();
      if (seen.has(key)) issues.push(issue(`${sentencePath}.text`, "duplicates another sentence"));
      seen.add(key);
    }
  });
}

function validateSentence(value, path, issues) {
  if (!isRecord(value)) { issues.push(issue(path, "must be an object")); return; }
  validateRecord(value, path, SENTENCE_KEYS, issues);
  validateText(value.text, `${path}.text`, issues, { required: true, max: MAX_STRING });
  validateText(value.translation, `${path}.translation`, issues, { required: true, max: MAX_STRING });
  validateAnnotations(value.words, `${path}.words`, "surface", WORD_KEYS, value.text, issues);
  validateAnnotations(value.grammar, `${path}.grammar`, "pattern", GRAMMAR_KEYS, value.text, issues);
  validateAnnotations(value.chunks, `${path}.chunks`, "surface", CHUNK_KEYS, value.text, issues);
}

function validateAnnotations(items, path, requiredField, allowedKeys, sentenceText, issues) {
  if (items === undefined) return;
  if (!Array.isArray(items)) { issues.push(issue(path, "must be an array")); return; }
  if (items.length > MAX_ANNOTATIONS) issues.push(issue(path, `must contain at most ${MAX_ANNOTATIONS} annotations`));
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) { issues.push(issue(itemPath, "must be an object")); return; }
    validateRecord(item, itemPath, allowedKeys, issues);
    validateText(item[requiredField], `${itemPath}.${requiredField}`, issues, { required: true, max: 500 });
    for (const key of allowedKeys.filter((candidate) => candidate !== requiredField && candidate !== "tags")) {
      validateText(item[key], `${itemPath}.${key}`, issues, { max: 4_000 });
    }
    if (allowedKeys.includes("tags")) validateStringArray(item.tags, `${itemPath}.tags`, issues, 20, 80);
    const surface = item.surface || item[requiredField];
    if (typeof surface === "string" && typeof sentenceText === "string" && !sentenceText.normalize("NFC").includes(surface.normalize("NFC"))) {
      issues.push(issue(`${itemPath}.surface`, "must occur in the sentence text"));
    }
  });
}

function validateRecord(value, path, allowed, issues) {
  for (const key of Object.keys(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (DANGEROUS_KEYS.has(key)) issues.push(issue(keyPath, "uses a dangerous object key"));
    else if (!allowed.includes(key)) issues.push(issue(keyPath, "is not an allowed field"));
  }
}

function validateAuthor(value, issues) {
  if (value === undefined) return;
  if (!isRecord(value)) { issues.push(issue("author", "must be an object")); return; }
  validateRecord(value, "author", ["name", "organization", "url"], issues);
  validateText(value.name, "author.name", issues, { max: 200 });
  validateText(value.organization, "author.organization", issues, { max: 200 });
  validateText(value.url, "author.url", issues, { max: 500 });
  if (typeof value.url === "string" && value.url.trim()) {
    try { if (!["http:", "https:"].includes(new URL(value.url).protocol)) issues.push(issue("author.url", "must use HTTP or HTTPS")); }
    catch { issues.push(issue("author.url", "must be a valid URL")); }
  }
}

function validateLanguage(value, path, issues) {
  validateText(value, path, issues, { required: true, max: 16 });
  if (typeof value === "string" && !SUPPORTED_LANGUAGES.has(value.trim().toLowerCase())) issues.push(issue(path, "is not a supported language code"));
}

function validateIsoDate(value, path, issues) {
  if (value === undefined) return;
  validateText(value, path, issues, { max: 80 });
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) issues.push(issue(path, "must be an ISO date"));
}

function validateStringArray(value, path, issues, maxItems, maxLength) {
  if (value === undefined) return;
  if (!Array.isArray(value)) { issues.push(issue(path, "must be an array")); return; }
  if (value.length > maxItems) issues.push(issue(path, `must contain at most ${maxItems} items`));
  const seen = new Set();
  value.forEach((item, index) => {
    validateText(item, `${path}[${index}]`, issues, { required: true, max: maxLength });
    if (typeof item === "string") {
      const key = item.normalize("NFC").trim().toLocaleLowerCase();
      if (seen.has(key)) issues.push(issue(`${path}[${index}]`, "duplicates another entry"));
      seen.add(key);
    }
  });
}

function validateText(value, path, issues, options = {}) {
  if (value === undefined || value === null) { if (options.required) issues.push(issue(path, "is required")); return; }
  if (typeof value !== "string") { issues.push(issue(path, "must be a string")); return; }
  if (options.required && !value.trim()) issues.push(issue(path, "cannot be empty"));
  if (value.length > (options.max || MAX_STRING)) issues.push(issue(path, `must contain at most ${options.max || MAX_STRING} characters`));
  if (options.pattern && !options.pattern.test(value.trim())) issues.push(issue(path, "contains unsupported characters"));
  if (BIDI_OR_CONTROL.test(value)) issues.push(issue(path, "contains disallowed control or bidirectional characters"));
  if (HTML_RISK.test(value)) issues.push(issue(path, "contains unsafe HTML or a script-like URL"));
}

function scanValue(value, depth) {
  if (depth > MAX_PACK_DEPTH) throw packError(400, "invalid_json", `JSON nesting exceeds ${MAX_PACK_DEPTH} levels.`, [{ path: "$", message: `JSON nesting exceeds ${MAX_PACK_DEPTH} levels.` }]);
  if (Array.isArray(value)) { value.forEach((item) => scanValue(item, depth + 1)); return; }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) throw packError(400, "invalid_json", `Dangerous JSON key: ${key}.`, [{ path: key, message: "Dangerous JSON key." }]);
    scanValue(item, depth + 1);
  }
}

function normalize(value) {
  if (typeof value === "string") return value.normalize("NFC").trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (isRecord(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined && item !== null) output[key] = normalize(item);
    return output;
  }
  return value;
}

function compactAnnotationDuplicates(pack) {
  return {
    ...pack,
    lessons: pack.lessons.map((lesson) => ({
      ...lesson,
      sentences: lesson.sentences.map((sentence) => ({
        ...sentence,
        words: uniqueAnnotations(sentence.words),
        grammar: uniqueAnnotations(sentence.grammar),
        chunks: uniqueAnnotations(sentence.chunks)
      }))
    }))
  };
}

function uniqueAnnotations(items) {
  if (!Array.isArray(items)) return items;
  const seen = new Set();
  return items.filter((item) => {
    const key = stableStringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizePack(pack) {
  const lessons = (pack.lessons || []).map((lesson) => ({
    language: lesson.language,
    baseLanguage: lesson.baseLanguage,
    sentences: (lesson.sentences || []).map((sentence) => {
      const result = { text: sentence.text, translation: sentence.translation };
      for (const key of ["words", "grammar", "chunks"]) if (Array.isArray(sentence[key]) && sentence[key].length) result[key] = sentence[key];
      return result;
    })
  }));
  return { language: pack.language, baseLanguage: pack.baseLanguage, lessons };
}

function computePackContentHash(pack) {
  return createHash("sha256").update(stableStringify(canonicalizePack(pack)), "utf8").digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function scanJson(source, maxDepth) {
  let index = 0;
  function whitespace() { while (/\s/u.test(source[index] || "")) index += 1; }
  function string() {
    if (source[index] !== '"') throw packError(400, "invalid_json", "Malformed JSON string.", [{ path: "$", message: "Malformed JSON string." }]);
    const start = index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') {
        try { return JSON.parse(source.slice(start, index)); }
        catch {
          throw packError(400, "invalid_json", "Malformed JSON string.", [{ path: "$", message: "Malformed JSON string." }]);
        }
      }
      if (char === "\\") index += 1;
      else if (char < " ") throw packError(400, "invalid_json", "Malformed JSON string.", [{ path: "$", message: "Malformed JSON string." }]);
    }
    throw packError(400, "invalid_json", "Unterminated JSON string.", [{ path: "$", message: "Unterminated JSON string." }]);
  }
  function value(depth) {
    if (depth > maxDepth) throw packError(400, "invalid_json", `JSON nesting exceeds ${maxDepth} levels.`, [{ path: "$", message: `JSON nesting exceeds ${maxDepth} levels.` }]);
    whitespace();
    const char = source[index];
    if (char === "{") return object(depth + 1);
    if (char === "[") return array(depth + 1);
    if (char === '"') { string(); return; }
    const token = source.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    if (!token) throw packError(400, "invalid_json", "Malformed JSON value.", [{ path: "$", message: "Malformed JSON value." }]);
    index += token.length;
  }
  function object(depth) {
    index += 1; whitespace();
    const keys = new Set();
    if (source[index] === "}") { index += 1; return; }
    while (true) {
      whitespace();
      const key = string();
      if (keys.has(key)) throw packError(400, "invalid_json", `Duplicate JSON key: ${key}.`, [{ path: key, message: "Duplicate JSON key." }]);
      if (DANGEROUS_KEYS.has(key)) throw packError(400, "invalid_json", `Dangerous JSON key: ${key}.`, [{ path: key, message: "Dangerous JSON key." }]);
      keys.add(key);
      whitespace();
      if (source[index++] !== ":") throw packError(400, "invalid_json", "Malformed JSON object.", [{ path: "$", message: "Malformed JSON object." }]);
      value(depth);
      whitespace();
      if (source[index] === "}") { index += 1; return; }
      if (source[index++] !== ",") throw packError(400, "invalid_json", "Malformed JSON object.", [{ path: "$", message: "Malformed JSON object." }]);
    }
  }
  function array(depth) {
    index += 1; whitespace();
    if (source[index] === "]") { index += 1; return; }
    while (true) {
      value(depth);
      whitespace();
      if (source[index] === "]") { index += 1; return; }
      if (source[index++] !== ",") throw packError(400, "invalid_json", "Malformed JSON array.", [{ path: "$", message: "Malformed JSON array." }]);
    }
  }
  value(0);
  whitespace();
  if (index !== source.length) throw packError(400, "invalid_json", "Mixed content is not valid pack JSON.", [{ path: "$", message: "Mixed content is not valid pack JSON." }]);
}

function detectNearDuplicates(pack, candidates = []) {
  const sourcePairs = sentencePairs(pack);
  if (!sourcePairs.length) return { possibleDuplicate: false, highestOverlap: 0, matchingPackId: null, reasons: [] };
  let best = { possibleDuplicate: false, highestOverlap: 0, matchingPackId: null, reasons: [] };
  for (const candidate of candidates) {
    const other = candidate.pack || candidate.canonical_json || candidate.canonicalJson;
    if (!other || pack.language !== other.language || pack.baseLanguage !== other.baseLanguage) continue;
    const candidatePairs = sentencePairs(other);
    if (!candidatePairs.length) continue;
    const matches = new Set(candidatePairs);
    const overlap = sourcePairs.filter((pair) => matches.has(pair)).length / Math.max(sourcePairs.length, candidatePairs.length);
    const titleSimilarity = tokenSimilarity(pack.title, other.title);
    const reasons = [];
    if (overlap >= 0.95 || (sourcePairs.length <= 3 && overlap === 1)) reasons.push(`${Math.round(overlap * 100)}% of sentence pairs overlap`);
    if (titleSimilarity >= 0.85) reasons.push("Title is highly similar");
    if (reasons.length && overlap > best.highestOverlap) {
      best = { possibleDuplicate: true, highestOverlap: Number(overlap.toFixed(4)), matchingPackId: candidate.id || candidate.submission_id || null, reasons };
    }
  }
  return best;
}

function findExactDuplicate(pack, candidates = []) {
  const hash = computePackContentHash(pack);
  return candidates.find((candidate) => candidate.contentHash === hash || candidate.content_hash === hash) || null;
}

function sentencePairs(pack) {
  return (pack.lessons || []).flatMap((lesson) => (lesson.sentences || []).map((sentence) => `${sentence.text}\u0000${sentence.translation}`));
}

function tokenSimilarity(left, right) {
  const a = new Set(String(left || "").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const b = new Set(String(right || "").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / new Set([...a, ...b]).size;
}

function countSentences(pack) { return pack.lessons.reduce((total, lesson) => total + lesson.sentences.length, 0); }
function slugifyPackTitle(title) { return String(title || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "fydor-pack"; }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function issue(path, message) { return { path, message: `${message}.` }; }
function packError(status, code, message, issues) { const error = httpError(status, code, message); error.issues = issues; return error; }

module.exports = {
  MAX_PACK_BYTES, MAX_PACK_DEPTH, MAX_PACK_LESSONS, MAX_PACK_SENTENCES, SUPPORTED_LANGUAGES,
  canonicalizePack, computePackContentHash, countSentences, detectNearDuplicates, findExactDuplicate,
  parseAndValidatePack, slugifyPackTitle, stableStringify
};
