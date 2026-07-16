import { api } from "./app-client.js";

const panel = document.querySelector("[data-admin]");
const loading = document.querySelector("[data-admin-loading]");
const usersTable = document.querySelector("[data-users]");
const packsTable = document.querySelector("[data-packs]");
const status = document.querySelector("[data-admin-status]");
let currentRoles = [];

void initialize();
document.querySelector("[data-search]").addEventListener("click", search);
document.querySelector("[data-refresh-packs]").addEventListener("click", loadPacks);

async function initialize() {
  if (sessionStorage.getItem("fydor-admin-entry") !== "contribute") return redirectToContribution();
  loading.hidden = false;
  status.className = "";
  status.textContent = "Checking administration access…";
  try {
    currentRoles = (await api("/api/admin?action=me")).roles;
    panel.hidden = false;
    loading.hidden = true;
    await Promise.all([search(), loadPacks()]);
  } catch (error) {
    panel.hidden = true;
    status.textContent = `Couldn't verify administration access. ${error.message || "Try again."}`;
    status.className = "workspace-error";
    showRetry();
  }
}

function showRetry() {
  if (loading.querySelector("[data-admin-retry]")) return;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button secondary";
  retry.dataset.adminRetry = "";
  retry.textContent = "Try again";
  retry.addEventListener("click", initialize);
  loading.append(retry);
}

function redirectToContribution() {
  sessionStorage.removeItem("fydor-admin-entry");
  location.replace("contribute.html?access=admin");
}

async function search() {
  try {
    const q = document.querySelector("[data-user-search]").value;
    const data = await api(`/api/admin?action=users&q=${encodeURIComponent(q)}`);
    usersTable.replaceChildren(...data.users.map(renderUser));
    setStatus(`${data.users.length} user(s).`, true);
  } catch (error) { setStatus(error.message); }
}

async function loadPacks() {
  try {
    const data = await api("/api/admin?action=packs");
    packsTable.replaceChildren(...data.packs.filter((pack) => !pack.archived_at).map(renderPack));
    if (!data.packs.some((pack) => !pack.archived_at)) packsTable.append(emptyRow("No published packs."));
  } catch (error) { setStatus(error.message); }
}

function renderUser(user) {
  const tr = document.createElement("tr");
  const activeAssignments = user.user_roles?.filter((item) => !item.suspended_at && (!item.expires_at || Date.parse(item.expires_at) > Date.now())) || [];
  const roles = activeAssignments.map((item) => item.roles?.name).filter(Boolean);
  tr.append(cell(user.email), cell(user.verified_at ? "Verified" : "Not verified"), cell(roles.join(", ") || "user"));
  const inputCell = document.createElement("td"); const languageInput = document.createElement("input"); languageInput.placeholder = "ko, ja, zh"; inputCell.append(languageInput); tr.append(inputCell);
  const actions = document.createElement("td"); actions.className = "workspace-actions";
  const moderatorAssignment = activeAssignments.find((item) => item.roles?.name === "moderator");
  actions.append(roleButton({ label: moderatorAssignment ? "Remove moderator" : "Grant moderator", disabled: !user.verified_at, action: "set_moderator", body: { userId: user.id, enabled: !moderatorAssignment, expectedVersion: moderatorAssignment?.version || 0 }, reasonLabel: "moderator access" }, () => languageInput.value.split(",").map((item) => item.trim()).filter(Boolean)));
  if (currentRoles.includes("super_admin")) { const adminAssignment = activeAssignments.find((item) => item.roles?.name === "admin"); actions.append(roleButton({ label: adminAssignment ? "Remove admin" : "Grant admin", disabled: !user.verified_at, action: "set_administrator", body: { userId: user.id, enabled: !adminAssignment }, reasonLabel: "administrator access" })); }
  tr.append(actions); return tr;
}

function renderPack(pack) {
  const tr = document.createElement("tr");
  tr.append(cell(pack.title), cell(`${pack.target_language} → ${pack.base_language}`), cell(new Date(pack.published_at).toLocaleString()));
  const actions = document.createElement("td"); const button = document.createElement("button"); button.className = "button secondary"; button.textContent = "Delete public pack";
  button.addEventListener("click", async () => { const reason = window.prompt(`Reason for deleting “${pack.title}” from the public library:`); if (!reason || !window.confirm("Archive this submission and delete its public pack file?")) return; button.disabled = true; try { await api("/api/admin", { method: "POST", body: { action: "delete_pack", submissionId: pack.submission_id, reason } }); await loadPacks(); setStatus("Public pack deleted and submission archived.", true); } catch (error) { setStatus(error.message); button.disabled = false; } });
  actions.append(button); tr.append(actions); return tr;
}

function roleButton(config, currentLanguages) { const button = document.createElement("button"); button.className = "button secondary"; button.textContent = config.label; button.disabled = config.disabled; button.addEventListener("click", async () => { const reason = window.prompt(`Reason to change ${config.reasonLabel}:`); if (!reason) return; try { const body = { action: config.action, ...config.body, reason }; if (currentLanguages) body.languages = currentLanguages(); await api("/api/admin", { method: "POST", body }); await search(); setStatus("Permissions updated.", true); } catch (error) { setStatus(error.message); } }); return button; }
function emptyRow(message) { const tr = document.createElement("tr"); const td = cell(message); td.colSpan = 4; tr.append(td); return tr; }
function cell(value) { const td = document.createElement("td"); td.textContent = String(value ?? ""); return td; }
function setStatus(message, success = false) { status.textContent = message; status.className = success ? "workspace-success" : "workspace-error"; }
