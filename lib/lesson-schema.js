"use strict";

const { createHash } = require("node:crypto");

const MAX_BYTES = 1_000_000;
const MAX_DEPTH = 24;
const MAX_SENTENCES = 100;
const MAX_STRING = 20_000;
const SUPPORTED_LANGUAGES = new Set([
  "ar", "bn", "cs", "da", "de", "el", "en", "es", "fa", "fi", "fil", "fr", "he", "hi",
  "hu", "id", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sv", "sw",
  "ta", "th", "tr", "uk", "ur", "vi", "yue", "zh"
]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const BIDI_OR_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const HTML_RISK = /<\s*\/?\s*(script|style|iframe|object|embed|svg|math)|\bon\w+\s*=|javascript\s*:/iu;

const TOP_KEYS = ["schemaVersion", "language", "baseLanguage", "title", "description", "level", "tags", "sentences"];
const SENTENCE_KEYS = ["text", "translation", "words", "grammar", "chunks", "metadata", "notes"];
const WORD_KEYS = ["surface", "lemma", "meaning", "role", "explanation"];
const GRAMMAR_KEYS = ["pattern", "surface", "meaning", "explanation"];
const CHUNK_KEYS = ["surface", "meaning", "explanation", "type", "level", "tags"];

function extractJsonPayload(source) {
  const text = String(source ?? "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return text;
}

function parseAndValidateLesson(source, options = {}) {
  const text = extractJsonPayload(source);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > (options.maxBytes || MAX_BYTES)) return invalid(`Payload exceeds ${options.maxBytes || MAX_BYTES} bytes.`);
  if (!text) return invalid("Lesson JSON is empty.");

  try {
    scanJson(text, options.maxDepth || MAX_DEPTH);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Malformed JSON.");
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid("Malformed JSON.");
  }
  const result = validateLessonObject(value, options);
  if (!result.ok) return result;
  return { ...result, source: text };
}

function validateLessonObject(value, options = {}) {
  const errors = [];
  const warnings = [];
  validateRecord(value, "", TOP_KEYS, errors, options.strict !== false);
  if (!isRecord(value)) return { ok: false, errors, warnings };

  if (value.schemaVersion !== 1) errors.push(issue("schemaVersion", "must equal 1"));
  validateLanguage(value.language, "language", errors);
  validateLanguage(value.baseLanguage, "baseLanguage", errors);
  validateText(value.title, "title", errors, { required: true, max: 200 });
  validateText(value.description, "description", errors, { required: true, max: 4000 });
  validateText(value.level, "level", errors, { required: true, max: 80 });
  validateStringArray(value.tags, "tags", errors, 30, 80);

  if (!Array.isArray(value.sentences)) errors.push(issue("sentences", "must be an array"));
  else if (!value.sentences.length) errors.push(issue("sentences", "must contain at least one sentence"));
  else if (value.sentences.length > MAX_SENTENCES) errors.push(issue("sentences", `must contain at most ${MAX_SENTENCES} sentences`));

  const sentenceSet = new Set();
  for (const [index, sentence] of (Array.isArray(value.sentences) ? value.sentences : []).entries()) {
    const path = `sentences[${index}]`;
    validateRecord(sentence, path, SENTENCE_KEYS, errors, options.strict !== false);
    if (!isRecord(sentence)) continue;
    validateText(sentence.text, `${path}.text`, errors, { required: true, max: MAX_STRING });
    validateText(sentence.translation, `${path}.translation`, errors, { required: true, max: MAX_STRING });
    validateText(sentence.notes, `${path}.notes`, errors, { max: 4000 });
    if (sentence.metadata !== undefined && !isRecord(sentence.metadata)) errors.push(issue(`${path}.metadata`, "must be an object"));
    if (isRecord(sentence.metadata)) {
      validateRecord(sentence.metadata, `${path}.metadata`, [], errors, options.strict !== false);
    }
    if (typeof sentence.text === "string") {
      const normalized = sentence.text.normalize("NFC").trim().toLocaleLowerCase();
      if (sentenceSet.has(normalized)) errors.push(issue(`${path}.text`, "duplicates another sentence"));
      sentenceSet.add(normalized);
    }
    validateAnnotations(sentence.words, "word", WORD_KEYS, `${path}.words`, sentence.text, errors);
    validateAnnotations(sentence.grammar, "grammar", GRAMMAR_KEYS, `${path}.grammar`, sentence.text, errors);
    validateAnnotations(sentence.chunks, "chunk", CHUNK_KEYS, `${path}.chunks`, sentence.text, errors);
  }

  if (errors.length) return { ok: false, errors, warnings };
  const lesson = normalizeLesson(value);
  return { ok: true, errors, warnings, lesson, contentHash: contentHash(lesson) };
}

function validateAnnotations(items, kind, allowedKeys, path, sentenceText, errors) {
  if (items === undefined) return;
  if (!Array.isArray(items)) {
    errors.push(issue(path, "must be an array"));
    return;
  }
  if (items.length > 250) errors.push(issue(path, "contains too many annotations"));
  const seen = new Set();
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    validateRecord(item, itemPath, allowedKeys, errors, true);
    if (!isRecord(item)) return;
    const required = kind === "grammar" ? "pattern" : "surface";
    validateText(item[required], `${itemPath}.${required}`, errors, { required: true, max: 500 });
    const surface = kind === "grammar" ? (item.surface ?? item.pattern) : item.surface;
    if (kind === "grammar") validateText(item.surface, `${itemPath}.surface`, errors, { max: 500 });
    for (const field of allowedKeys.filter((key) => ![required, "surface", "tags"].includes(key))) {
      validateText(item[field], `${itemPath}.${field}`, errors, { max: 4000 });
    }
    if (item.tags !== undefined) validateStringArray(item.tags, `${itemPath}.tags`, errors, 20, 80);
    if (typeof surface === "string" && typeof sentenceText === "string" && !sentenceText.normalize("NFC").includes(surface.normalize("NFC"))) {
      errors.push(issue(`${itemPath}.surface`, "must occur verbatim in the sentence text"));
    }
    if (typeof surface === "string") {
      const key = `${kind}:${surface.normalize("NFC").toLocaleLowerCase()}`;
      if (seen.has(key)) errors.push(issue(itemPath, "duplicates another annotation of the same type"));
      seen.add(key);
    }
  });
}

function validateRecord(value, path, allowed, errors, strict) {
  if (!isRecord(value)) {
    errors.push(issue(path || "$", "must be an object"));
    return;
  }
  for (const key of Object.keys(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (DANGEROUS_KEYS.has(key)) errors.push(issue(keyPath, "uses a dangerous object key"));
    else if (strict && !allowed.includes(key)) errors.push(issue(keyPath, "is not an allowed field"));
  }
}

function validateLanguage(value, path, errors) {
  validateText(value, path, errors, { required: true, max: 16 });
  if (typeof value === "string" && !SUPPORTED_LANGUAGES.has(value.trim().toLowerCase())) errors.push(issue(path, "is not a supported language code"));
}

function validateText(value, path, errors, options = {}) {
  if (value === undefined) {
    if (options.required) errors.push(issue(path, "is required"));
    return;
  }
  if (typeof value !== "string") {
    errors.push(issue(path, "must be a string"));
    return;
  }
  if (options.required && !value.trim()) errors.push(issue(path, "cannot be empty"));
  if (value.length > (options.max || MAX_STRING)) errors.push(issue(path, `must contain at most ${options.max || MAX_STRING} characters`));
  if (BIDI_OR_CONTROL.test(value)) errors.push(issue(path, "contains disallowed control or bidirectional characters"));
  if (hasUnpairedSurrogate(value)) errors.push(issue(path, "contains invalid Unicode surrogate data"));
  if (HTML_RISK.test(value)) errors.push(issue(path, "contains unsafe HTML or a script-like URL"));
  if (value.includes("\uFFFD")) errors.push(issue(path, "contains invalid replacement characters"));
}

function validateStringArray(value, path, errors, maxItems, maxLength) {
  if (!Array.isArray(value)) {
    errors.push(issue(path, "must be an array"));
    return;
  }
  if (value.length > maxItems) errors.push(issue(path, `must contain at most ${maxItems} items`));
  const seen = new Set();
  value.forEach((item, index) => {
    validateText(item, `${path}[${index}]`, errors, { required: true, max: maxLength });
    if (typeof item === "string") {
      const key = item.normalize("NFC").trim().toLocaleLowerCase();
      if (seen.has(key)) errors.push(issue(`${path}[${index}]`, "duplicates another entry"));
      seen.add(key);
    }
  });
}

function normalizeLesson(value) {
  return deepMap(value, (text) => text.normalize("NFC").trim());
}

function deepMap(value, mapString) {
  if (typeof value === "string") return mapString(value);
  if (Array.isArray(value)) return value.map((item) => deepMap(item, mapString));
  if (isRecord(value)) {
    const output = Object.create(null);
    for (const [key, item] of Object.entries(value)) output[key] = deepMap(item, mapString);
    return output;
  }
  return value;
}

function contentHash(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
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
    if (source[index] !== '"') throw new Error("Malformed JSON string.");
    const start = index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return JSON.parse(source.slice(start, index));
      if (char === "\\") index += 1;
      else if (char < " ") throw new Error("Malformed JSON string.");
    }
    throw new Error("Unterminated JSON string.");
  }
  function value(depth) {
    if (depth > maxDepth) throw new Error(`JSON nesting exceeds ${maxDepth} levels.`);
    whitespace();
    const char = source[index];
    if (char === "{") return object(depth + 1);
    if (char === "[") return array(depth + 1);
    if (char === '"') { string(); return; }
    const token = source.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    if (!token) throw new Error("Malformed JSON value.");
    index += token.length;
  }
  function object(depth) {
    index += 1; whitespace();
    const keys = new Set();
    if (source[index] === "}") { index += 1; return; }
    while (true) {
      whitespace(); const key = string();
      if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}.`);
      if (DANGEROUS_KEYS.has(key)) throw new Error(`Dangerous JSON key: ${key}.`);
      keys.add(key); whitespace();
      if (source[index++] !== ":") throw new Error("Malformed JSON object.");
      value(depth); whitespace();
      if (source[index] === "}") { index += 1; return; }
      if (source[index++] !== ",") throw new Error("Malformed JSON object.");
    }
  }
  function array(depth) {
    index += 1; whitespace();
    if (source[index] === "]") { index += 1; return; }
    while (true) {
      value(depth); whitespace();
      if (source[index] === "]") { index += 1; return; }
      if (source[index++] !== ",") throw new Error("Malformed JSON array.");
    }
  }
  value(0); whitespace();
  if (index !== source.length) throw new Error("Mixed content is not valid lesson JSON.");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true;
  }
  return false;
}

function issue(path, message) { return `${path}: ${message}.`; }
function invalid(message) { return { ok: false, errors: [message], warnings: [] }; }

module.exports = {
  MAX_BYTES, MAX_DEPTH, MAX_SENTENCES, SUPPORTED_LANGUAGES, contentHash, extractJsonPayload,
  parseAndValidateLesson, stableStringify, validateLessonObject
};
