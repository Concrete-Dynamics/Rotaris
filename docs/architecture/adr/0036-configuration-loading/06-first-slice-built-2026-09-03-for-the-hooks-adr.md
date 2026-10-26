# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — First slice built — 2026-09-03, for the hooks (ADR-0015)

Part 6 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## First slice built — 2026-09-03, for the hooks (ADR-0015)

*Recorded under GD-10.* `@rotaris/config` exists with `yaml@2.9.0`, the document tree, the tri-state
(absent / null / value observed as three different things through the document API, as the DATA spike said),
and readers for **one section**: `hooks:` in both file scopes, with the list shorthand, the bare-key
semantics of REQ-HOOKS-011, every invalid entry reported at once with its YAML path, the scope stamped
before the merge, full-list substitution and the displaced lists kept. The entry point takes no database
handle. The default 1.2 core schema behaved as decided: `on` stayed a string, `true` folded and was un-folded
per field for the event vocabulary and rejected as an unrecognised member naming the seven. An unknown
top-level key was carried and ignored. **Not built:** the four merge classes beyond what the section needs,
the validating wrapper, the placeholder and secret passes, the four writers, the discovery layer, the
runtime keys — those stay environment stopgaps at the run-host root. Neither timing contingency of "Revisit
if" is measured yet: the hooks read is a few kilobytes and no settings save exists.

**Two more readers, 2026-09-04, for the playbooks and the intent gate.** `readPlaybookOverrides(dir)` reads a
directory of YAML files as `SLOT: { variant: text }` (decision 5 of the plan: the format is this build's, the
specification fixing none) and `readIntentMapping(file)` reads `intent-tools.yaml` as intent → `direct-work`
| `none`, rejecting any other value as REQ-ORCH-017's "obsolete instruction-text entry". Both are fresh reads
on every run (REQ-CONFIG-014); an unknown slot or variant is the engine's to warn about against the
catalogue. The loader still holds no merge classes, no writers, no runtime keys.
