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
