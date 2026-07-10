import { expectJson } from "./app-client.js";

export function initPublicLibrary(root = document) {
  const section = root.querySelector("[data-public-library]");
  if (!section || section.dataset.initialized) return;
  section.dataset.initialized = "true";

  let page = 1;
  const target = section.querySelector("[data-library]");
  const status = section.querySelector("[data-library-status]");
  const more = section.querySelector("[data-more]");
  const retry = section.querySelector("[data-library-retry]");
  const find = section.querySelector("[data-find]");

  find.addEventListener("click", () => { page = 1; target.replaceChildren(); load(); });
  more.addEventListener("click", () => { page += 1; load(); });
  retry.addEventListener("click", () => load());
  load();

  async function load() {
    setLoading(true);
    status.textContent = "Loading published lessons…";
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        q: section.querySelector("[data-search]").value,
        language: section.querySelector("[data-language]").value,
        baseLanguage: section.querySelector("[data-base-language]").value,
        level: section.querySelector("[data-level]").value,
        tag: section.querySelector("[data-tag]").value,
        sort: section.querySelector("[data-sort]").value
      });
      for (const [key, value] of [...params]) if (!value) params.delete(key);
      const data = await fetch(`/api/library?${params}`).then(expectJson);
      for (const lesson of data.lessons) target.append(renderLesson(lesson));
      status.textContent = data.lessons.length || page > 1
        ? `${target.children.length} lesson(s) loaded.`
        : "No published lessons match these filters.";
      status.className = "workspace-success";
      more.hidden = !data.hasMore;
      retry.hidden = true;
    } catch (error) {
      status.textContent = `Unable to load the public library: ${error.message}`;
      status.className = "workspace-error";
      retry.hidden = false;
      more.hidden = true;
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    find.disabled = loading;
    more.disabled = loading;
    retry.disabled = loading;
  }
}

function renderLesson(lesson) {
  const card = document.createElement("article");
  card.className = "sentence-review";
  card.append(
    node("h3", lesson.title),
    node("p", lesson.description),
    node("p", `${lesson.targetLanguage} → ${lesson.baseLanguage} · ${lesson.level} · ${lesson.sentenceCount} sentences · version ${lesson.lessonVersion}`),
    node("p", `${lesson.license} · ${lesson.compatibility} · checksum ${lesson.checksum}`)
  );
  const link = document.createElement("a");
  link.className = "button secondary";
  link.href = `/api/library?id=${encodeURIComponent(lesson.id)}&download=1`;
  link.textContent = "Download verified Fydor pack";
  link.setAttribute("aria-label", `Download ${lesson.title} for import into Fydor`);
  card.append(link);
  return card;
}

function node(tag, value) {
  const element = document.createElement(tag);
  element.textContent = String(value ?? "");
  return element;
}
