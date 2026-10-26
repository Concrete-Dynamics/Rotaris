# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more (continued)

Part 10 of 22 of [the codebase record](../codebase.md), which indexes every part.

**What `pnpm library-proof` does.** It launches the app six times over four scratch profiles: Ctrl+6 shows the view
with its title, its one field and the three tabs in order; a prompt stashed from the composer is in the store and is
still in the stash after the application is quit and **relaunched**; "Use" copies into the composer, switches view and
focuses it while the entry stays stashed, and "Use and remove" under a filter removes the row chosen and not the row
at that screen position; twenty writes in a burst settle with the last visible and the typed search text untouched;
201 history entries leave 200 with the oldest gone and no notice; a notice carrying `open-library` opens the named
tab. Evidence under `.proof/library-proof/`. Two of its assertions were rewritten at the Parts X/Y merge and the reason is
recorded there: the store version is asserted as "at least v11" (the ladder is asserted whole in `store.test.ts`) and
the Artifacts tab's body is now the real tab rather than the placeholder Part X supplied.

**What `pnpm artifacts-proof` does.** It launches the app six times: a scripted run publishes through
`artifact_write` and the row appears on the next refresh with no restart, its body file sits in the session's files
directory, and its sidecar is parsed by a **stock YAML parser in a separate node process** — frontmatter, then the
sections REQ-LIBRARY-090 names, in its order, with the empty ones absent; a two-child run materialises exactly two
`child_report` artifacts, each with one `artifact_published` timeline entry whose id is linked back onto the record;
an invalid tag refuses the publish whole, leaving no row and no file, in REQ-LIBRARY-089's own words; the inspector
opens on the selected row, saves, and the status cell reads `published · edited`, and re-opening the same id
re-raises the one dialog rather than a second; a body file deleted underneath leaves the record listed with Save
disabled and the failure stated once; and PD-LIBRARY-001's launch (2026-09-14) runs a child through three ordered
terminal calls — success, exit 7, and one the permission gate denies — and holds the whole command-ledger path at
once: the ledger in SQLite in the exact run order with the denied command carrying no exit status, the orchestrator
reading the report back through `artifact_read` with `sections: ['commands']` and receiving **only** the Commands
section (the tool path whose private allow-list closeout planning found predated the directive and silently returned
the whole document), the sidecar carrying the same statuses in words, and the inspector rendering that ledger. The
scripted dialect gained a verification-only `terminal:<key>` step for it, its arguments from `ROTARIS_SCRIPT_TERMINAL_ARGS` in the
shape of the artifact and MCP argument maps. Evidence under `.proof/artifacts-proof/`. Every launch clicks the Artifacts tab after
switching view — the Library opens on Prompts, REQ-LIBRARY-103's first tab. Since 2026-10-03 the first launch's empty
Library is read when the Artifacts tab has loaded, in one waited-for probe of its empty state and rows, and nothing
leaves the Library before that reading's deadline (`apps/desktop/scripts/lib/library-refresh.mjs`, the capture grammar's
`@from~ms`): its click, reading and leave had been appointments 400 to 600 ms apart, which a renderer answering 1.5 s
late during startup put out of order
([note](../../defects/fixed/artifacts-proofs-publish-launch-reads-the-empty-library-in-a-window-a-startup-stall-closes.md)).
