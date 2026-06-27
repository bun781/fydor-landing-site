const platform = navigator.platform.toLowerCase();
const userAgent = navigator.userAgent.toLowerCase();
const isMac = platform.includes("mac") || userAgent.includes("mac os");
const isWindows = platform.includes("win") || userAgent.includes("windows");

const preferredPlatform = isMac ? "mac" : isWindows ? "windows" : null;

if (preferredPlatform) {
  document
    .querySelectorAll(`[data-platform="${preferredPlatform}"]`)
    .forEach((element) => {
      element.classList.add("recommended");
    });
}

