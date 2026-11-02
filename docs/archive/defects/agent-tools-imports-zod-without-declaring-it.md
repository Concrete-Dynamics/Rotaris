## `@rotaris/agent-tools` imports zod without declaring it

Eleven source modules of `packages/agent-tools` import `zod` (the gate, the file, search, todo, fetch, delegation,
artifact and question tools, the terminal tool, and since fin18 `advertised-schema.ts`), but the package's
`package.json` lists no `zod` dependency. It resolves only because the workspace installs one flat, hoisted
`node_modules` (`.npmrc`, `node-linker=hoisted`) and `apps/desktop`, `packages/config` and `packages/contracts` each
declare `zod ^4.5.4`. Were the linker changed, or those declarations narrowed, the package would fail to resolve its
validator; and nothing states which zod major the gate's schemas are written against. (`advertisedSchemaCheck` relied on
zod's `z.fromJSONSchema` until fin18's repair round 2; it now validates with `ajv`, which the package declares, and imports
zod only for the object record it hands the gate.)

Noticed 2026-10-06 while repairing live-run finding G3 (fin18); not repaired here.

## Specs

None directly. ADR-0056 (the build toolchain) records the one flat `node_modules`; no requirement names a package's
declared dependencies.

## Relevant files

- `packages/agent-tools/package.json` — `dependencies` lists `@rotaris/contracts`, `@rotaris/kernel`, `@rotaris/platform`,
  `@rotaris/store`, the two `@xterm` packages, `ajv`, `node-pty` and `undici`; no `zod`.
- `packages/agent-tools/src/gate.ts`, `packages/agent-tools/src/advertised-schema.ts`, `packages/agent-tools/src/tools/*.ts`,
  `packages/agent-tools/src/terminal/index.ts` — the imports.
- `packages/config/package.json`, `packages/contracts/package.json`, `apps/desktop/package.json` — the packages that do
  declare `zod ^4.5.4`.

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

`packages/agent-tools/package.json` declares `zod ^4.5.4`, the range the three packages that already declared it carry
(the lockfile resolves 4.5.4, the version every other importer gets, so nothing installed changes). Writing the pin found
a second undeclared import of the same kind: `tools/search.ts` imports `@rotaris/config` (the gitignore grammar, ADR-0064)
and the manifest did not list it; it is declared too, as `workspace:*`, along the `agent-tools → config` edge the
component view already allows. The component view's `agent-tools` validator section says so.

Pinned by `packages/agent-tools/src/manifest.test.ts`, "declares every package the source imports": it reads every
non-test module under `src/`, takes each static and dynamic bare import (Node's built-ins left out), and fails any the
manifest does not declare. Red before the repair, naming `zod (first imported by advertised-schema.ts)` and
`@rotaris/config (first imported by tools/search.ts)`.
