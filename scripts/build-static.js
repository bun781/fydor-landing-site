"use strict";

const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const output = join(root, "public");

const entries = [
  "about.html",
  "admin.html",
  "app-client.js",
  "assets",
  "contribute.html",
  "contribute.js",
  "downloads",
  "index.html",
  "library.html",
  "library.js",
  "library-section.js",
  "moderate.html",
  "moderate.js",
  "script.js",
  "styles.css",
  "workspace.css",
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const entry of entries) {
  cpSync(join(root, entry), join(output, entry), { recursive: true });
}

console.log(`Prepared ${entries.length} static entries in public/.`);
