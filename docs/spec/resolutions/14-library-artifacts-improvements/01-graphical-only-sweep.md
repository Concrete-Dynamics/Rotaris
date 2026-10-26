# Resolution Record — Domain 14, Library, Artifacts, and Improvement Proposals — Graphical-only sweep

Part 1 of 2 of [domain 14's resolutions](../14-library-artifacts-improvements.md), which indexes every part.

## Graphical-only sweep

The product has no command line and no text-mode interface. Fourteen requirements of this domain
described only those surfaces and are withdrawn in place. Removing the entry point removed no
capability: each one below names the desktop requirement that now carries what it did.

| Withdrawn | What it was | Capability now carried by |
| --- | --- | --- |
| REQ-LIBRARY-079 | `improvements` command group, help text, `--workspace` flag | REQ-LIBRARY-166 and REQ-LIBRARY-167 (inspect the workspace's improvement artifacts); REQ-LIBRARY-169 through REQ-LIBRARY-171 (roll an applied improvement run back). Workspace selection is already a desktop capability (REQ-SHELL-010, REQ-SHELL-021). |
| REQ-LIBRARY-080 | Process exit codes 0 / 1 / 2 | REQ-LIBRARY-167 (artifact absent is reported), REQ-LIBRARY-170 (a declined confirmation changes nothing), REQ-LIBRARY-171 (a refused or failed rollback is reported with its reason). |
| REQ-LIBRARY-081 | `improvements list` padded-column text listing | REQ-LIBRARY-166 — desktop improvement-artifact list: id, generation time, whether a rollback point exists, per-status proposal counts. |
| REQ-LIBRARY-082 | `improvements show` detail and history text tables | REQ-LIBRARY-167 (artifact detail, rollback point, proposal table) and REQ-LIBRARY-168 (recorded version history, previously reachable from no other surface at all). |
| REQ-LIBRARY-083 | `improvements rollback` preview printing, `--force` | REQ-LIBRARY-169 — preview shown in a modal dialog before anything is written, with the per-path label vocabulary and the work-done-since warning. |
| REQ-LIBRARY-084 | Terminal confirmation prompt, `--yes`, non-interactive stdin refusal | REQ-LIBRARY-170 — explicit confirmation defaulting to Cancel, plus the separately activated override for the dirty-tree refusal only. |
| REQ-LIBRARY-085 | Success output lines | REQ-LIBRARY-171 — persistent success notice conveying files changed, proposals returned to `pending_review`, and the safety checkpoint. |
| REQ-LIBRARY-086 | Output contract binding the command group's text | REQ-LIBRARY-164 — the cross-surface obligation is agreement about stored state, which survives without the command group. |
| REQ-LIBRARY-144 | Text-mode review screen, header, key bindings | REQ-LIBRARY-109, REQ-LIBRARY-110, REQ-LIBRARY-166, REQ-LIBRARY-167 (review one artifact's proposals); REQ-LIBRARY-175 (the `p` reset-to-pending decision, which no desktop surface previously offered). |
| REQ-LIBRARY-145 | Text-mode proposal table and status labels | REQ-LIBRARY-109 (columns and status labels), REQ-LIBRARY-111 (selection kept by proposal id), REQ-LIBRARY-164 (same on-disk review semantics). |
| REQ-LIBRARY-146 | Reload on a vanished proposal; persistence-failure notice | REQ-LIBRARY-173 — desktop handling of a store that moved underneath the user, and of persistence, listing and loading failures. |
| REQ-LIBRARY-147 | `s` — start an improvement run from the review screen | REQ-LIBRARY-172 — "Start improvement run" on the improvement-artifact detail, including the nothing-approved and failed-start reports. |
| REQ-LIBRARY-148 | Text-mode palette entry, cheatsheet entry, `/improvements` | REQ-LIBRARY-174 — an "Improvement proposals" entry in the window's single action vocabulary (REQ-SHELL-048), so it appears in the command palette and the composer's slash catalogue, plus the no-artifacts and failure states. |
| REQ-LIBRARY-149 | Reachability without depending on a notification | REQ-LIBRARY-174 — the same guarantee, stated for the desktop entry points. |

Two further consequences of the sweep, applied to requirements that were not themselves
shell-surface requirements:

- REQ-LIBRARY-074, REQ-LIBRARY-163 and REQ-LIBRARY-072 no longer speak of a `--force` flag; the
  dirty-tree override is the deliberate user choice of REQ-LIBRARY-170.
- REQ-LIBRARY-158 and REQ-LIBRARY-164 no longer name the terminal-UI review screen or a fresh CLI
  invocation as surfaces that must agree; the Overview and the Data & Formats section were amended
  to match, and the CLI output-format block was replaced with the desktop inspection and rollback
  contract.
