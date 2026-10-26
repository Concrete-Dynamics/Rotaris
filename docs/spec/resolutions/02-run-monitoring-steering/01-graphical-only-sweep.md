# Resolution Record — Domain 02, Run Monitoring and Steering — Graphical-only sweep

Part 1 of 3 of [domain 02's resolutions](../02-run-monitoring-steering.md), which indexes every part.

## Graphical-only sweep

Seven requirements in the draft had a command line or a full-screen text-mode interface as their
only observable surface. Each is withdrawn in place; every capability that reached a user through it
is carried by a desktop-reachable requirement, four of them new.

| Withdrawn | What it specified | Capability now carried by |
| --- | --- | --- |
| REQ-MONITOR-001 | Indistinguishability of a graphical launch and a command-line launch — same session files, same lifecycle event kinds, same persisted status, same terminal result, same process exit code | **REQ-MONITOR-299** (new) — the same parity obligation restated over the venues that still exist. The exit-code clause is gone with the shell. *Corrected under SR-2:* the venues were listed here as "the focused window's own process versus a separate worker process (background run, worktree run, run owned by a second window)". A run owned by a second window is not a separate execution venue — every window belongs to the one instance and every run executes in that instance's run host — and REQ-MONITOR-299 as amended compares how a run was *started* and what is *watching* it, not where it executes. |
| REQ-MONITOR-095 | A `compress` command in the terminal interface: help text, no arguments, case-insensitive match, autocomplete entry, start/completion/no-agents/per-failure reporting | REQ-MONITOR-090 (run-header manual compress), REQ-MONITOR-091 (no-agents refusal), REQ-MONITOR-093 (in-progress message), REQ-MONITOR-094 (completion count and partial-failure listing) and REQ-MONITOR-097 (command-palette entry). Every reporting obligation of the withdrawn requirement already has a desktop carrier. REQ-MONITOR-096 was rewritten to bind manual compression however it is requested rather than to bind a command. |
| REQ-MONITOR-196 | A terminal-interface quota-exhaustion modal with two body variants and the choices keep waiting / cancel the run / change model now | **REQ-MONITOR-303** (new) — the desktop quota-wait decision surface, carrying the same three choices, both body variants, and the model picker, plus the obligations that follow from it being a window rather than a full-screen text mode (non-blocking, reachable again after dismissal, one per waiting session). |
| REQ-MONITOR-277 | A terminal-interface live list of active sub-agents with name, role, tool-call count and elapsed time | REQ-MONITOR-116 as amended — the overview's active-now card now carries the role (REQ-ORCH-028) and the tool-call count alongside the dot, name, activity and elapsed time it already carried — together with REQ-MONITOR-107 and REQ-MONITOR-111 for the live clock. |
| REQ-MONITOR-278 | Terminal-interface tree navigation on Ctrl+Down / Ctrl+Left / Ctrl+Right / Ctrl+Up with documented no-ops | **REQ-MONITOR-304** (new) — the delegation tree is fully keyboard-operable using the arrow, Home and End keys over its own depth-first row order, with the same boundary no-ops, selection having exactly the effect of a click, and no chord claimed that the application's action vocabulary already binds (REQ-SHELL-048, REQ-SHELL-049). |
| REQ-MONITOR-280 | The terminal-interface side panel: token estimate, tool servers with connection status, used-versus-unused tool list, warnings section, workspace path, active model, todos, scrolling | Token estimate: REQ-MONITOR-166, REQ-MONITOR-176. Tool servers and their connection status: domain 16. Granted tools with used distinguished from unused: REQ-MONITOR-060. Workspace path and active model: REQ-MONITOR-176. Todos with status: REQ-MONITOR-022, REQ-MONITOR-216. Warnings section: **REQ-MONITOR-305** (new) — a run warnings surface listing agents at 75% of their compression threshold, failed tool calls, and agent errors and unexpected exits, each naming its agent and each selecting that agent when activated. |
| REQ-MONITOR-282 | First interrupt signal stops the run gracefully, second force-exits; bound to background command-line runs and to the terminal interface | REQ-MONITOR-131 (ordered shutdown effects) and REQ-MONITOR-283 as amended (a quit request during a run takes the coordinated stop path, shows the remaining allowance, and a second quit request force-exits immediately). The two-stage stop survives; only the signal delivery, which needed a shell, is gone. |

Six further amendments follow from the sweep rather than from an open question.
**REQ-MONITOR-003** now defines *host* for the whole document — any surface of the desktop
application that drives or observes a run — instead of enumerating a graphical application, a
terminal interface and a headless invocation. **REQ-MONITOR-028** keeps the five-value terminal-result
vocabulary and loses the process-exit-code mapping — a later reconciliation round made REQ-ORCH-083
the product's single definition of that vocabulary, so REQ-MONITOR-028 now cites it and holds no copy,
keeping only the obligations this domain adds; **REQ-MONITOR-130** and **REQ-MONITOR-284** lose
their references to exit codes, and **REQ-MONITOR-130** is restated over the surfaces that can ask
for a cancellation. **REQ-MONITOR-033** replaces the `Error: ` text prefix — a stdout convention — with
an explicit failed-before-start marker carried as a field, and **REQ-MONITOR-264** cites that marker.
**REQ-MONITOR-107** loses its terminal-interface framing and its text-row composition, keeping the
measurement rule that every surface showing an elapsed figure obeys. **REQ-MONITOR-243** and
**REQ-MONITOR-248** name the venues that still exist instead of a command-line run and a headless
job. *Corrected under SR-2:* this record described those as "out-of-process **observation** venues".
They are not, and now say so: they are kinds of *run* — foreground, background, worktree, window
closed — all inside the one running instance, all observed by the same published updates. Both
requirements survive; only this record's account of why they say what they say was wrong. **REQ-MONITOR-279** and **REQ-MONITOR-281** are restated surface-neutrally. The
§ 31 heading became "Agent navigation, run warnings, and quitting during a run", and the
Data & Formats blocks lost the exit-code column and the terminal-interface qualifier on the
per-agent metric row.
