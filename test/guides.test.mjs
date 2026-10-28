// Evidence integrity for the hand-checked library: labels must match the kind of source cited.
import assert from "node:assert";
import { readFileSync } from "node:fs";
const guides = JSON.parse(readFileSync(new URL("../data/guides.json", import.meta.url)));
let n = 0;
for (const g of guides) {
  const byId = Object.fromEntries((g.sources || []).map((s) => [s.id, s]));
  for (const k of ["prereqs", "steps", "nuances"]) for (const it of g[k] || []) {
    n++;
    const kinds = (it.src || []).map((id) => { assert(byId[id], `${g.id}: "${it.t}" cites missing source ${id}`); return byId[id].kind; });
    if (it.ev === "docs") assert(kinds.includes("official"), `${g.id}: "${it.t}" says Official docs but cites no provider source`);
    if (it.ev === "report") assert(kinds.length, `${g.id}: "${it.t}" says Third-party report but cites nothing`);
    if (it.ev === "tested") assert(kinds.includes("probe"), `${g.id}: "${it.t}" says Tested but cites no probe`);
    if (it.ev === "model") assert.equal(kinds.length, 0, `${g.id}: "${it.t}" is Unverified but cites sources`);
  }
  for (const p of g.paths) assert(p.hands[0] <= p.hands[1] && p.wait[0] <= p.wait[1], `${g.id}: bad range in ${p.name}`);
}
console.log(`guides: ${guides.length} guides, ${n} labeled claims, all consistent`);
