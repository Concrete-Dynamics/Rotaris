# Component view — packages and the edges between them — The worktree wrappers behind `pnpm worktree:new` / `pnpm worktree:land` (2026-10-19)

Part 4 of 4 of [the component view](../01-component-view.md), which indexes every part.

### The worktree wrappers behind `pnpm worktree:new` / `pnpm worktree:land` (2026-10-19)

`tools/worktree/` is a **process tool** with no `package.json`. `new.mjs` and `land.mjs` wrap the two halves of
`docs/clean-room/agent-workflow.md`: a branch in a fresh worktree beside the primary checkout, cut from
`origin/main` (fetch, `git worktree add -b`, `pnpm install --prefer-offline`, electron's `install.js` and
`pnpm preflight`), and the landing sequence — fetch, `git rebase origin/main` (a conflict aborts the rebase and
hands back; the tool never resolves one), a **landing worktree** detached at the rebased head and re-installed,
`tools/verify-plan`'s plan read against `origin/main` (its `review` list demands `--reviewed`), `pnpm check` then
the named proof suites on that exact head (`--skip-proofs` skips them loudly), `git push origin HEAD:main` —
fast-forward only, re-rebasing while `main` moves under it — and the removal of both worktrees and the branch.
`overlaps.mjs` (`pnpm worktree:overlaps`) is the report beside them: every registered worktree's branch read
against its fork from `origin/main` — the files it touches (committed, staged, unstaged and untracked), the
files `origin/main` moved since the fork, and the files two or more branches both touch — and `land` prints
the branch's own overlap with `origin/main` before the rebase. A run that lands closes with the handoff of
`docs/clean-room/agent-workflow.md` — `Zustand`, `Beweise`, `Offen`, `Nächster Schritt` — and a run that stops before
the push hands back its repair line instead. `exec.mjs` runs a command with its output inherited or captured and builds pnpm's own command line
(`dev-time.mjs`'s `npm_execpath` pattern); `git.mjs` holds the git reads, with the git-hook variables cleared so a
read cannot land in another repository; `steps.mjs` gathers the heavy steps as seams, which is how the tests run
the wrappers end to end against a scratch repository with git real. **Edges unchanged**: `tools/**` is outside
the boundary rule, nothing here imports the product, and no product code imports it.

### The setup manifest and its schema (2026-09-28; `first-release-plan.md` §4.1, ADR-0054)

`apps/desktop/resources/setup-manifest.json` is REQ-STARTUP-058's manifest: committed, not generated, and carried by
`electron-builder.yml`'s `extraResources` to the root of the artifact's resources beside the two About files. Its shape
lives in **`config`** — `setup-manifest.ts`, `SetupManifestSchema` (zod, strict, so a key it does not name refuses the
file) — because both of its readers may import `config` and nothing lower could hold what it is cross-checked against:
`SHIPPED_MCP_SERVERS` and `CODE_INTELLIGENCE_LANGUAGE_SERVERS` are `config`'s. The pre-build guard
(`tools/release-guard`, outside the matrix) already read the defaults there and now takes the schema version and the
complete-version pattern from the same module; the product's reader, the machine-setup flow, would be main's
(REQ-STARTUP-089), and main imports `config`. **That flow is not built.** `setup-manifest.test.ts` validates the shipped
file, refuses each malformed shape and holds its `languageServers` equal to `pins.json` and to
`CODE_INTELLIGENCE_LANGUAGE_SERVERS`, so the two files cannot drift; `about-assets.test.ts` copies the file through
electron-builder's own `copyFiles`. The schema's `PLATFORM_KEYS` (REQ-STARTUP-060) is a second literal of
`tools/release-naming`'s, the naming authority — `config` has no edge to it — and `tools/release-guard`'s `pins.test.ts`,
which imports both, holds the two lists equal and every shipped archive under one of them; the raw `<os>-<machine>`
fallback key is refused as an archive key. The notices generator reads it as its manifest since 2026-09-28, by a copy of the field names rather than an import. **Edges
unchanged**: `config` gains the `zod` dependency `contracts` already carries; no package edge moves.

### The release pipeline's stages after the build (2026-10-22; R-080, `first-release-plan.md` §4.2, §4.7, §4.8)

`tools/release-pipeline/` is the build-id writer's kind of tool: plain JavaScript with no `package.json`, typed for its
tests by `.d.mts` files, run as `pnpm release:pipeline <command>` (`cli.mjs`) by `.github/workflows/release.yml`.
`assets.mjs` holds the published set (`PUBLISHED_PLATFORMS`, `windows-x64` alone under `PD-STARTUP-001`) and writes and
verifies `SHA256SUMS.txt` through the naming authority's `formatChecksumManifest`; `signing.mjs` signs it and keeps the
key record (`key-record.json`); `body.mjs` writes the release body and name. It reaches exactly two TypeScript files,
both of erasable syntax and loaded by Node's type stripping: `tools/release-naming/src/index.ts`, as the packaging
scripts do, and **`apps/desktop/src/main/updater/keys.ts`** — the updater's key set and verifier — so the pipeline's
"the signature verifies against a key the build carries" is the updater's own answer. That second import is the one
reach from `tools/` into an application root's source; it reads a leaf module that imports only `node:crypto`, and
nothing in `apps/` or `packages/` imports the tool. **Edges unchanged**: `tools/**` is outside the boundary rule.

### The portable's launcher stub and its assembly (2026-10-23; ADR-0054 P4, `first-release-plan.md` §4.5)

**`apps/desktop/launcher/`** is the product's second build technology: a Rust crate with **no dependency**
(`Cargo.toml`, `Cargo.lock`), built by `cargo build --release --locked` on the host that packages. It is not a package
of the workspace and no TypeScript imports it; it shares nothing with the application but two spellings it must agree
with — the per-user data directory of `packages/platform/src/dirs.ts` (`%LOCALAPPDATA%\rotaris\data`, `$XDG_DATA_HOME/rotaris`)
and `PORTABLE_ARTIFACT_VARIABLE` (`ROTARIS_PORTABLE_ARTIFACT`), both written in `src/main.rs` as literals with the source
named. `src/inflate.rs` is raw deflate written from RFC 1951; `src/payload.rs` reads the appended payload; `src/icon_res.rs`
and `build.rs` link the owner's icon as a `.res` on the MSVC target. **`apps/desktop/scripts/lib/portable.mjs`** is the
assembler — the payload layout, the identity token written into the stub's slot, `readPortable` for the checks — loaded by
`scripts/package.mjs`, `scripts/portable-proof.mjs` and **`tools/release-pipeline/cli.mjs`** (its `portable` stage reads the
artifact back before copying it into the release directory), which is the pipeline's one import from `apps/desktop/scripts/`;
it imports only Node's own modules, so the stage still runs bare. **`scripts/lib/pe-icons.mjs`** reads an icon back out of a
PE file's resources for `pnpm package`. **Edges unchanged**: `apps/desktop/launcher/**`, `apps/desktop/scripts/**` and
`tools/**` are outside the boundary rule.

### `agent-tools`' JSON Schema validator (2026-10-06; fin18, live-run finding G3)

`agent-tools/advertised-schema.ts` checks an MCP call against the input schema its server advertised (REQ-TOOLS-032), and
validates with **`ajv` 8.20.0**, pinned exactly and declared by `agent-tools`, which imports it, and by `apps/desktop` beside
the app's other node-side runtime dependencies (`zod`, the MCP client); the build bundles it into `out/main/run-host.js`,
as it does those. It is the engine `@modelcontextprotocol/client` (2.3.0 since R-081)
bundles and validates with (ADR-0033 leaves schema validation to the SDK), declared directly because the SDK's validator
returns one flattened error string and does not export its 2020-12 engine, and the gate needs each violation's location.
The lockfile already carried 8.20.0 (beneath electron-builder). **Edges unchanged**: a third-party dependency; no package
edge moves. Its manifest now declares everything its source imports (2026-10-06, fin21): `zod ^4.5.4`, which the gate and every tool's
argument schema import, and `@rotaris/config`, which `tools/search.ts` imports for the gitignore grammar along the
`agent-tools → config` edge the table above already allows; both had resolved only through the flat `node_modules`, and
`agent-tools/src/manifest.test.ts` now fails an undeclared import.

### `ui/design-system` (2026-09-12)

The adopted design language's **one** implementation, and the only place in `ui` where a design-equivalent control
is written: `core.tsx` (`Button`, `StatusDot`, `Tag`, `ToggleSwitch`, `SegmentedControl`, `Kbd`), `forms.tsx`
(`Input`, `TextArea`, `Select`, `Checkbox`), `surfaces.tsx` (`Card`, `KpiCard`, `SectionLabel`), `data.tsx` (`Sparkline`,
`MeterBar`, `ContextRing`, `Table`), `feedback.tsx` (`Dialog`, `Tooltip`, `Spinner`, and the `Acknowledgement` /
`AcknowledgementStack` adapter that keeps REQ-SHELL-115's vocabulary over the visual the design material calls a
toast), `navigation.tsx` (`Tabs`, `NavRail`, `CommandPalette`), `patterns.tsx` (`TableCard`, `PageHeader`,
`EmptyState`, `LogPanel`, `ConfirmDialog`), `overlays.tsx` (`PopoverMenu` — PD-CHAT-001's press-revealed value
chip: the trigger button carries the current value with `aria-haspopup`/`aria-expanded`, and the alternatives open
in an anchored `role="menu"` panel of `menuitemradio` rows, Escape closing back to the trigger) — twenty-nine
briefs, thirty-one exports — plus `shared.ts` (the two class helpers) and `layout-contract.ts`. **Edges unchanged**
— `ui → kernel, contracts, ui-core`; the layer imports nothing but `react`, which is what lets
`tools/check-ui-language.mjs` forbid a raw `button`, `input`, `textarea`, `select` or `table` everywhere *else*
under `packages/ui/src` and `apps/desktop/src/renderer` without an exception list. Each component forwards native
attributes and its ref, so a caller's `data-testid`, `aria-*` and handler survive the substitution; a specialised
class already carrying a requirement's visual contract is passed through rather than overwritten
(`componentClass`). **`Tag` and `StatusDot` are the exceptions** (acceptance A40, 2026-10-01): `Tag` joins a caller's
class to the `tag tag-<kind>` it draws, its kinds the design Tag's seven tones (`TAG_KINDS`), and
`tools/check-ui-language.mjs` refuses a Tag whose class spells `tag` or a `tag-` tone; `StatusDot` writes the design
StatusDot's state (`STATUS_DOT_STATES`) to `data-state`, which `shell.css` paints from its token at the specificity of
`.status-dot` alone.

`layout-contract.ts` is **verification-only data, not behaviour**: a `UiLayoutContract` on a component root is
serialised into `data-ui` / `data-ui-contract` — by `layoutContractAttributes` alone, which `tools/check-ui-language.mjs` enforces — and evaluated by `ui-audit` against live geometry after layout and
animation settle (nine relations — `align-x`, `align-y`, `equal-width`, `equal-height`, `spacing-token`,
`containment`, `text-fit`, `hit-test`, `viewport-scroll`). Nothing in the product reads it, so a contract can
neither move a pixel nor hide a defect; it can only be wrong in public.

The nine relations are **opt-in**, and one question is asked of every marked box whether or not it published
anything: `shrunkBoxes` reports a box standing smaller than the content inside it on an axis whose `overflow` is
`visible` — the case where nothing is clipped, because the box does not scroll, and the remainder simply pays out
past the edge under whatever paints next. It exists because `text-fit` says the same thing on request and no
header had ever been asked (UIR-014). The verdict is pure and lives beside the relations in
`apps/desktop/scripts/lib/layout-relations.mjs`; the probe measures, `ui-audit` reports it as `SHRUNK`.

### Transcript rendering note

The Workspace transcript keeps ADR-0045's fixed recycled slot pool and positions each bound slot with its measured `translateY` offset. Browser-selected text layers preserve native glyph rasterization during steady-state reading; `rows-proof` verifies the default layer hint and live coordinate transform.
