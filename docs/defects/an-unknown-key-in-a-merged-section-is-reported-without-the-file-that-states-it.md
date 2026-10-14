## An unknown key in a merged section is reported without the file that states it

Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`) while checking the repair of
[`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](fixed/a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md);
not repaired, outside that bundle's tasks.

The warnings the typed section readers raise on the MERGED document reach the load's `warnings` as `<path>: <message>`
alone (`resolveMerged`'s `warnings`, each `sink.warnings` entry mapped to its path and message), naming no file and no scope. Reproduced with
`loadConfiguration` over a global `agents.yaml` holding `compressor:\n  bogus_key: 1` and no workspace file: the only
warning reads `compressor.bogus_key: unknown key 'bogus_key' is not recognised by this build and contributes nothing`. A
user with two scope files (four with `models.yml`) is not told which one to edit. The fatal faults of the same readers name
their file since fin45 (`statingFile`, `packages/config/src/load.ts`); the warnings were not part of that note.

## Specs

REQ-CONFIG-233 ("an unknown key inside a merged section other than `requirements`, each reported naming the key and the
file"), REQ-CONFIG-040; and REQ-CONFIG-183, whose reported-and-ignored key's report "identifies the file by its full path and
by which scope it belongs to" — whether that report travels the same `sink.warnings` route was not checked.

## Relevant files

- `packages/config/src/load.ts` — `resolveMerged`'s `warnings`, which drops the file; `statingFile`, which could name it.
- `packages/config/src/sections/field.ts` — `FieldReader.warn` and the unknown-key warning (REQ-CONFIG-233).
