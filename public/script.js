const platform = String(navigator.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
const userAgent = navigator.userAgent.toLowerCase();
const isMac = platform.includes("mac") || userAgent.includes("mac os") || userAgent.includes("macintosh");
const isWindows = platform.includes("win") || userAgent.includes("windows");
const DOWNLOAD_COUNT_KEY = "fydor-website-download-count-v1";
const BASE_DOWNLOAD_COUNT = 162;
const DOWNLOAD_COUNT_ENDPOINT = "/api/download-count";

const preferredPlatform = isMac ? "mac" : isWindows ? "windows" : null;

if (preferredPlatform) {
  document
    .querySelectorAll(`[data-platform="${preferredPlatform}"]`)
    .forEach((element) => {
      element.classList.add("recommended");
    });
}

const downloadCountNodes = [...document.querySelectorAll("[data-download-count]")];
const currentCount = Number.parseInt(window.localStorage.getItem(DOWNLOAD_COUNT_KEY) ?? "", 10);
let downloadCount = Number.isFinite(currentCount) && currentCount >= BASE_DOWNLOAD_COUNT ? currentCount : BASE_DOWNLOAD_COUNT;

function renderDownloadCount() {
  downloadCountNodes.forEach((node) => {
    node.textContent = new Intl.NumberFormat().format(downloadCount);
  });
}

function setDownloadCount(count) {
  if (!Number.isFinite(count) || count < BASE_DOWNLOAD_COUNT) return;
  downloadCount = count;
  window.localStorage.setItem(DOWNLOAD_COUNT_KEY, String(downloadCount));
  renderDownloadCount();
}

async function refreshDownloadCount() {
  try {
    const response = await fetch(DOWNLOAD_COUNT_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) return;

    const data = await response.json();
    setDownloadCount(Number(data.count));
  } catch {
    renderDownloadCount();
  }
}

async function incrementDownloadCount() {
  setDownloadCount(downloadCount + 1);

  try {
    const response = await fetch(DOWNLOAD_COUNT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ source: "download-button" }),
      cache: "no-store",
      keepalive: true
    });
    if (!response.ok) return;

    const data = await response.json();
    setDownloadCount(Number(data.count));
  } catch {
    renderDownloadCount();
  }
}

function startDownload(link) {
  const downloadLink = document.createElement("a");
  downloadLink.href = link.href;
  downloadLink.download = link.getAttribute("download") ?? "";
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

renderDownloadCount();
refreshDownloadCount();
window.setInterval(refreshDownloadCount, 30000);

document.querySelectorAll(".download-button").forEach((button) => {
  button.addEventListener("click", (event) => {
    if (!(button instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    incrementDownloadCount();
    startDownload(button);
  });
});
