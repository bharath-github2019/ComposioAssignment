// Pre-generate guides for catalog apps that have no guide yet (the path to a 100-app library).
// Usage: node server/batch.mjs [limit]     e.g. node server/batch.mjs 10
// Then: node build.mjs   to inline the new guides into dist/index.html.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { generateGuide } from "./agent.mjs";

const limit = Number(process.argv[2] || 5);
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const done = new Set(JSON.parse(readFileSync("data/guides.json", "utf8")).map((g) => g.id));
mkdirSync("data/generated", { recursive: true });
const todo = catalog.filter((c) => !done.has(c.id) && !existsSync(`data/generated/${c.id}.json`)).slice(0, limit);

const CONCURRENCY = 2;
let i = 0;
async function worker() {
  while (i < todo.length) {
    const c = todo[i++];
    try {
      const g = await generateGuide(`${c.name} (${c.domain})`, c.id, (ev) => ev.note && console.log(`[${c.id}] ${ev.stage}: ${ev.note}`));
      writeFileSync(`data/generated/${c.id}.json`, JSON.stringify(g, null, 2));
      console.log(`[${c.id}] saved`);
    } catch (e) { console.error(`[${c.id}] failed: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
