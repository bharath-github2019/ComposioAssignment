// Minimal server: serves the app and streams live guide generation over SSE.
// Run: node build.mjs --server && node server/server.mjs   (reads ANTHROPIC_API_KEY from env or .env)
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { generateGuide } from "./agent.mjs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = Number(process.env.PORT || 8787);
const safeId = (s) => String(s || "app").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);

createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(readFileSync("dist/server.html"));
  }
  if (req.method === "GET" && req.url.startsWith("/api/guides/")) {
    const f = `data/generated/${safeId(req.url.split("/").pop())}.json`;
    if (!existsSync(f)) { res.writeHead(404); return res.end("{}"); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(readFileSync(f));
  }
  if (req.method === "POST" && req.url === "/api/generate") {
    let body = "";
    for await (const c of req) body += c;
    const { query, id } = JSON.parse(body || "{}");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    try {
      const guide = await generateGuide(String(query || "").slice(0, 200), safeId(id || query), emit);
      emit({ type: "stage", stage: "save", status: "run" });
      mkdirSync("data/generated", { recursive: true });
      writeFileSync(`data/generated/${guide.id}.json`, JSON.stringify(guide, null, 2));
      emit({ type: "stage", stage: "save", status: "done", note: `Saved to data/generated/${guide.id}.json` });
      emit({ type: "guide", guide });
    } catch (e) {
      emit({ type: "error", message: String(e.message || e) });
    }
    return res.end();
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log(`Approval Path running at http://localhost:${PORT}`));
