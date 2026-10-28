// Checks the evidence audit and the probe tool without needing an API key.
import assert from "node:assert";
import { auditEvidence, probePage } from "../server/agent.mjs";

const g = {
  sources: [{ id: "a", url: "https://seen.example/doc" }, { id: "b", url: "https://never-seen.example" }],
  steps: [
    { t: "cited and seen", ev: "docs", src: ["a"] },
    { t: "cited but unseen", ev: "docs", src: ["b"] },
    { t: "claims tested with no probes", ev: "tested", src: [] },
  ],
};
const r = auditEvidence(g, new Set(["https://seen.example/doc"]), []);
assert.equal(g.sources.length, 1, "unseen source removed");
assert.equal(g.steps[0].ev, "docs");
assert.equal(g.steps[1].ev, "model", "claim citing only an unseen URL is downgraded");
assert.equal(g.steps[2].ev, "model", "tested without probes is downgraded");
assert.equal(r.downgraded, 2);
console.log("audit: ok");

const p = await probePage("https://github.com/settings/applications/new");
console.log("probe github:", JSON.stringify({ status: p.status, finalUrl: p.finalUrl, loginWall: p.loginWall, error: p.error }));
