## A fatal report names a role stated under its legacy name by a name the file does not hold

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-16`, acceptance finding A1).** Confirmed first on the branch: the
`load.test.ts` case named below, rewritten to require `personas.oracle.purpose`, failed on `personas.codebase-analyst.purpose`,
and `notice-proof` section 1f (below) read the canonical path from the built app's open-time notice. `statingFile`
(`packages/config/src/load.ts`) still finds the file through the canonicalised document, and now also answers the fault's
path as that file spells it (`spelledAsStated`): the two positions REQ-CONFIG-062 canonicalises before the merge, a role key
under `personas:` and a key of that role's `tool_restrictions:`, take the spelling the file holds. Where one file states
both spellings of one role (field-merged, later winning per field), the one stating the longer prefix of the path is named,
the later on a tie, since that is the value the merge kept; of two `tool_restrictions:` keys naming one role, the later. The
fatal report's `path`, its rendered `lines` and the notice built from them carry that spelling, and so does a section
reader's warning on such a role (REQ-CONFIG-233, through the same search since the A4 repair in this bundle). A path no scope
file states keeps its path. A reader's MESSAGE that names the role itself (`personas.ts`'s "for role <name>" in the
permission-mode warning) still carries the canonical name: it names the role the product resolved, not a key in the file,
and REQ-CONFIG-478 fixes the key's path, not the message's wording.

Pinned by `packages/config/src/load.test.ts`: the case below, now "…reported under the name the file states", which also
requires the rendered line and no `codebase-analyst` in the lines; two spellings in one file (the canonical key stating the
field beside a later legacy key, and both stating it); a workspace legacy key over a global canonical one; a
`tool_restrictions:` key under the legacy name; the permission-mode warning on a legacy-named role; and `spelledAsStated`
itself. And by `notice-proof` section 1f (`global-legacy-role-fault`), which writes `personas: { oracle: { purpose: "two\nlines" } }`
into the driven profile's global `agents.yaml` and reads the open-time notice naming `<that file> at personas.oracle.purpose
(global scope)` — red on the unrepaired build (`… at personas.codebase-analyst.purpose (global scope): must be a single line
…`), green after. `03-runtime-view.md` §8 states the spelling.

Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`) while checking the repair of
[`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md);
not repaired, outside that bundle's tasks.

Legacy role names are canonicalised per scope before the merge (REQ-CONFIG-062), and the typed readers raise their faults on
the merged document, so the path in a fatal report carries the CANONICAL name. A global `agents.yaml` stating
`personas:\n  oracle:\n    purpose: "two\nlines"` is reported at `personas.codebase-analyst.purpose` in that file (pinned as
such by `load.test.ts`'s case "a role stated under its legacy name in the global file is found under its canonical name"):
the file is now the right one, but the key path names a role the file does not contain, so a user searching the named file
for it finds nothing.

## Specs

REQ-CONFIG-478 ("MUST identify the rejected key or value by its full path within that file"), REQ-CONFIG-062 (the
canonicalisation that renames the key before the reader sees it).

## Relevant files

- `packages/config/src/load.ts` — `resolveMerged` and `statingFile`: the latter already finds the file through the
  canonicalised document, and could map the path's role key back to the spelling that file states.
- `packages/config/src/merge.ts` — `canonicaliseRoles`.
- `packages/config/src/load.test.ts` — the case above, which asserts the canonical path.
