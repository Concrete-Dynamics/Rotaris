---
reference: ROTARIS-CRW-001
domain: mcp-integration
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 16, MCP Server Integration


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - Nothing in this record is superseded by the storage rulings. It is annotated only so the absence is
>   deliberate rather than an oversight. MCP discovery files (`.mcp.json`) and `secrets.yaml` are material a
>   user edits and version control may track, so **SR-4** keeps them as files; the withdrawn
>   `mcp_toggles.json` row is unaffected because it was withdrawn with the terminal UI, not by SR-4.


This record disposes of every open question raised in the draft of
[`../16-mcp-integration.md`](../16-mcp-integration.md) (domain 16, requirement prefix `REQ-MCP`).
The body of that specification has been amended so that each decision below is stated normatively in
place; the numbering of the original open questions is preserved here so the draft and the resolved
specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. Requirements in this
   domain whose only observable surface was a shell invocation or a text-mode screen are
   **withdrawn**, and every capability that reached a user only through such a surface is carried by
   a new desktop-reachable requirement. See the graphical-only sweep below. Running external
   programs is untouched: MCP servers on the `stdio` transport are launched exactly as before, the
   bundled code-intelligence runtime is still spawned as a child process, and the project-setup
   steps still invoke that runtime's own command line. What is removed is any way for a *user* to
   drive this product from a shell.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, a parseable output format).
   Open questions asking only about phrasing, punctuation, separators, or inflection of a
   human-readable message are resolved by fixing the information the message must carry and leaving
   the wording to the implementation.

Cross-domain vocabulary was taken from `01-run-orchestration.md` (the default delegation role
vocabulary, REQ-ORCH-028), `02-run-monitoring-steering.md` (the closed tool-row status vocabulary
`running` | `ok` | `failed` | `blocked`, REQ-MONITOR-105), `12-desktop-shell-windows.md` (the seven
primary views and the Settings view among them, REQ-SHELL-023; the one action vocabulary presented
identically on every surface, REQ-SHELL-048; state never conveyed by colour alone, REQ-SHELL-149;
every control reachable and fully labelled at the minimum window size, REQ-SHELL-022; the
desktop-scoped preference store, REQ-SHELL-006), `15-settings-configuration.md` (the thirteen
settings category identifiers including `mcp`, REQ-CONFIG-269; the three built-in tool-server names
`web_search`, `browser` and `code_intelligence`, the `ROTARIS_SEARCH_API_KEY` environment variable,
and the deliberate leaving of third-party service identities to the implementation, REQ-CONFIG-181;
the `enabled` field and its `true` default, REQ-CONFIG-465; the MCP Servers category rows, toggle
initialization, empty state, probe partitioning and the health vocabulary, REQ-CONFIG-348 to
REQ-CONFIG-353; the authoring boundary of the settings screen, REQ-CONFIG-350 and REQ-CONFIG-464;
the default write scope, REQ-CONFIG-463; the two-level `secrets.yaml` shape and its per-key merge,
REQ-CONFIG-214 and REQ-CONFIG-215) and `20-event-history-replay-export.md` (the published event
catalog and the `tool.start` / `tool.finish` pair, REQ-EVENTS-041 and REQ-EVENTS-057). No other
specification was consulted, and no identifier, name, or phrasing was taken from any other
implementation.

New requirements added by these resolutions: **REQ-MCP-108** through **REQ-MCP-117**. No requirement
identifier was renumbered, reused, or deleted. Of the 33 open questions raised in the draft, 30 are
resolved and 3 (numbers 5, 19 and 32) are moot because they asked only about a shell or text-mode
surface that no longer exists; none are omitted, and none are escalated.

## Parts

Since 2026-10-26 the rest of this document is in [`16-mcp-integration/`](16-mcp-integration/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](16-mcp-integration/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](16-mcp-integration/02-dispositions.md) | Dispositions |
