"use strict";

const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const files = walk(root).filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
// Public compatibility workspaces remain deployed until their App Router
// replacements are complete, so validate every checked-in HTML script link.
for (const file of walk(root).filter((item) => item.endsWith(".html") && relative(root, item).includes("/"))) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^https?:/.test(match[1])) continue;
    const target = resolve(file, "..", match[1].split("?")[0]);
    try { if (!statSync(target).isFile()) throw new Error(); }
    catch { throw new Error(`${relative(root, file)} references missing script ${match[1]}`); }
  }
}
console.log(`Checked ${files.length} JavaScript files and static HTML references.`);

function walk(dir) {
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", ".next", "node_modules", "downloads"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full)); else output.push(full);
  }
  return output;
}
