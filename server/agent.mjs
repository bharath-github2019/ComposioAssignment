// Research agent: identify -> research (web search + page probes) -> evidence audit -> skeptical review.
// Requires Node 18+ (global fetch) and ANTHROPIC_API_KEY in the environment. No npm dependencies.

const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 10);

async function callClaude(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, ...body }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

function extractJSON(text) {
  const t = text.replace(/```json|```/g, "").trim();
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Agent reply contained no JSON.");
  return JSON.parse(t.slice(start, end + 1));
}
const textOf = (msg) => msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

// ---------- Tool the agent can call: probe a setup page ----------
// Fetches a URL without credentials and reports what an unauthenticated agent can reach.
// This is the "attempt the setup" step: it shows where automation stops (login wall, 404, bot block).
export async function probePage(url) {
  const chain = [];
  let current = url;
  try {
    for (let i = 0; i < 6; i++) {
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "ApprovalPathProbe/1.0 (+setup-guide research; no login attempted)" },
        signal: AbortSignal.timeout(12000),
      });
      chain.push({ url: current, status: res.status });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); continue; }
      const body = res.status < 400 ? (await res.text()).slice(0, 200000) : "";
      const title = (body.match(/<title[^>]*>([^<]{0,200})/i) || [])[1]?.trim() || "";
      const loginWall = /login|signin|sign-in|auth|sso|accounts\./i.test(current) || /type=["']password["']/i.test(body);
      const fields = [...body.matchAll(/<label[^>]*>([^<]{2,60})<\/label>/gi)].slice(0, 15).map((m) => m[1].trim());
      return { requested: url, finalUrl: current, status: res.status, title, loginWall, visibleFormLabels: fields, redirects: chain };
    }
    return { requested: url, error: "Too many redirects", redirects: chain };
  } catch (e) {
    return { requested: url, error: String(e.message || e), redirects: chain };
  }
}

const PROBE_TOOL = {
  name: "probe_page",
  description:
    "Fetch a provider's developer portal or app-registration page WITHOUT logging in, and report the HTTP status, redirects, final URL, page title, whether a login wall was hit, and any visible form labels. Use it on the exact page where a developer would create the OAuth app, and on the app-review policy page. Results are recorded as 'tested' evidence.",
  input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
};

const SCHEMA = `{"name":string,"domain":string,"category":string,"startUrl":string,
 "headline":string,
 "paths":[{"name":string,"tier":"self-serve"|"customer-approval"|"restricted"|"paid"|"review-required"|"gated"|"no-oauth","hands":[minMinutes,maxMinutes],"wait":[minMinutes,maxMinutes],"waitUnknown":boolean,"note":string}],
 "prereqs":[{"t":string,"ev":EV,"src":[sourceId]}],
 "steps":[{"t":string,"d":string,"who":"you"|"agent"|"both","ev":EV,"src":[sourceId]}],
 "nuances":[{"t":string,"d":string,"impact":"high"|"medium"|"low","ev":EV,"src":[sourceId]}],
 "blockers":[{"if":string,"then":string}],
 "agent":{"can":[string],"you":[string]},
 "tested":[{"what":string,"result":string}],
 "uncertain":[string],
 "sources":[{"id":string,"title":string,"url":string,"kind":"official"|"third-party"|"probe"}]}
EV is one of: "tested" (only for facts observed with probe_page), "docs" (stated on the provider's own site), "report" (stated by a third party), "model" (your own knowledge, not found in a source).`;

// ---------- Pipeline ----------
export async function generateGuide(query, id, emit = () => {}) {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Identify
  emit({ type: "stage", stage: "identify", status: "run" });
  const idMsg = await callClaude({
    max_tokens: 600,
    messages: [{ role: "user", content: `A developer typed "${query}" because their users need to connect this app to an AI agent. Identify the product. Return ONLY JSON: {"recognized":boolean,"name":string,"domain":string,"category":string,"oauth":"yes"|"no"|"unclear","confidence":"high"|"medium"|"low","why":string}. If you do not know it, set recognized false and do not guess.` }],
  });
  const ident = extractJSON(textOf(idMsg));
  emit({ type: "stage", stage: "identify", status: "done", note: `${ident.name || query} (${ident.domain || "?"}). OAuth: ${ident.oauth}. Confidence: ${ident.confidence}.` });

  // 2. Research with web search + probes
  emit({ type: "stage", stage: "draft", status: "run", note: "Searching provider docs and probing setup pages…" });
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }, PROBE_TOOL];
  const seenUrls = new Set();
  const probes = [];
  const messages = [{
    role: "user",
    content: `Research how a developer sets up and gets approval for their own OAuth app with ${ident.name || query} (${ident.domain || query}), so their AI agent's end users can connect accounts. Today is ${today}.

Investigate: where the app is registered; what it requires (company page, verified domain, privacy policy, paid plan, demo video); which scopes or features trigger review; review/verification process and realistic wait; distribution limits (test users, install caps, marketplace rules, rate limits for unlisted apps); recent policy or pricing changes; what blocks people.
Use web_search for the provider's own docs first, then reputable integration vendors' runbooks. Use probe_page on the registration page and the review policy page to see what an unauthenticated agent can reach.
Split the guide into "paths" by what access the developer needs, easiest first. Times in minutes. Be honest: if no source gives a wait time, set waitUnknown true and say so in "uncertain". Do not cite a URL you did not see in search results or probe.

When done, reply with ONLY a JSON object of this shape:
${SCHEMA}`,
  }];

  let final;
  for (let turn = 0; turn < 12; turn++) {
    const msg = await callClaude({ tools, messages });
    for (const b of msg.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) b.content.forEach((r) => r.url && seenUrls.add(r.url));
      if (b.type === "server_tool_use" && b.input?.query) emit({ type: "stage", stage: "draft", status: "run", note: `Searching: ${b.input.query}` });
    }
    messages.push({ role: "assistant", content: msg.content });
    if (msg.stop_reason === "tool_use") {
      const results = [];
      for (const b of msg.content.filter((x) => x.type === "tool_use" && x.name === "probe_page")) {
        emit({ type: "stage", stage: "draft", status: "run", note: `Probing ${b.input.url}` });
        const r = await probePage(b.input.url);
        probes.push(r);
        seenUrls.add(b.input.url);
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(r) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (msg.stop_reason === "pause_turn") continue;
    final = extractJSON(textOf(msg));
    break;
  }
  if (!final) throw new Error("Research did not finish within the turn limit.");

  // 3. Evidence audit (deterministic): every sourced claim must point at a URL the agent actually saw.
  const audit = auditEvidence(final, seenUrls, probes);
  emit({ type: "stage", stage: "draft", status: "done", note: `${seenUrls.size} pages seen, ${probes.length} probes. ${audit.downgraded} claim(s) downgraded to Unverified for missing or unseen sources.` });

  // 4. Skeptical review
  emit({ type: "stage", stage: "review", status: "run" });
  let review = [];
  try {
    const r = await callClaude({
      max_tokens: 1200,
      messages: [{ role: "user", content: `You are a skeptical reviewer. Today is ${today}. Review this OAuth setup guide for ${final.name}. Flag up to 5 claims that look outdated, overconfident, or unsupported by their evidence label. Return ONLY JSON {"flags":[string]}.\n\n${JSON.stringify(final)}` }],
    });
    review = (extractJSON(textOf(r)).flags || []).slice(0, 5).map(String);
    emit({ type: "stage", stage: "review", status: "done", note: review.length ? `${review.length} flag(s).` : "Nothing flagged." });
  } catch {
    emit({ type: "stage", stage: "review", status: "fail", note: "Review failed; guide shown without it." });
  }

  const guide = {
    ...final, id, mode: "generated", checked: today, review,
    genNote: `Researched live with web search (${seenUrls.size} pages) and ${probes.length} unauthenticated page probe(s). Labels show where each claim came from; nothing here was confirmed by a human.`,
    tested: (final.tested || []).map((t) => ({ ...t, date: today })),
  };
  return guide;
}

export function auditEvidence(g, seenUrls, probes) {
  let downgraded = 0;
  const seen = (u) => [...seenUrls].some((s) => s === u || s.replace(/\/$/, "") === String(u).replace(/\/$/, ""));
  g.sources = (g.sources || []).filter((s) => s.url && seen(s.url));
  const valid = new Set(g.sources.map((s) => s.id));
  for (const k of ["prereqs", "steps", "nuances"]) {
    for (const it of g[k] || []) {
      it.src = (it.src || []).filter((id) => valid.has(id));
      if (it.ev === "tested" && !probes.length) { it.ev = "model"; downgraded++; }
      else if ((it.ev === "docs" || it.ev === "report") && !it.src.length) { it.ev = "model"; downgraded++; }
      if (!["tested", "docs", "report", "model"].includes(it.ev)) it.ev = "model";
    }
  }
  return { downgraded };
}
