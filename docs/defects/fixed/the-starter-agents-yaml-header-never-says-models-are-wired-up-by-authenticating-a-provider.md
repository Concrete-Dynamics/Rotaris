## The starter agents.yaml header never says models are wired up by authenticating a provider

`starterDocument` in `packages/config/src/writers.ts` opens the starter `agents.yaml` with a four-line comment header:

```
# Rotaris configuration for this scope.
# Anything stated here overrides the built-in roles, models and tool servers; anything left null or
# absent is inherited from the layer below (the global file, then the built-in defaults). Sections
# merge per field; lists are restated whole. See the Settings screen for the same keys with hints.
```

REQ-WORKSPACE-038 says the header conveys three things, "the wording of those three lines being left to the
implementation": that the file is a minimal starting configuration, that editing it overrides the built-in personas,
models and tool servers, and "that real models are wired up by authenticating a provider in the Settings Models category
(REQ-WORKSPACE-152)". The shipped header carries the second. It never says the third: nothing in it mentions a provider,
authenticating one, or the Models category. It does not say the first either; "Rotaris configuration for this scope"
does not tell the user the file is a minimal starting point. And it is four lines where the requirement speaks of three.

Since F1's repair the open writes this starter into every workspace that has no `agents.yaml`
([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](a-first-run-workspace-never-gets-the-starter-agents-yaml.md)),
so every new workspace now carries the incomplete header. No proof catches it: `starterMissing` in
`apps/desktop/scripts/lib/starter-config.mjs` accepts any first non-blank line that starts with `#` as "the comment
header", so `slice-proof` and `live-run` cannot tell a header that lacks the requirement's clauses.

Found 2026-10-03 by the verifier of branch `finacc-accept1-3` (repair round 3), reading the starter its slice-proof run
wrote. The F1 note's description said the starter's header tells the user "that models are wired up by authenticating a
provider", which the shipped header has never said; that sentence is corrected in place there.

## Specs

- **REQ-WORKSPACE-038**: the header conveys three facts in three lines; the shipped one conveys one of them in four.
- **REQ-WORKSPACE-152**: the Settings Models category is where the guided provider setup starts, which the header is to
  point the user at.
- **REQ-CONFIG-025**: the header explains that the file overrides built-in roles, models and tool servers; the shipped
  header meets this.

## Relevant files

- `packages/config/src/writers.ts`: `starterDocument`, the four comment lines.
- `packages/config/src/writers.test.ts`: the bootstrap test, which checks only that the starter begins
  `# Rotaris configuration`.
- `apps/desktop/scripts/lib/starter-config.mjs`: `starterMissing`, which takes any `#` line for the header.
- `apps/desktop/scripts/lib/starter-config.test.ts`: the reader's test, held to `starterDocument`.

## Outcome — repaired 2026-10-03 (branch `finacc-accept1-3`, repair round 3)

The wording is the implementation's (REQ-WORKSPACE-038), so no owner ruling was needed. `starterDocument` now opens
with three comment lines, one fact each:

```
# A minimal starting configuration for this scope; anything left null or absent is inherited from the layer below.
# Editing it overrides the built-in personas, models and tool servers; sections merge per field, lists whole.
# Real models are wired up by authenticating a provider in the Models category of Settings.
```

The inheritance and merge hints of the old header are kept inside the first two lines. Nothing reads the header: the
bootstrap writes it only where no file is, so a workspace that already has the old four lines keeps them
(REQ-CONFIG-026, never clobber).

`starterMissing` now reads the header whole: the first three non-blank lines must be the starter's three
(`STARTER_HEADER`), so `slice-proof` and `live-run` name "the comment header" for a header that lacks a clause.

Pinned by:
- `packages/config/src/writers.test.ts`, "opens with REQ-WORKSPACE-038's three-line header": three comment lines
  before `default_persona`, carrying the minimal start, the override, and a provider authenticated in the Models
  category of Settings. It fails on the old header. The model-preference path's bootstrap case reads the header from
  `starterDocument` instead of the old first line's wording.
- `apps/desktop/scripts/lib/starter-config.test.ts`, two new cases: `STARTER_HEADER` is exactly the header
  `starterDocument` writes, and the old four-line header, or the new one cut to two lines, is named as missing "the
  comment header". Both fail on the reader's old first-line check.
