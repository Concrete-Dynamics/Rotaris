## An unknown key in a merged section is reported without the file that states it

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-16`, acceptance finding A4).** Confirmed first on the branch: the three
new cases in `packages/config/src/load.test.ts` ("REQ-CONFIG-233: a merged-section warning names the file and scope that stated
the key") failed on the bare `compressor.bogus_key: unknown key …`, and `notice-proof` section 1e (below) read the same bare
line from the built app's log. `resolveMerged` (`packages/config/src/load.ts`) now writes each warning a typed section reader
raised on the merged document in the fatal report's form, `<file> at <path> (<scope> scope): <message>`, the file found by
`statingFileOf` — `statingFile`'s search (the scope file stating the longest prefix of the path, the later in REQ-CONFIG-031's
order on a tie), which answers null where no scope file states the path. A warning on such a value (one only a built-in
default, the discovery snapshot or a run's live overlay supplied) keeps the bare `<path>: <message>`, since there is no file
to correct and the workspace file, `statingFile`'s fallback for a fatal report, does not hold the key; no warning of that
shape was found reachable. REQ-CONFIG-183's withdrawn `requirements.execution.worktree_subpath` travels the same route
(`requirements.ts`'s `ex.warn`), so its report now names its file and scope too. The merge's own unknown TOP-LEVEL key
warning already named its file (`merge.ts`, `${source}: …`) and is unchanged.

Pinned by `packages/config/src/load.test.ts` (an unknown `compressor:` key in the global file with no workspace file; the
same key in the workspace file beside a global `models.yml` entry's unknown key, each naming its own file; and the withdrawn
`worktree_subpath` naming the global file and scope), and by `notice-proof` section 1e (`global-merged-warning`), which
writes `compressor: { bogus_key: 1 }` into the driven profile's global `agents.yaml`, runs one scripted answer and reads the
run host's `configuration:` warning naming that file, the key and `(global scope)` — red on the unrepaired build (the log
read `warning run host: configuration: compressor.bogus_key: unknown key 'bogus_key' …`), green after.
`03-runtime-view.md` §8 states the warning's form.

Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`) while checking the repair of
[`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md);
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
