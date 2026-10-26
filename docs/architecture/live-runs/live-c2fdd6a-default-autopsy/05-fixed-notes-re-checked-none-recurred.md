# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Fixed notes re-checked: none recurred

Part 5 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Fixed notes re-checked: none recurred

| note | what this pack shows | verdict |
|---|---|---|
| `continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md` | OQ-162 row | holds |
| `a-continuations-run-timing-starts-after-its-pre-flight-where-a-launchs-counts-it.md` | G8 row | holds |
| `the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` | G5 row | holds (agreeing case) |
| `an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md` | G6 row | holds |
| `an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md`, `an-advertised-schema-marked-async-compiles-a-check-that-never-refuses.md` | no schema-failing MCP call | not exercised |
| `the-folded-blocked-rail-breaks-its-label-inside-the-word.md` | G7 row | holds |
| `the-users-own-pause-is-logged-at-warning.md` | resume session.log 15:50:36.915 INFO | holds |
| `the-run-writes-timeline-events-outside-its-closed-vocabulary.md` | OQ-157 row | holds |
| `the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md` | G10 row | holds |
| `nothing-marks-where-the-last-instruction-file-ends-so-agents-read-the-mcp-section-as-part-of-it.md` | H4 row | holds |
| `write-files-first-use-refusal-recurred-under-duress.md`, `a-rejected-todo-replace-names-an-active-task-it-never-stored.md` | 3 of 3 `write_file` sent `operation`; no `replace` refused | not exercised |
| `a-disabled-servers-unresolved-placeholder-line-says-a-key-would-make-it-available.md`, `the-unresolved-placeholder-warning-names-no-configuration-file.md` | 10 of 10 launches: "…in its url, from the built-in defaults, could not be resolved …; the server is disabled by its configured 'enabled: false' (REQ-CONFIG-465), so nothing connects to it, and enabling it will also need the placeholder resolved" (`info`) | holds |
| `the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md` (ruled as built, OQ-201) | shell app.log: card `touched=4 uncommitted=2`, Git view `uncommitted=4`; shell.png "4 files touched · 2 uncommitted" | as ruled |
| `the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md` (PD-CHAT-008) | terminal.early.png "Run active 0:23", 80 s into the run, with the 30 s wedge in flight since the newest row | as ruled |
| `the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md` | no `git status` in either checkout (edit #20, resume #11/#15, requirements #26/#38/#45) lists `.gitignore` or `.serena` | holds |
| `a-first-run-workspace-never-gets-the-starter-agents-yaml.md` | sign-in app.log 15:47:15.348 "configuration bootstrap at the open of …/workspace: written"; 15:47:19.899 "…: exists" | holds |

---
