// Lists every page and static asset of the exported site in out/precache.json
// so the service worker can make the whole app available offline.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? "out";
const out = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const rel = relative(root, p).split("\\").join("/");
      if (rel.endsWith("index.html")) out.push(rel.slice(0, -"index.html".length));
      else if (rel.startsWith("_next/static/") && /\.(js|css)$/.test(rel)) out.push(rel);
    }
  }
}
walk(root);
out.sort();
writeFileSync(join(root, "precache.json"), JSON.stringify(out));
console.log(`precache.json: ${out.length} entries`);
