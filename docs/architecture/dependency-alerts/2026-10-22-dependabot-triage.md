# Dependabot triage — 2026-10-22 (R-081)

The first triage pass over this repository's Dependabot alerts, asked for in
[R-081](../../product/requests.md#r-081). It takes all 51 open alerts to the copy the lockfile resolves, the paths that
reach it and whether the shipped application carries it. It then assigns each one to a pull request, or records it as a
residual. Nothing here dismisses an alert ([README](README.md)).

## Provenance

- **Alerts.** `gh api --paginate "repos/Concrete-Dynamics/Rotaris/dependabot/alerts?state=open&per_page=100"`, read on
  2026-10-22 at about 15:20 UTC: **51 open alerts**, numbers 1 to 54 except 29, 32 and 39, all created on 2026-10-21.
  Those three were auto-dismissed by GitHub on 2026-10-21 at 19:56 UTC (`brace-expansion` `>= 4.0.0, < 5.0.10` and
  `< 5.0.11`, `braces` `<= 3.0.3`). They are not part of this reading and nothing here touches them.
- **Graph.** Read against `origin/main` at `b0d1b3ff` with pnpm 11.9.0 and Node 26.8.1 on Linux x64, using `pnpm why -r
  <package>`, `pnpm list --prod --depth Infinity --json` (the `@rotaris/desktop` closure), each dependent's declared range
  (`npm view <dependent>@<version> dependencies`), `apps/desktop/electron-builder.yml`'s `files`, and the built
  `apps/desktop/out/main/run-host.js`.
- **Upstream.** Publish dates from `npm view <package> time`. The two advisories with no patched version were read in
  their upstream trackers: `kornelski/http-cache-semantics#56` and `alexei/sprintf.js#237`.

## 1. What ships, and how

- **The installer carries `out/**` and the production closure of `apps/desktop`'s `dependencies`.** That is
  electron-builder's `files` over the one flat `node_modules` (`.npmrc`, `node-linker=hoisted`). The closure is 28
  packages: `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, `ajv` (with `fast-uri`, `fast-deep-equal`,
  `json-schema-traverse`, `require-from-string`), `better-sqlite3`, `node-pty`, `react`, `react-dom`, `zod`, `zustand`,
  `@phosphor-icons/web` and their own dependencies.
- **electron-vite bundles the sixteen workspace packages and what they import** into `out/main/index.js`,
  `run-host.js` and `workspace-service.js`. The measured build inlines `undici` (from `../../node_modules/undici/lib/…`,
  imported by `@rotaris/agent-tools`) and `@modelcontextprotocol/client` (from `../../node_modules/@modelcontextprotocol/client/dist/…`)
  into `run-host.js`. A bundled copy is whichever version the tree resolved when the bundle was built.
- **Electron is the shipped runtime.** It is a `devDependency` only because electron-builder requires that. The API
  labels alert #3 `development` and #54 `inconclusive`; both are runtime.
- **Everything else in these alerts is tooling.** electron-builder and its chain (`app-builder-lib`, `@electron/get` 3,
  `@electron/rebuild`, `node-gyp`, `electron-winstaller`, `@electron/asar`, `@electron/universal`), electron-vite, vite,
  vitest, eslint and its plugins all run on a developer's machine or a CI runner, during install, build, packaging, lint
  or test. None of them is in the installer.

The table's **Ships** column uses three words. **shipped**: in the installer, in `node_modules` or in a bundle.
**build**: runs at install, build or packaging time. **dev**: runs for lint, test or the dev server.

## 2. The counts

| Package | Alerts | Copies (resolved) | Distinct advisories |
| --- | --- | --- | --- |
| `undici` | 23: 10 on `packages/agent-tools/package.json`, 13 on the lockfile | 7.29.0, 6.28.0 | 10 |
| `brace-expansion` | 7 | 1.1.18, 2.1.4, 5.0.9 | 3 |
| `vite` | 6 | 8.2.2 | 6 |
| `@modelcontextprotocol/client` | 6: 2 on each of two manifests, 2 on the lockfile | 2.0.0 | 2 |
| `handlebars` | 3 | 4.7.9 | 3 |
| `electron` | 2: one on `apps/desktop/package.json`, one on the lockfile | 44.1.1 | 1 |
| `fast-uri`, `source-map-js`, `http-cache-semantics`, `sprintf-js` | 1 each | 3.1.7, 1.2.1, 4.2.0, 1.1.3 | 1 each |

**51 alerts, 36 distinct pairs of copy and advisory, 29 distinct advisories.** The other 15 alerts report a pair already
counted, from a second manifest. Two examples: `undici` 7.29.0 is one hoisted copy, declared directly by `agent-tools`
(alerts #4 to #13) and reached transitively through `@ai-sdk/provider-utils` and `@electron/get` 5 (alerts #17 to #23,
#25, #27, #28); `@modelcontextprotocol/client` 2.0.0 is one copy that three manifests name. By severity: 2 critical,
15 high, 26 medium, 8 low.

The snapshot this pass was briefed with said "undici 20". The API gives 23 (the table below).

## 3. Each copy

**U7: `undici` 7.29.0. Shipped.** One hoisted copy, reached by three paths. `@rotaris/agent-tools` pins it exactly and
bundles it into `run-host.js`: `direct-fetch.ts` builds one `undici` `Agent` and hands it as the `dispatcher` to the
runtime's global `fetch` (the fetch tool, OQ-37). `@ai-sdk/provider-utils` 5.0.36 (`^7.29.0`) holds a runtime probe that
names undici. `@electron/get` 5.1.0 (optional `^7.24.4`) is Electron's own install-time download. The Rotaris product path
uses `Agent` as a dispatcher and nothing else from undici: no WebSocket, no cache, dump or retry interceptor, no
`BalancedPool`. Alerts #4, #5, #9 to #13, #17, #18, #22, #25, #27 and #28 describe WebSocket, cache, retry, dump and
`BalancedPool` code the product never constructs. The decompression advisory (GHSA-3xpg-4rpp-hhhm, #10 and #23) is the
one plausibly near the fetch tool, which fetches URLs a model chooses. Its decoding runs in the runtime's own `fetch`, and
this reading did not establish whether the bundled copy or Electron's built-in undici performs it (§7). Patched in PR1
regardless: the pin moves to 7.29.1, and the transitive ranges resolve to it.

**U6: `undici` 6.28.0. Build.** `node-gyp` 12.4.0 (`^6.25.0`) ← `@electron/rebuild` 4.2.0 ← `@rotaris/desktop` (dev) and
`app-builder-lib`. It fetches Electron's headers while the native bindings are rebuilt. Patched in PR1 → 6.28.1.

**B1, B2: `brace-expansion` 1.1.18 and 2.1.4. Build.** `minimatch` 3.1.5 (`^1.1.7`), 5.1.9 (`^2.0.1`) and 9.0.9 (`^2.0.2`),
under `@electron/asar`, `@electron/universal`, `dir-compare`, `glob` 7 / `rimraf` 2 / `temp` (`electron-winstaller`) and
`ejs` / `jake` / `filelist` (`app-builder-lib`). Every pattern they expand comes from electron-builder's own
configuration. The API calls these `runtime`; none is in the installer. Patched in PR1 → 1.1.21 and 2.1.7.

**B5: `brace-expansion` 5.0.9. Dev and build.** `minimatch` 10.2.6 (`^5.0.8`) under eslint, typescript-eslint and
`app-builder-lib`. Patched in PR1 → 5.0.12.

**F: `fast-uri` 3.1.7. Shipped.** `ajv` 8.20.0 (`^3.0.1`) is a production dependency of `apps/desktop`. `agent-tools`
validates every MCP call against the schema its server advertised with it (REQ-TOOLS-032). electron-builder's
configuration check uses the same copy at build time. The advisory concerns host-case normalisation of percent-encoded
URIs, which a server-advertised schema can reach through `format: uri` or a `$ref`. Patched in PR1 → 3.1.8.

**S: `source-map-js` 1.2.1. Dev and build.** `postcss` 8.5.26 (`^1.2.1`) ← vite. It is also reached through
`@rotaris/release-guard` (vite's `runnerImport` at release time). It never parses a source map from outside the tree.
Patched in PR1 → 1.2.2.

**H: `handlebars` 4.7.9. Dev.** `eslint-plugin-boundaries` 7.2.0 and its `@boundaries/elements` 3.1.1 both pin it
**exactly** (`"handlebars": "4.7.9"`). An override would break their declared range. The templates it compiles are the
lint rule's messages, written in `eslint.config.js`. The two critical advisories (#44, #46) need a template an attacker
wrote; the only templates here are the repository's own. Patched in PR1 through `eslint-plugin-boundaries` 7.2.1
(published 2026-10-21), whose own pins move to `handlebars` 4.7.10 and `@boundaries/elements` 3.1.2. With it come
`eslint-module-utils` 2.12.1 → 2.14.0 and `is-core-module` → 2.17.0, both lint-time.

**V: `vite` 8.2.2. Dev and build.** `apps/desktop` and `tools/release-guard` (`^8.2.2`), plus the peers of
`@vitejs/plugin-react`, `vitest`, `@vitest/mocker` and `electron-vite`. The advisories concern the dev server
(`server.fs`, `?vite-wasm-instance`, custom middleware) and its bundled `launch-editor` on Windows. They reach a
developer running `pnpm dev`, not an installed product. 8.2.4 declares the same dependencies as 8.2.2. Patched in PR1 →
8.2.4.

**M: `@modelcontextprotocol/client` 2.0.0. Shipped.** Pinned exactly in `packages/mcp` and `apps/desktop`, and bundled
into `run-host.js`. `packages/mcp/src/client.ts` builds the SDK's `StreamableHTTPClientTransport` and `SSEClientTransport`
for remote entries, with the entry's configured `headers` (REQ-MCP-001, REQ-MCP-020).
- **GHSA-6prh-2h8m-c8cw (#2, #15, #47) is reachable.** A remote server that answers with a redirect to another origin
  received those headers, and the request body, again at the second origin. `packages/mcp/src/client.test.ts`
  demonstrates it: on 2.0.0 the second origin received `x-auth` on both the streamable-HTTP POST and the SSE GET.
- **GHSA-6qxp-vccf-f47h (#1, #14, #43) is not reachable.** It needs an OAuth `authProvider`, and the product passes none.

Patched in PR1 → 2.3.0, the first version outside both ranges. 2.3.1 changes no client code. 2.3.0 changes the SDK's
licence field from MIT to Apache-2.0, which is compatible with this product's GPL-3.0-only. The behaviour 2.3.0 changes is
OQ-451, raised with the patch.

**E: `electron` 44.1.1. Shipped runtime.** GHSA-fw47-9c62-h3vw (#3, #54): HID and USB permission checks attributed to
the wrong origin. The renderer loads only the bundled page under `default-src 'self'` with `connect-src 'none'`. The
application registers no device-permission handler and opens no remote origin, so the cross-origin confusion has no
second origin to confuse. Patched in PR2 → 44.3.0, on a branch of its own.

**HC: `http-cache-semantics` 4.2.0. Build. Residual (§5).** `cacheable-request` 7.0.4 ← `got` 11.8.6 ← `@electron/get`
3.1.0 ← `app-builder-lib`.

**SP: `sprintf-js` 1.1.3. Build. Residual (§5).** `roarr` 2.15.4 ← `global-agent` 3.0.0 (optional) ← `@electron/get` 3.1.0
← `app-builder-lib`.

## 4. Every alert

Columns: the alert number; the package and the manifest the API names; the API's scope and relationship; the advisory and
its severity; the vulnerable range and the first patched version the API gives; the copy the lockfile resolves at
`b0d1b3ff`; the path key from §3; whether it ships (§1); the alert that first reported the same copy and advisory, if this
one repeats it; and where it goes.

| # | Package | Manifest (API) | Scope / relationship (API) | Advisory | Severity | Vulnerable range | Patched (API) | Resolved | Path | Ships | Repeats | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `@modelcontextprotocol/client` | `apps/desktop/package.json` | runtime / direct | GHSA-6qxp-vccf-f47h | high | `>= 2.0.0, < 2.2.0` | 2.2.0 | 2.0.0 | M | shipped | — | PR1 → 2.3.0 |
| 2 | `@modelcontextprotocol/client` | `apps/desktop/package.json` | runtime / direct | GHSA-6prh-2h8m-c8cw | medium | `>= 2.0.0, < 2.3.0` | 2.3.0 | 2.0.0 | M | shipped | — | PR1 → 2.3.0 |
| 3 | `electron` | `apps/desktop/package.json` | development / direct | GHSA-fw47-9c62-h3vw | medium | `>= 44.0.0-alpha.1, < 44.3.0` | 44.3.0 | 44.1.1 | E | shipped | — | PR2 → 44.3.0 |
| 4 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-3wwx-pv8p-q78v | medium | `>= 7.28.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 5 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-rx4f-c7p8-82vq | medium | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 6 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-8436-99hf-9mmv | low | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 7 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-w293-vg96-wgc3 | high | `>= 7.24.1, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 8 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-2gqq-gqf2-x968 | low | `>= 7.1.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 9 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-2jfj-6hjv-fm6j | medium | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 10 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-3xpg-4rpp-hhhm | medium | `>= 7.15.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 11 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-rfgv-xxqx-mfg5 | high | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 12 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-r53p-7pc4-xj5r | low | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 13 | `undici` | `packages/agent-tools/package.json` | runtime / direct | GHSA-pmjh-fq2x-6v4x | medium | `>= 7.11.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | — | PR1 → 7.29.1 |
| 14 | `@modelcontextprotocol/client` | `packages/mcp/package.json` | runtime / direct | GHSA-6qxp-vccf-f47h | high | `>= 2.0.0, < 2.2.0` | 2.2.0 | 2.0.0 | M | shipped | #1 | PR1 → 2.3.0 |
| 15 | `@modelcontextprotocol/client` | `packages/mcp/package.json` | runtime / direct | GHSA-6prh-2h8m-c8cw | medium | `>= 2.0.0, < 2.3.0` | 2.3.0 | 2.0.0 | M | shipped | #2 | PR1 → 2.3.0 |
| 16 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-3wwx-pv8p-q78v | medium | `>= 6.25.0, < 6.28.1` | 6.28.1 | 6.28.0 | U6 | build | — | PR1 → 6.28.1 |
| 17 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-3wwx-pv8p-q78v | medium | `>= 7.28.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #4 | PR1 → 7.29.1 |
| 18 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-rx4f-c7p8-82vq | medium | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #5 | PR1 → 7.29.1 |
| 19 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-8436-99hf-9mmv | low | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #6 | PR1 → 7.29.1 |
| 20 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-w293-vg96-wgc3 | high | `>= 7.24.1, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #7 | PR1 → 7.29.1 |
| 21 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-2gqq-gqf2-x968 | low | `>= 7.1.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #8 | PR1 → 7.29.1 |
| 22 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-2jfj-6hjv-fm6j | medium | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #9 | PR1 → 7.29.1 |
| 23 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-3xpg-4rpp-hhhm | medium | `>= 7.15.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #10 | PR1 → 7.29.1 |
| 24 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-rfgv-xxqx-mfg5 | high | `>= 6.7.0, < 6.28.1` | 6.28.1 | 6.28.0 | U6 | build | — | PR1 → 6.28.1 |
| 25 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-rfgv-xxqx-mfg5 | high | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #11 | PR1 → 7.29.1 |
| 26 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-r53p-7pc4-xj5r | low | `< 6.28.1` | 6.28.1 | 6.28.0 | U6 | build | — | PR1 → 6.28.1 |
| 27 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-r53p-7pc4-xj5r | low | `>= 7.0.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #12 | PR1 → 7.29.1 |
| 28 | `undici` | `pnpm-lock.yaml` | runtime / transitive | GHSA-pmjh-fq2x-6v4x | medium | `>= 7.11.0, < 7.29.1` | 7.29.1 | 7.29.0 | U7 | shipped | #13 | PR1 → 7.29.1 |
| 30 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-6j4f-fj2g-mc7p | high | `>= 2.0.0, < 2.1.5` | 2.1.5 | 2.1.4 | B2 | build | — | PR1 → 2.1.7 |
| 31 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-6j4f-fj2g-mc7p | high | `< 1.1.19` | 1.1.19 | 1.1.18 | B1 | build | — | PR1 → 1.1.21 |
| 33 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-qhr7-859c-m2p7 | high | `>= 2.0.0, < 2.1.6` | 2.1.6 | 2.1.4 | B2 | build | — | PR1 → 2.1.7 |
| 34 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-qhr7-859c-m2p7 | high | `< 1.1.20` | 1.1.20 | 1.1.18 | B1 | build | — | PR1 → 1.1.21 |
| 35 | `brace-expansion` | `pnpm-lock.yaml` | development / transitive | GHSA-q2hr-2g5m-vwhr | medium | `>= 4.0.0, < 5.0.12` | 5.0.12 | 5.0.9 | B5 | dev | — | PR1 → 5.0.12 |
| 36 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-q2hr-2g5m-vwhr | medium | `>= 2.0.0, < 2.1.7` | 2.1.7 | 2.1.4 | B2 | build | — | PR1 → 2.1.7 |
| 37 | `brace-expansion` | `pnpm-lock.yaml` | runtime / transitive | GHSA-q2hr-2g5m-vwhr | medium | `< 1.1.21` | 1.1.21 | 1.1.18 | B1 | build | — | PR1 → 1.1.21 |
| 38 | `fast-uri` | `pnpm-lock.yaml` | runtime / transitive | GHSA-hrr3-gc8f-f4qj | medium | `>= 3.0.0, < 3.1.8` | 3.1.8 | 3.1.7 | F | shipped | — | PR1 → 3.1.8 |
| 40 | `http-cache-semantics` | `pnpm-lock.yaml` | runtime / transitive | GHSA-ch52-4w7c-c8xp | high | `<= 4.2.0` | none | 4.2.0 | HC | build | — | residual (§5) |
| 41 | `source-map-js` | `pnpm-lock.yaml` | development / transitive | GHSA-68fv-2mgg-jv7q | high | `>= 1.0.0, < 1.2.2` | 1.2.2 | 1.2.1 | S | dev | — | PR1 → 1.2.2 |
| 42 | `sprintf-js` | `pnpm-lock.yaml` | runtime / transitive | GHSA-hp3w-g68c-fv3c | medium | `<= 1.1.3` | none | 1.1.3 | SP | build | — | residual (§5) |
| 43 | `@modelcontextprotocol/client` | `pnpm-lock.yaml` | runtime / inconclusive | GHSA-6qxp-vccf-f47h | high | `>= 2.0.0, < 2.2.0` | 2.2.0 | 2.0.0 | M | shipped | #1 | PR1 → 2.3.0 |
| 44 | `handlebars` | `pnpm-lock.yaml` | development / transitive | GHSA-8r5x-fm3f-whwj | critical | `>= 4.0.0, <= 4.7.9` | 4.7.10 | 4.7.9 | H | dev | — | PR1 → 4.7.10 |
| 45 | `handlebars` | `pnpm-lock.yaml` | development / transitive | GHSA-xw65-4hp5-5hc7 | medium | `>= 4.0.0, <= 4.7.9` | 4.7.10 | 4.7.9 | H | dev | — | PR1 → 4.7.10 |
| 46 | `handlebars` | `pnpm-lock.yaml` | development / transitive | GHSA-p8wg-vrv2-v86f | critical | `>= 3.0.0, <= 4.7.9` | 4.7.10 | 4.7.9 | H | dev | — | PR1 → 4.7.10 |
| 47 | `@modelcontextprotocol/client` | `pnpm-lock.yaml` | runtime / inconclusive | GHSA-6prh-2h8m-c8cw | medium | `>= 2.0.0, < 2.3.0` | 2.3.0 | 2.0.0 | M | shipped | #2 | PR1 → 2.3.0 |
| 48 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-698v-4r3x-3vcv | medium | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 49 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-587h-7wmj-h5pm | high | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 50 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-r825-w8mm-5pxw | medium | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 51 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-vfpm-58rq-9qcg | medium | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 52 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-rq7h-c2jc-7f22 | medium | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 53 | `vite` | `pnpm-lock.yaml` | development / transitive | GHSA-9jrq-w75r-8gcw | low | `>= 8.2.0, <= 8.2.3` | 8.2.4 | 8.2.2 | V | dev | — | PR1 → 8.2.4 |
| 54 | `electron` | `pnpm-lock.yaml` | runtime / inconclusive | GHSA-fw47-9c62-h3vw | medium | `>= 44.0.0-alpha.1, < 44.3.0` | 44.3.0 | 44.1.1 | E | shipped | #3 | PR2 → 44.3.0 |

**Expected to close when each pull request merges** (an alert closes only once the default branch carries the fix):

- **PR1, dependency patches**: #1, #2, #4 to #28, #30, #31, #33 to #38, #41, #43 to #53. That is 47 alerts.
- **PR2, Electron 44.3.0**: #3, #54. That is 2 alerts.
- **Residual**: #40, #42. That is 2 alerts.

## 5. The residuals

**#40: `http-cache-semantics` 4.2.0, GHSA-ch52-4w7c-c8xp (high, `<= 4.2.0`, no patched version).**
- *Reach.* Build only. `got` 11 caches nothing shared between users here: `@electron/get` 3 downloads Electron and its
  checksums for one user on one machine. The advisory's scenario is a shared cache serving one user's `Set-Cookie`
  response to another, and no such cache exists in this graph. The installer does not carry it.
- *Upstream.* The maintainer closed the report on 2026-10-04 as not a defect, citing RFC 9111 §7.3. A dispute is filed
  against the advisory (`github/advisory-database#10139`).
- *Why not 4.3.0.* 4.3.0, published the same day, is outside the advisory's range, and `cacheable-request`'s `^4.0.0`
  would admit it. But its `max-stale` code is byte-identical to 4.2.0's (both builds diffed). Taking it would close the
  alert without changing what the advisory describes, so this reading does not take it.
- *What retires it.* Either the advisory is withdrawn, or electron-builder moves `app-builder-lib` off `@electron/get` 3.
  26.18.0, the newest at this reading, still declares `^3.0.0`.

**#42: `sprintf-js` 1.1.3, GHSA-hp3w-g68c-fv3c (medium, `<= 1.1.3`, no patched version).**
- *Reach.* Build only, and only where `global-agent` is active: an optional dependency of `@electron/get` 3 that installs
  a proxy agent from `GLOBAL_AGENT_*` variables. `roarr` formats `global-agent`'s own log messages with its own format
  strings. The advisory needs a format string an attacker controls, and none of these is.
- *Upstream.* 1.1.3 is the newest release, and the upstream issue is open.
- *What retires it.* A `sprintf-js` release, or the same electron-builder move as #40. `roarr` 7 replaced `sprintf-js`
  with `fast-printf`, but `global-agent` 3 declares `roarr ^2.15.3`, and `global-agent` 4 needs a dependent that asks for
  it.

Both stay open, owner-visible, and are not dismissed.

## 6. How the patches were made, and what they leave

- **No override is left in the configuration.** PR1 resolved each transitive copy through a scoped override in
  `pnpm-workspace.yaml` (pnpm 11 reads `overrides` there). The selector is a major line, for example `undici@7: 7.29.1`,
  because pnpm applies a selector only to a dependency whose declared range lies inside it. It then removed the block and
  resolved again. pnpm keeps a locked version that satisfies its dependent's range, so what remains is an ordinary
  locked resolution with no pin left to hold back a later patch. The lockfile diff holds the targeted packages and nothing else; the
  patch lane's record lists it.
- **`pnpm update` was tried first and refused.** `pnpm update -r brace-expansion --lockfile-only` re-resolved hundreds
  of unrelated entries (`@rolldown/*`, `@babel/*`, `@noble/hashes` among them).
- **No release-age gate was bypassed.** Every version taken is at least a day old. The youngest are
  `eslint-plugin-boundaries` 7.2.1 and `@boundaries/elements` 3.1.2 (2026-10-21, about 28 hours at resolution), and
  `minimumReleaseAgeExclude` was not touched.
- **Newer lines exist and were not taken**, because the brief was patch scope with no major-line unification: `undici`
  7.30.1 and 6.29.1, `fast-uri` 3.1.9, `vite` 8.3.5 and `electron` 44.9.3.
- **The two pull requests touch the same two files**, `pnpm-lock.yaml` and `apps/desktop/package.json`, in different
  lines. Whichever lands second is rebased onto the first, and its lockfile is resolved again on the rebased tree.

## 7. What this reading did not establish

- **Whether undici's decoding runs in the bundled copy or the runtime's.** The fetch tool passes the bundled `Agent` to
  the global `fetch`, and the decoding of a compressed body happens in that `fetch` implementation. Electron 44's
  embedded Node and the undici inside it are outside Dependabot's view and were not audited here.
- **The packaged build on Windows**, beyond what continuous integration's `package` job measures on each pull request's
  head. That evidence is linked from each lane's record and pull request.
