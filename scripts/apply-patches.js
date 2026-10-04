// postinstall: applies patches/*.patch to node_modules. Replaces patch-package,
// whose own dependency chain (find-yarn-workspace-root → micromatch → braces)
// carried high-severity advisories with no fixed release.
//
// Supports what patches/ actually contains: unified diffs against files under
// node_modules. Each hunk (context + removed lines) must be found exactly once
// in the target file and is replaced by its context + added lines. A hunk whose
// result is already present is skipped, so re-running is harmless. Anything
// else — the dependency changed underneath the patch — fails the install
// instead of silently shipping an unpatched package.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const patchDir = path.join(root, "patches");

function parseHunks(patchText) {
  const hunks = [];
  let target = null;
  let hunk = null;
  for (const line of patchText.split("\n")) {
    if (line.startsWith("+++ b/")) {
      target = line.slice("+++ b/".length);
      hunk = null;
    } else if (line.startsWith("@@")) {
      hunk = { target, before: [], after: [] };
      hunks.push(hunk);
    } else if (hunk && !line.startsWith("\\")) {
      const body = line.slice(1);
      if (line.startsWith("-")) hunk.before.push(body);
      else if (line.startsWith("+")) hunk.after.push(body);
      else if (line.startsWith(" ") || line === "") {
        hunk.before.push(body);
        hunk.after.push(body);
      }
    }
  }
  // A trailing blank line in the patch file is not part of the last hunk.
  for (const h of hunks) {
    while (h.before.at(-1) === "" && h.after.at(-1) === "") {
      h.before.pop();
      h.after.pop();
    }
  }
  return hunks;
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

const patchFiles = fs.existsSync(patchDir) ? fs.readdirSync(patchDir).filter((f) => f.endsWith(".patch")) : [];

for (const file of patchFiles) {
  for (const hunk of parseHunks(fs.readFileSync(path.join(patchDir, file), "utf8"))) {
    const targetPath = path.join(root, hunk.target);
    const source = fs.readFileSync(targetPath, "utf8");
    const before = hunk.before.join("\n");
    const after = hunk.after.join("\n");

    if (count(source, before) === 1) {
      fs.writeFileSync(targetPath, source.replace(before, after));
      console.log(`apply-patches: ${file} → ${hunk.target} (applied)`);
    } else if (count(source, after) === 1) {
      console.log(`apply-patches: ${file} → ${hunk.target} (already applied)`);
    } else {
      console.error(`apply-patches: ${file} no longer matches ${hunk.target} — the package changed; review the patch.`);
      process.exit(1);
    }
  }
}
