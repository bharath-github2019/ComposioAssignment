# ComposioAssignment

# Approval Path

**Live demo:** https://claude.ai/artifact/Bn8ad2PABN1SDKqo5Xu5jL

Guides that show a developer what it takes to get their own OAuth app working with a provider: the effort, the wait for approval, what can block them, and what an agent can do for them.

- **Library:** 6 researched guides (GitHub, Slack, Gmail, LinkedIn, Salesforce, X) and a 100-app catalog
- **Live generation:** enter any app name or website and an agent writes a shareable guide
- **Evidence labels** on every claim: Tested by agent, Official docs, Third-party report, or Unverified

## Key decisions

- **Paths, not one difficulty score.** The same provider can take 15 minutes or 6 weeks depending on the scopes you need (Gmail: testing mode, send only, read mail). Each guide splits into paths, easiest first.
- **Work vs. waiting.** A log-scale time ruler separates hands-on time (solid) from waiting on the provider or a customer (hatched). Waits with no published figure are faded and marked as estimates.
- **Evidence enforced by tests.** `test/guides.test.mjs` fails if a label doesn't match its sources. It caught a mislabeled claim in my own Gmail guide.
- **Agent vs. you.** Agents can't get past provider login walls, so each guide is explicit: the agent prepares (manifests, scope choices, justifications, demo scripts) and you sign in, verify, pay and submit.
- **Focused scope.** Six apps with different blockers (org approval, marketplace rules, security assessment, product gating, deprecation, pricing) instead of many shallow guides. `server/batch.mjs` fills in the rest of the catalog.

## How generation works

1. **Identify:** confirm the app and that it offers OAuth; unknown apps stop here.
2. **Research:** web search plus a `probe_page` tool that loads the real registration page without logging in.
3. **Audit (code):** drops sources the agent never saw and downgrades unsupported labels.
4. **Review:** a second agent flags claims that look outdated or overconfident.
5. **Save:** stable link per guide, plus Markdown export.

The published demo runs inside Claude and can't browse, so its generated guides are labeled Unverified. The server in this repo does real web research.

## Verification

- **Tested:** GitHub's registration page redirects an unauthenticated agent to sign-in. Other providers weren't reachable from the sandbox, and their guides say so.
- **Corrected:** Slack's 1 req/min limit now applies to existing unlisted installs, not just new apps (since March 3, 2026). Salesforce no longer allows new Connected Apps by default. X has no free tier for new developers.
- **Unverified:** review times for the Slack Marketplace, Google sensitive scopes, LinkedIn Community Management API and X Enterprise; CASA cost.

## Run it

Requires Node 18+, no dependencies.

```bash
cp .env.example .env    # add ANTHROPIC_API_KEY (needed only for server generation)
npm test                # evidence checks + probe test, no key needed
npm start               # http://localhost:8787
npm run batch -- 10     # pre-generate 10 more catalog guides
npm run build           # rebuild dist/index.html with them
```

Without a key, open `dist/index.html` directly or use the live demo. If you need a different model, set `ANTHROPIC_MODEL` in `.env`.

## Limitations

- "Tested" means reaching the public edge of the setup flow, not creating an app.
- The full server research loop wasn't run end to end during the build (no API key available there).
- Guides go stale; each shows its check date.
- Hands-on time estimates are judgment calls, not measurements.
