"use strict";

const { createHash } = require("node:crypto");
const { stableStringify } = require("./lesson-schema");
const { httpError } = require("./http");

const MAX_PACK_BYTES = 5_000_000;
const MAX_PACK_DEPTH = 24;
const MAX_PACK_LESSONS = 80;
const MAX_PACK_SENTENCES = 2_000;
const MAX_STRING = 20_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const BIDI_OR_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const HTML_RISK = /<\s*\/?\s*(script|style|iframe|object|embed|svg|math)|\bon\w+\s*=|javascript\s*:/iu;

function parseAndValidatePack(source) {
  const text = typeof source === "string" ? source.trim() : JSON.stringify(source ?? {});
  if (!text) throw httpError(400, "empty_pack", "Pack data is required.");
  if (Buffer.byteLength(text, "utf8") > MAX_PACK_BYTES) {
    throw httpError(413, "payload_too_large", "Pack data is too large.");
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw httpError(400, "invalid_json", "Pack data must be valid JSON.");
  }
  scanValue(value, 0);

  const errors = [];
  validatePack(value, errors);
  if (errors.length) throw httpError(422, "invalid_pack", errors.slice(0, 8).join(" "));

  const pack = normalize(value);
  const checksum = createHash("sha256").update(stableStringify(pack), "utf8").digest("hex");
  return {
    pack,
    checksum,
    sentenceCount: countSentences(pack),
    byteLength: Buffer.byteLength(JSON.stringify(pack, null, 2), "utf8")
  };
}

function validatePack(value, errors) {
  if (!isRecord(value)) {
    errors.push("Pack must be an object.");
    return;
  }
  if (value.type !== "fydor_pack") errors.push("Pack type must be fydor_pack.");
  if (value.schemaVersion !== 1) errors.push("Pack schemaVersion must be 1.");
  validateText(value.id, "id", errors, { required: true, max: 160, pattern: /^[A-Za-z0-9._:-]+$/ });
  validateText(value.title, "title", errors, { required: true, max: 200 });
  validateText(value.description, "description", errors, { max: 4000 });
  validateAuthor(value.author, errors);
  validateText(value.version, "version", errors, { required: true, max: 80, pattern: /^[A-Za-z0-9._:+-]+$/ });
  validateText(value.license, "license", errors, { max: 120 });
  validateText(value.language, "language", errors, { required: true, max: 16 });
  validateText(value.baseLanguage, "baseLanguage", errors, { required: true, max: 16 });
  validateText(value.level, "level", errors, { max: 80 });
  validateStringArray(value.tags, "tags", errors, 30, 80, false);
  validateIsoDate(value.createdAt, "createdAt", errors);
  validateIsoDate(value.updatedAt, "updatedAt", errors);

  if (!Array.isArray(value.lessons) || !value.lessons.length) {
    errors.push("lessons must contain at least one lesson.");
    return;
  }
  if (value.lessons.length > MAX_PACK_LESSONS) errors.push(`lessons must contain at most ${MAX_PACK_LESSONS} lessons.`);
  let sentenceCount = 0;
  value.lessons.forEach((lesson, index) => {
    validateLesson(lesson, `lessons[${index}]`, errors);
    sentenceCount += Array.isArray(lesson?.sentences) ? lesson.sentences.length : 0;
  });
  if (sentenceCount > MAX_PACK_SENTENCES) errors.push(`Pack must contain at most ${MAX_PACK_SENTENCES} sentences.`);
}

function validateLesson(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateText(value.language, `${path}.language`, errors, { required: true, max: 16 });
  validateText(value.baseLanguage, `${path}.baseLanguage`, errors, { required: true, max: 16 });
  validateText(value.title, `${path}.title`, errors, { required: true, max: 200 });
  validateText(value.description, `${path}.description`, errors, { max: 4000 });
  validateText(value.source, `${path}.source`, errors, { max: 4000 });
  validateText(value.level, `${path}.level`, errors, { max: 80 });
  validateStringArray(value.tags, `${path}.tags`, errors, 30, 80, false);
  if (!Array.isArray(value.sentences) || !value.sentences.length) {
    errors.push(`${path}.sentences must contain at least one sentence.`);
    return;
  }
  const seen = new Set();
  value.sentences.forEach((sentence, index) => {
    validateSentence(sentence, `${path}.sentences[${index}]`, errors);
    if (typeof sentence?.text === "string") {
      const key = sentence.text.normalize("NFC").trim().toLocaleLowerCase();
      if (seen.has(key)) errors.push(`${path}.sentences[${index}].text duplicates another sentence.`);
      seen.add(key);
    }
  });
}

function validateSentence(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateText(value.text, `${path}.text`, errors, { required: true, max: MAX_STRING });
  validateText(value.translation, `${path}.translation`, errors, { max: MAX_STRING });
  validateAnnotations(value.words, `${path}.words`, "surface", value.text, errors);
  validateAnnotations(value.grammar, `${path}.grammar`, "pattern", value.text, errors);
  validateAnnotations(value.chunks, `${path}.chunks`, "surface", value.text, errors);
}

function validateAnnotations(items, path, requiredField, sentenceText, errors) {
  if (items === undefined) return;
  if (!Array.isArray(items)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (items.length > 250) errors.push(`${path} contains too many annotations.`);
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object.`);
      return;
    }
    validateText(item[requiredField], `${itemPath}.${requiredField}`, errors, { required: true, max: 500 });
    validateText(item.surface, `${itemPath}.surface`, errors, { max: 500 });
    for (const key of ["lemma", "meaning", "role", "explanation", "type", "level"]) {
      validateText(item[key], `${itemPath}.${key}`, errors, { max: 4000 });
    }
    validateStringArray(item.tags, `${itemPath}.tags`, errors, 20, 80, false);
    const surface = item.surface || item[requiredField];
    if (typeof surface === "string" && typeof sentenceText === "string" && !sentenceText.normalize("NFC").includes(surface.normalize("NFC"))) {
      errors.push(`${itemPath}.surface must occur in the sentence text.`);
    }
  });
}

function validateAuthor(value, errors) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push("author must be an object.");
    return;
  }
  validateText(value.name, "author.name", errors, { max: 200 });
  validateText(value.organization, "author.organization", errors, { max: 200 });
  validateText(value.url, "author.url", errors, { max: 500 });
  if (typeof value.url === "string" && value.url.trim()) {
    try {
      const url = new URL(value.url);
      if (!["http:", "https:"].includes(url.protocol)) errors.push("author.url must use HTTP or HTTPS.");
    } catch {
      errors.push("author.url must be a valid URL.");
    }
  }
}

function validateIsoDate(value, path, errors) {
  if (value === undefined) return;
  validateText(value, path, errors, { max: 80 });
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) errors.push(`${path} must be an ISO date.`);
}

function validateStringArray(value, path, errors, maxItems, maxLength, required) {
  if (value === undefined) {
    if (required) errors.push(`${path} is required.`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (value.length > maxItems) errors.push(`${path} must contain at most ${maxItems} items.`);
  const seen = new Set();
  value.forEach((item, index) => {
    validateText(item, `${path}[${index}]`, errors, { required: true, max: maxLength });
    if (typeof item === "string") {
      const key = item.normalize("NFC").trim().toLocaleLowerCase();
      if (seen.has(key)) errors.push(`${path}[${index}] duplicates another item.`);
      seen.add(key);
    }
  });
}

function validateText(value, path, errors, options = {}) {
  if (value === undefined || value === null) {
    if (options.required) errors.push(`${path} is required.`);
    return;
  }
  if (typeof value !== "string") {
    errors.push(`${path} must be a string.`);
    return;
  }
  const text = value.trim();
  if (options.required && !text) errors.push(`${path} cannot be empty.`);
  if (value.length > (options.max || MAX_STRING)) errors.push(`${path} is too long.`);
  if (options.pattern && !options.pattern.test(text)) errors.push(`${path} contains unsupported characters.`);
  if (BIDI_OR_CONTROL.test(value)) errors.push(`${path} contains disallowed control characters.`);
  if (HTML_RISK.test(value)) errors.push(`${path} contains unsafe HTML or script-like content.`);
}

function scanValue(value, depth) {
  if (depth > MAX_PACK_DEPTH) throw httpError(400, "invalid_json", `JSON nesting exceeds ${MAX_PACK_DEPTH} levels.`);
  if (Array.isArray(value)) {
    value.forEach((item) => scanValue(item, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) throw httpError(400, "invalid_json", `Dangerous JSON key: ${key}.`);
    scanValue(item, depth + 1);
  }
}

function normalize(value) {
  if (typeof value === "string") return value.normalize("NFC").trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (isRecord(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && item !== null) output[key] = normalize(item);
    }
    return output;
  }
  return value;
}

function countSentences(pack) {
  return pack.lessons.reduce((total, lesson) => total + lesson.sentences.length, 0);
}

function slugifyPackTitle(title) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "fydor-pack";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = { MAX_PACK_BYTES, parseAndValidatePack, slugifyPackTitle };
