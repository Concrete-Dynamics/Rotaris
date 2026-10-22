# Lane record — dependency patches (R-081, 2026-10-22)

The patch lane of [the 2026-10-22 triage](2026-10-22-dependabot-triage.md): branch `deps-security-patches`, cut from
`origin/main` at `b0d1b3ff`. It patches **47 alerts** (#1, #2, #4 to #28, #30, #31, #33 to #38, #41, #43 to #53). Each is
*expected* to close when this branch merges, and none is closed before. The Electron alerts (#3, #54) are on their own
branch. The residuals (#40, #42) stay open (triage §5).

## What changed

| File | Change | Why |
| --- | --- | --- |
| `packages/agent-tools/package.json` | `undici` `7.29.0` → `7.29.1` (exact pin kept) | the direct pin of alerts #4 to #13 |
| `packages/mcp/package.json`, `apps/desktop/package.json` | `@modelcontextprotocol/client` `2.0.0` → `2.3.0` (exact pin kept) | #1, #2, #14, #15, #43, #47 |
| `apps/desktop/package.json`, `tools/release-guard/package.json` | `vite` `^8.2.2` → `^8.2.4` | #48 to #53; the floor keeps a re-resolution from going back |
| `package.json` | `eslint-plugin-boundaries` `^7.2.0` → `^7.2.1` | #44 to #46: 7.2.1 is the release that moves its own exact `handlebars` pin |
| `pnpm-lock.yaml` | the targeted entries only | the transitive copies, below |
| `packages/mcp/src/client.test.ts` | new | GHSA-6prh-2h8m-c8cw held for both remote transports |
| `packages/mcp/src/index.ts`, `packages/agent-tools/src/advertised-schema.ts` | a comment each | they named 2.0.0 as the pinned SDK |
| `docs/architecture/adr/0033-the-mcp-client.md` | a dated section | the pin it recorded moved |
| `docs/architecture/open-questions.md` | OQ-451 | the redirect behaviour 2.3.0 changes is unspecified |
| `docs/architecture/views/01-component-view.md`, `views/reconciliation-log.md` | 2.0.0 → 2.3.0, one entry | the view states the pin |
| `docs/defects/` | two notes | noticed along the way; recorded, not repaired |
| `docs/product/requests.md`, `docs/architecture/README.md`, `docs/architecture/dependency-alerts/` | R-081, a pointer, this directory | the request and its triage |

The lockfile moves these entries and no others: `undici` 6.28.0 → 6.28.1 and 7.29.0 → 7.29.1; `brace-expansion` 1.1.18 →
1.1.21, 2.1.4 → 2.1.7 and 5.0.9 → 5.0.12; `fast-uri` 3.1.7 → 3.1.8; `source-map-js` 1.2.1 → 1.2.2; `vite` 8.2.2 → 8.2.4,
with the peer-suffixed keys of `@vitejs/plugin-react`, `vitest`, `@vitest/mocker` and `electron-vite`; `handlebars` 4.7.9 →
4.7.10; `@modelcontextprotocol/client` and `@modelcontextprotocol/core` 2.0.0 → 2.3.0; `eslint-plugin-boundaries` 7.2.0 →
7.2.1, with its own pins `@boundaries/elements` 3.1.1 → 3.1.2 and `eslint-module-utils` 2.12.1 → 2.14.0, and
`is-core-module` 2.16.1 → 2.17.0. That is 178 changed lines of `diff` against `b0d1b3ff`'s lockfile.

## How the transitive copies were moved

pnpm 11 reads `overrides` from `pnpm-workspace.yaml`. A selector applies only to a dependency whose declared range lies
inside it, so it is written per major line:

```yaml
overrides:
  undici@6: 6.28.1
  undici@7: 7.29.1
  brace-expansion@1: 1.1.21
  brace-expansion@2: 2.1.7
  brace-expansion@5: 5.0.12
  fast-uri@3: 3.1.8
  source-map-js@1: 1.2.2
  vite@8: 8.2.4
```

`pnpm install --lockfile-only` with that block, then the block removed and `pnpm install --lockfile-only` again: pnpm
keeps a locked version that satisfies its dependent's range, so the second resolution kept every version and dropped
only the lockfile's `overrides:` record. The branch carries no override. Each version stays within its dependents' ranges:
`node-gyp` `^6.25.0`; `@ai-sdk/provider-utils` `^7.29.0`; `@electron/get` `^7.24.4`; `minimatch` `^1.1.7`, `^2.0.1`,
`^2.0.2` and `^5.0.8`; `ajv` `^3.0.1`; `postcss` `^1.2.1`; and the `vite` peers. `pnpm update -r brace-expansion
--lockfile-only` was tried first and refused: it re-resolved hundreds of unrelated entries.

## Verification on this tree

All of it ran on Linux x86_64 with Node 26.8.1 and pnpm 11.9.0, against the tree that is committed.

- **The install CI runs.** `pnpm install --frozen-lockfile` reads "Already up to date". The lockfile passes pnpm's
  supply-chain check.
- **Every copy on disk** (`find . -path '*/node_modules/<package>/package.json'`, nested copies included): `undici` 7.29.1
  (hoisted) and 6.28.1 (`node-gyp/node_modules`); `brace-expansion` 2.1.7 (hoisted), 1.1.21 three times (`glob`, `dir-compare`,
  `@electron/asar`) and 5.0.12 (`minimatch/node_modules`); `fast-uri` 3.1.8; `source-map-js` 1.2.2; `handlebars` 4.7.10;
  `vite` 8.2.4; `@modelcontextprotocol/client` and `core` 2.3.0. `pnpm why -r` names no other version of any of them.
  `http-cache-semantics` 4.2.0 and `sprintf-js` 1.1.3 are the residuals.
- **Peers.** `pnpm peers check` reports the same single issue as on `b0d1b3ff`: `electron-vite` 5.0.0 asks `vite`
  `^5 || ^6 || ^7`, and the version installed moved from 8.2.2 to 8.2.4.
- **The redirect test, both ways.** `pnpm vitest run packages/mcp/src/client.test.ts`: 2 passed on 2.3.0. The same file
  on `b0d1b3ff` (2.0.0) fails both cases: the second origin received `x-auth: redirect-probe-not-a-credential` on a `POST`
  and on a `GET`.
- **The narrow suites.** `pnpm vitest run packages/mcp packages/agent-tools packages/model tools/release-guard`: 33 files
  passed and 1 skipped; 797 tests passed and 32 skipped.
- **The build.** `pnpm build` (electron-vite on vite 8.2.4) is green. `out/main/run-host.js` inlines `undici` from
  `node_modules/undici`, now 7.29.1, and the 2.3.0 SDK: 14 occurrences of its `redirectPolicy`, which 2.0.0's
  distribution does not contain.
- **The proof suite `pnpm verify:plan` names: Tools, all fifteen**, on the built tree with the code-intelligence bundle
  built (`pnpm code-intel:bundle`, linux-x64), on a 1600×1000 Xvfb. Fourteen passed at the first run: `fetch-proof`,
  `edits-proof`, `questions-proof`, `todo-proof`, `attachments-proof`, `artifacts-proof`, `mcp-proof`, `code-intel-proof`,
  `skills-proof`, `injection-proof`, `sandbox-proof`, `terminal-stream-proof`, `tool-shapes-proof` and `delegation-proof`.
  `approvals-proof` failed once ("the write's dialog was not answered "Approve for this session"": the seam found no
  button 700 ms after the dialog showed). It then passed alone on this build and alone on `b0d1b3ff`. The note is
  [`approvals-proofs-scripted-answer-looks-for-its-button-at-a-fixed-700-ms.md`](../../defects/approvals-proofs-scripted-answer-looks-for-its-button-at-a-fixed-700-ms.md).
- **Review of what the plan left unmapped.** `apps/desktop/package.json`: the MCP client belongs to Tools (run), and
  `vite` to the build every proof runs on (run). `package.json`: `eslint-plugin-boundaries` is the lint the gate runs, so
  no proof suite.

**A display this host first could not give.** `pnpm preflight` passed with `DISPLAY=:99`, and twelve of the fifteen proofs
then exited SIGTRAP at their first launch ("Missing X server or $DISPLAY"). That server's socket was in another network
namespace. The suite above ran on a private Xvfb (`:111`), Ubuntu's own `xvfb` 21.1.12 package unpacked under `/tmp`
and run inside an unprivileged user and mount namespace, because the host has no `xkbcomp` at the path Xvfb expects.
The note is
[`pnpm-preflight-passes-the-display-check-for-a-display-no-client-can-reach.md`](../../defects/pnpm-preflight-passes-the-display-check-for-a-display-no-client-can-reach.md).

**Not here, and why.** The gate (`pnpm check`) is run on this exact tree before the commit. Continuous integration's
`gate` and `package` jobs run on the pushed head. Both results are in the pull request and the handoff, because no file can
carry the result of a run on the commit that holds it. No Windows host was available: Windows packaging is CI's `package`
job.

## What this lane leaves

- **#40 and #42**, recorded as residuals in triage §5.
- **OQ-451**, the redirect behaviour of remote MCP entries, raised and not ruled.
- **Newer lines not taken**: `undici` 7.30.1 and 6.29.1, `fast-uri` 3.1.9, `vite` 8.3.5.
- **The merge with the Electron lane.** Both branches change `pnpm-lock.yaml` and `apps/desktop/package.json`, on
  different lines. Whichever lands second is rebased, `pnpm install --lockfile-only` is run on the rebased tree, and that
  tree is gated again.

## Stopped at the gate once — 2026-10-22, before the commit

The brief this lane ran under allows one repeat of a red full gate and then stops the lane uncommitted. The first pass
stopped there: no commit, no push, no pull request, the tree left in the worktree `Rotaris-crw-wt-deps-security-patches`
(branch `deps-security-patches`, base `b0d1b3ff`).

| Run | Window (UTC) | Stages | Tests |
| --- | --- | --- | --- |
| `pnpm check` 1 | 16:38:50 to 16:47:05 | symbols, typecheck, lint green; test red | 475 files passed, 1 failed, 5 skipped; 6,990 tests passed, 1 failed, 57 skipped |
| `pnpm check` 2, the one repeat, same tree | 16:47:29 to 16:54:45 | symbols, typecheck, lint green; test red | 475 files passed, 1 failed, 5 skipped; 6,990 tests passed, 1 failed, 57 skipped |

Each red was one case of `packages/agent-tools/src/terminal/terminal.test.ts`, a different case each time, and neither
touches anything this lane changes:
- **Run 1:** "OQ-144 / OQ-164: a process on its way out reads no identity, never another program's". `measured` was 11
  where the floor is 20, and `foreign` was empty. Recorded as
  [`the-identity-on-its-way-out-case-counts-too-few-readings-under-load.md`](../../defects/the-identity-on-its-way-out-case-counts-too-few-readings-under-load.md).
- **Run 2:** "REQ-TOOLS-097/099 (OQ-144, acceptance round 1): a run's cancel that lands while a fresh shell answers the
  first call's handshake …". This is the open note
  [`a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md`](../../defects/a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md).

**Read alone, after both runs:** `pnpm vitest run packages/agent-tools/src/terminal/terminal.test.ts` passed on this tree
(117 passed, 18 skipped). On untouched `b0d1b3ff` it failed with the run-2 case (1 failed, 116 passed). The host had 4
CPUs and a load of about 4.9 from other work on it during the gates. The lane resumed once the host was quieter (load
about 1), on the same base, with the same changes and this section rewritten. The gate on the committed tree, with its own
one repeat if needed, is reported in the pull request.
