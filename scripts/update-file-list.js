import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const EXCLUDE_FILES = ["App.tsx"];
const EXCLUDE_DIRS = ["__zite__"];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir.toString(), entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) {
        files.push(...(await listFiles(full)));
      }
    } else {
      const rel = relative(SRC, full);
      if (!EXCLUDE_FILES.includes(rel) && !entry.name.endsWith(".d.ts")) {
        files.push(rel);
      }
    }
  }
  return files.sort();
}

const files = await listFiles(SRC);
writeFileSync(join(ROOT, "starter-files.json"), JSON.stringify(files, null, 2) + "\n");
console.log(`Wrote ${files.length} files to starter-files.json`);
