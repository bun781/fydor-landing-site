import { api, setupAuth } from "./app-client.js";

const panel = document.querySelector("[data-admin]");
const usersTable = document.querySelector("[data-users]");
const status = document.querySelector("[data-admin-status]");
let currentRoles = [];

setupAuth(async () => {
  panel.hidden = false;
  currentRoles = (await api("/api/admin?action=me")).roles;
  await search();
});
document.querySelector("[data-search]").addEventListener("click", search);

async function search() {
  try {
    const q = document.querySelector("[data-user-search]").value;
    const data = await api(`/api/admin?action=users&q=${encodeURIComponent(q)}`);
    usersTable.replaceChildren();
    for (const user of data.users) usersTable.append(renderUser(user));
    setStatus(`${data.users.length} user(s).`, true);
  } catch (error) {
    setStatus(error.message);
  }
}

function renderUser(user) {
  const tr = document.createElement("tr");
  const activeAssignments = user.user_roles?.filter((item) => !item.suspended_at) || [];
  const roles = activeAssignments.map((item) => item.roles?.name).filter(Boolean);
  tr.append(cell(user.email), cell(user.verified_at ? "Verified" : "Not verified"), cell(roles.join(", ") || "user"));

  const inputCell = document.createElement("td");
  const languageInput = document.createElement("input");
  languageInput.placeholder = "ko, ja, zh";
  inputCell.append(languageInput);
  tr.append(inputCell);

  const actions = document.createElement("td");
  actions.className = "workspace-actions";
  const moderatorAssignment = activeAssignments.find((item) => item.roles?.name === "moderator");
  actions.append(roleButton({
    label: moderatorAssignment ? "Remove moderator" : "Grant moderator",
    disabled: !user.verified_at,
    action: "set_moderator",
    body: {
      userId: user.id,
      languages: languageInput.value.split(",").map((item) => item.trim()).filter(Boolean),
      enabled: !moderatorAssignment,
      expectedVersion: moderatorAssignment?.version || 0
    },
    reasonLabel: "moderator access"
  }, () => languageInput.value.split(",").map((item) => item.trim()).filter(Boolean)));

  if (currentRoles.includes("super_admin")) {
    const adminAssignment = activeAssignments.find((item) => item.roles?.name === "admin");
    actions.append(roleButton({
      label: adminAssignment ? "Remove admin" : "Grant admin",
      disabled: !user.verified_at,
      action: "set_administrator",
      body: { userId: user.id, enabled: !adminAssignment },
      reasonLabel: "administrator access"
    }));
  }
  tr.append(actions);
  return tr;
}

function roleButton(config, currentLanguages) {
  const button = document.createElement("button");
  button.className = "button secondary";
  button.textContent = config.label;
  button.disabled = config.disabled;
  button.addEventListener("click", async () => {
    const reason = window.prompt(`Reason to change ${config.reasonLabel}:`);
    if (!reason) return;
    try {
      const body = { action: config.action, ...config.body, reason };
      if (currentLanguages) body.languages = currentLanguages();
      await api("/api/admin", { method: "POST", body });
      await search();
      setStatus("Permissions updated.", true);
    } catch (error) {
      setStatus(error.message);
    }
  });
  return button;
}

function cell(value) {
  const td = document.createElement("td");
  td.textContent = String(value ?? "");
  return td;
}

function setStatus(message, success = false) {
  status.textContent = message;
  status.className = success ? "workspace-success" : "workspace-error";
}
