# The proposals — five slices, before the Architecture Gate

The architecture proposals the ADRs were consolidated from: one file per slice (DATA, EXEC, MODEL, RUNTIME, UI), each
holding the slice's numbered proposals and the argument for them. **Status: proposal — nothing here is approved**, and
every proposal below has since been consolidated into an ADR, reversed by one, or qualified. The record of what was
decided is [`../adr/`](../adr/README.md) and its index, §7 of [the architecture README](../README/13-7-index-of-decisions.md).

**Kept, and not deleted, on purpose:** where a proposal argued a case the consolidated decision *reverses* or qualifies,
the argument is preserved in the ADR rather than replaced by the conclusion, and the proposal's own text stays here
beside it. A reader who wants to know what was considered and not taken reads this folder.

## What is here

- **Five proposals, one per slice**, each over the document budget and therefore an index: since 2026-10-26 a file is
  a title, its slice header (the domains it owns, its status and date) and a table of its parts; the text moved
  verbatim into the folder of the same name — `data.md` and `data/`, and the same for the four others
  ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text, so a link to one now names
  its part. **All five have parts** on 2026-11-05.
- **The slice's numbering is provisional** (`ADR-DATA-NN`, `ADR-EXEC-NN`, …). The synthesis step assigned the final
  numbers, which is the `Origin:` field an ADR's header carries — `ADR-DATA-08` in ADR-0002's origin line, for example.
  A slice number is never the same as an ADR number, and neither ever changes.

## The five slices

| Proposal | Slice | Domains it owned | Parts |
|---|---|---|---|
| [data.md](data.md) | DATA | 06 `REQ-GIT`, 08 `REQ-TRACE`, 14 `REQ-LIBRARY`, 15 `REQ-CONFIG` | 25 |
| [exec.md](exec.md) | EXEC | 05 `REQ-TOOLS`, 10 `REQ-SANDBOX` | 9 |
| [model.md](model.md) | MODEL | 04 `REQ-PROVIDER`, 16 `REQ-MCP` | 8 |
| [runtime.md](runtime.md) | RUNTIME | the process topology, the run loop and the store | 10 |
| [ui.md](ui.md) | UI | 03 `REQ-CHAT`, 11 `REQ-STARTUP`, 12 `REQ-SHELL`, 13 `REQ-WORKSPACE`, 19 `REQ-NOTIFY`, 21 `REQ-UIBENCH` | 10 |

Two slices are the reason a reader comes here rather than to an ADR: **RUNTIME**'s numbering is provisional
(`ADR-RUNTIME-NN`, and the file says so), and **MODEL**'s file opens with YAML front matter instead of the header
sentence the other four use — both as the slice was written, and neither is corrected retroactively.

## Where a new proposal goes

Nowhere: this folder is closed. A slice's proposals were consolidated once, at the Architecture Gate, and the gate has
been closed since 2026-09-03. A later case for a change is a `Revised` bullet on the ADR that decided it, a new ADR, or
— where an owner's decision departed from a requirement — a directive
([`../../product/README.md`](../../product/README.md)).
