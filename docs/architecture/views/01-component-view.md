# Component view — packages and the edges between them

Packages follow **process boundaries** (ADR-0002, `codebase.md`): every package is instantiated by one or
more of the five composition roots, arrows point downward only, and `eslint-plugin-boundaries` fails
`pnpm lint` on any edge outside the matrix below (`eslint.config.js`, `ALLOW`). Composition roots are the
only places `electron` is imported.

| Read this section when you are | Section |
|---|---|
| adding a package, or asking which one work belongs in | [The packages](01-component-view/01-the-packages.md#the-packages) |
| adding an import that crosses a package | [The allowed-edge matrix](01-component-view/02-the-allowed-edge-matrix-the-lint-rule-verbatim.md#the-allowed-edge-matrix-the-lint-rule-verbatim) |
| deciding where a responsibility sits | [Where the responsibilities sit](01-component-view/03-where-the-responsibilities-sit.md#where-the-responsibilities-sit) |
| touching the transcript, the Library, MCP, the code-intelligence bundle, the notices generator, the build-identifier writer and the bundled assets, the setup manifest, or the design system | the `###` sections after it |

## Parts

Since 2026-10-26 the rest of this document is in [`01-component-view/`](01-component-view/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](01-component-view/01-the-packages.md) | The packages |
| [02](01-component-view/02-the-allowed-edge-matrix-the-lint-rule-verbatim.md) | The allowed-edge matrix (the lint rule, verbatim) |
| [03](01-component-view/03-where-the-responsibilities-sit.md) | Where the responsibilities sit; `ui/transcript` (Parts Z and AA, 2026-09-07; ADR-0045's first execution, ADR-0046 steps 3-5, ADR-0051's second); `mcp` (Part S, 2026-09-05); `ui/library` (Part X, 2026-09-07); The bundled code-intelligence runtime (Part T, 2026-09-06; ADR-0035's first execution); The notices generator (2026-09-27; `first-release-plan.md` §4.3, ADR-0054); The build-identifier writer and the About page's two files (2026-09-27; `first-release-plan.md` §4.4, ADR-0054); The requirement coverage report (2026-10-13; fin42, whats-next item N90); The development-time store behind `pnpm dev-time` (2026-10-18; R-075); The platform preflight (2026-10-19); The evidence manifest (2026-10-19) |
| [04](01-component-view/04-the-worktree-wrappers-behind-pnpm-worktreenew.md) | The worktree wrappers behind `pnpm worktree:new` / `pnpm worktree:land` (2026-10-19); The setup manifest and its schema (2026-09-28; `first-release-plan.md` §4.1, ADR-0054); The release pipeline's stages after the build (2026-10-22; R-080, `first-release-plan.md` §4.2, §4.7, §4.8); The portable's launcher stub and its assembly (2026-10-23; ADR-0054 P4, `first-release-plan.md` §4.5); `agent-tools`' JSON Schema validator (2026-10-06; fin18, live-run finding G3); `ui/design-system` (2026-09-12); Transcript rendering note |
