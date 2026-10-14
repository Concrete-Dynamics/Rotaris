## A fault inside a wholesale-replaced value is attributed to an earlier file that states the deeper path

## Outcome (2026-10-14, fin46 `fin46-accept1-17`): repaired

`statingFile` now follows the merge along the fault's path. A new `replacedPrefixLength(below, doc, path)`
(`packages/config/src/load.ts`) mirrors `mergeLayers` under REQ-CONFIG-040..050's classes and says where a scope file,
merged over the scope files before it, replaces the value wholesale: a replace-class key that is not null; a named entry
that is not a mapping or lands on one that is not, else the entry's immediate field (`overlayEntry` sets it whole); a
section value that is not a mapping or lands on one that is not, at any depth; any list. A file that replaces at a prefix
of the path takes the fault whatever an earlier file states beneath it; otherwise the longest stated prefix still decides,
the later file on a tie, so the cases fin45 pinned (a sibling key in the same section, a top-level null, a legacy role
name, a dotted model name) read as before.

Pinned in `packages/config/src/load.test.ts` (REQ-CONFIG-478 block), each red on `0c513e0`: "a field missing from a
models entry the workspace file replaced wholesale is the workspace file's" (the three-file reproduction above, through
`loadConfiguration`), and "a fault beneath a list item names the file whose list the merge kept" (`statingFile` over a
replaced list, with the overlay-only, field-overlay and nested-entry-mapping answers beside it); "the replacement walk
finds where a file replaces wholesale under each merge class" pins `replacedPrefixLength` itself. In the built app,
`notice-proof` section 1d (a merged-document fault in the global file) still names the global file and scope.

No reader raises a fault on a value missing beneath a list today (list items are reported as `<key>.<n>`, a step
`statedPrefixLength` does not take), so the list case is pinned on `statingFile` directly; the models-entry case is
reachable through the load.


Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`, optional finding on Task 1) and taken as acceptance
finding C9 of fin46; confirmed on `fin46-accept1-17` (cut from `origin/main` `0c513e0`) with two failing cases in
`packages/config/src/load.test.ts`.

`statingFile` (`packages/config/src/load.ts`) names the file of a fault found on the MERGED document as the scope file
stating the longest prefix of the fault's path, the later in merge order on a tie. It does not know where the merge
replaced a value wholesale (REQ-CONFIG-044/046: a named entry over a non-mapping, a nested mapping or a list inside an
entry; REQ-CONFIG-050: any list; a scalar or list over a section's mapping). Beneath such a point the merged value is the
later file's in every part, but an earlier file that happens to state a deeper path still wins on length. A fault on a
value **missing** there is then reported in a file whose value the merge discarded.

Reproduced with `loadConfiguration` over three scope files: the global `agents.yaml` holding
`models:\n  m: { provider: openai, model_id: x }`, the global `models.yml` holding `models:\n  m: oops`, and the workspace
`agents.yaml` holding `models:\n  m: { model_id: y }`. The workspace entry replaces the global `models.yml`'s non-mapping
whole, so the merged `m` has no `provider`; the fatal report names the global `agents.yaml` (global scope) at
`models.m.provider`, the one file whose `provider` the merge did not keep, where the workspace `agents.yaml` is the file to
edit. The same walk over a list item (`runtime.roots[1].b`, an earlier file's item stating `b`, the later file's list
replacing it without) names the earlier file too.

## Specs

REQ-CONFIG-478 (the fatal report names "the offending file, by full path and by which scope it belongs to"), read with the
merge classes of REQ-CONFIG-040..050 that decide which file's value the merged document holds at a path.

## Relevant files

- `packages/config/src/load.ts` — `statingFile` and `statedPrefixLength`, the longest-prefix rule that ignores where the
  merge replaced a value.
- `packages/config/src/merge.ts` — `mergeLayers`, `overlayEntry` and `overlaySection`: the rules that decide where a later
  layer replaces wholesale.
- `packages/config/src/load.test.ts` — the REQ-CONFIG-478 cases.
