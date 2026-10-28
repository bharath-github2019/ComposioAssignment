// Inlines the guide library and catalog into one self-contained HTML file.
// Usage: node build.mjs            -> dist/index.html (static, uses Claude in-viewer generation)
//        node build.mjs --server   -> dist/server.html (calls /api/generate on the local server)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const guides = JSON.parse(readFileSync("data/guides.json", "utf8"));
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));

// Merge any guides the batch script generated (data/generated/*.json), library first.
const extra = [];
if (existsSync("data/generated")) {
  const { readdirSync } = await import("node:fs");
  for (const f of readdirSync("data/generated")) {
    if (!f.endsWith(".json")) continue;
    const g = JSON.parse(readFileSync(`data/generated/${f}`, "utf8"));
    if (!guides.find((x) => x.id === g.id)) extra.push(g);
  }
}

const safe = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
let html = readFileSync("src/app.html", "utf8")
  .replace("/*__GUIDES__*/[]", safe([...guides, ...extra]))
  .replace("/*__CATALOG__*/[]", safe(catalog));

const serverMode = process.argv.includes("--server");
if (serverMode) {
  html = html.replace("<title>", '<meta name="approval-path-api" content="/api/generate">\n<title>');
}
mkdirSync("dist", { recursive: true });
const out = serverMode ? "dist/server.html" : "dist/index.html";
writeFileSync(out, html);
console.log(`Wrote ${out} with ${guides.length + extra.length} guides and ${catalog.length} catalog apps.`);
