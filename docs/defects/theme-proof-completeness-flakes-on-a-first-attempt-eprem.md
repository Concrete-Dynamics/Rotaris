## theme-proof's completeness check flakes on a first-attempt EPERM replacing preferences.json

`pnpm theme-proof`'s `themeCompleteness` fails intermittently on cells whose contrast cells pass:
`nocturne @ 2` (then `nocturne @ 1.5` on the rerun) with the launch log carrying

```
Error occurred in handler for 'command': Error: Could not replace the document: EPERM after 1 attempt(s): <proof-dir>/app/preferences/preferences.json
```

The theme switch applies live but does not persist, so the proof's before/after switch check reads
the switch as not having happened. A third run failed differently (`focus`, `staleCaptures: 8`),
and the same commit passed 15/15 twice — the failing cell, area and mechanism move between runs
while the contrast section this branch changed passes 15/15 in every run.

**Why one attempt is the whole story.** Theme selection persists through `replaceDocumentSync`
(`packages/platform/src/document.ts:116`) — "the one gesture whose durability is part of its
completion" (ADR-0042) — which takes no ladder and no timers by the shape of its signature. The
record measures first-attempt rename-over-existing EPERM on Windows at roughly six percent with no
opener present at all (`docs/architecture/spikes/remote-and-synchronised-storage.md`), absorbed
everywhere else by the bounded retry ladder. The synchronous path has no ladder to absorb it with,
so a spontaneous EPERM surfaces as a refused theme write and a red completeness cell.

Not repaired here: retrying a synchronous replace (spin retries with no timers) or relaxing the
completeness check are decisions for the preference-store path and the proof's owner, and neither
belongs to the contrast change this branch carries.

## Specs

None contradicted on its face: no requirement fixes a retry policy for the synchronous replace, and
`theme-proof` is evidence, not a requirement. If the preference write is held to a durability bar,
that bar is currently ADR-0042's sentence alone.

## Relevant files

- `packages/platform/src/document.ts` — `replaceDocumentSync` (no `ladder`/`timers` by signature) vs `replaceDocument` (bounded ladder).
- `apps/desktop/scripts/theme-proof.mjs` — `themeCompleteness` (switch persistence + console-error composite).
- `.proof/theme-proof/nocturne-2/process.log`, `.proof/theme-proof/nocturne-1_5/process.log` — the EPERM lines.

Noticed 2026-09-18 while verifying OQ-56's token change on `main` (contrast green 15/15 in all five runs of the commit; completeness/focus red in three).
