# Resolution Record — Domain 01, Multi-Agent Run Orchestration — Graphical-only sweep

Part 1 of 4 of [domain 01's resolutions](../01-run-orchestration.md), which indexes every part.

## Graphical-only sweep

The document was written around two hosts that no longer exist — a background command-line host and
an interactive terminal-UI host. One requirement existed only to hold those two hosts to the same
behavior and is withdrawn. Everything else the sweep touched was a *venue* change rather than a
capability loss: a surface that named the terminal now names the desktop interface, and the
substance is unchanged.

| Withdrawn | Why its only surface was a shell or text-mode screen | Capability now carried by |
| --- | --- | --- |
| **REQ-ORCH-001** — a run started from the background/headless command-line host and a run started from the interactive terminal UI host reach the same orchestration outcome, differing only in presentation, in the run override, and in how a message-limit pause is surfaced | The whole requirement was a parity contract between two entry points, both removed. With no command line and no text-mode interface there is no second host for the first to be compared against, and no reading of the requirement survives the removal of either side | **REQ-ORCH-150** (new). The capability underneath the parity contract is *a run that does not change because of who is watching it*. It is restated over the axis that still exists: a run reaches the same intent handling, delegation and iteration rules, verification gating, stop reason and terminal status whether its view is attached for the whole run, for part of it, or never opened; attaching, detaching, closing the window and switching views change only what is shown. The single permitted difference is carried forward intact — the message-limit pause is a dialog when a view is attached (REQ-ORCH-086) and takes the detached path when none is (REQ-ORCH-087) — and the run override of REQ-ORCH-025, which the draft listed as a host-supplied difference, is now available to every run alike |

Process exit codes are withdrawn as a concept rather than as a requirement. The application does not
exit when a run ends, so an exit code is a script-oriented output with no venue here. **REQ-ORCH-083**
keeps the whole of its substance — the status vocabulary `completed`, `failed`, `max_iterations`,
`interrupted`, `error`, the stop-reason mapping, the session-status fallback, and the
never-raises rule — and loses only the numeric codes. (Two of those were later re-sited by
cross-domain reconciliation without changing what they say: the stop-reason set and its total mapping
onto this vocabulary are REQ-MONITOR-301's, and the no-stop-reason fallback onto the persisted
execution status is REQ-SESSION-076's. REQ-ORCH-083 keeps the status vocabulary, is the product's
single definition of it, and holds no copy of either of the other two.) The Data & Formats section, the Overview, and
the three requirements that mentioned an exit code in passing (REQ-ORCH-136, REQ-ORCH-137,
REQ-ORCH-138) are amended the same way. Nothing that consumed a status loses anything: the status
vocabulary is unchanged and remains citable by other domains.

Five further requirements named a terminal venue beside their substance. Each keeps the substance
and changes only the venue, so nothing is withdrawn and no capability moves:

- **REQ-ORCH-014** — "In the interactive host, a transient `Classifying intent...` status" becomes
  the desktop interface showing a transient status before the call and replacing it in place with
  one carrying the classified category identifier. Under decision 5 the four quoted literals give
  way to required information content; the category identifier stays exact and REQ-SHELL-149's
  no-colour-alone rule is cited.
- **REQ-ORCH-066** — "functional in both attached (interactive) and background sessions" becomes
  functional whether or not a view is attached, citing REQ-ORCH-150.
- **REQ-ORCH-086** — the terminal modal with `c`/Enter, `d`, `x`/Escape single-key bindings becomes
  a desktop modal dialog carrying the same three actions and the same three pieces of information,
  presented in the action vocabulary of REQ-SHELL-048, keyboard-reachable and fully labelled at the
  minimum window size (REQ-SHELL-022). The shortcut assignments belong to the desktop shell.
- **REQ-ORCH-087** — "In background mode" becomes "where no view is attached to the session". The
  signal file, the `paused_message_limit` execution status, the never-auto-continue rule and the
  command-palette entry are all retained; a signal file in the session directory is durable state,
  not a shell surface.
- **REQ-ORCH-025** — the "host-selected" run override becomes a user-selected run option chosen in
  the desktop interface where the run is started. Its substance is settled at open question 14
  below.

Nothing else in the domain needed rescuing. The word *host* elsewhere in the document denotes the
application layer that embeds this engine rather than an entry point, and is left as written.
