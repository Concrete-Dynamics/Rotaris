# EXEC slice — architecture proposals — 5. Summary of items for the product owner

Part 9 of 9 of [the exec proposal](../exec.md), which indexes every part.

## 5. Summary of items for the product owner

| # | Item | Where |
|---|---|---|
| 1 | Does the `tmux-pool` terminal backend ship, or is it withdrawn together with `pane_replaced` and `replace_failed`? | ADR-EXEC-06, OQ-1 |
| 2 | Native Windows has no confinement mechanism at all under REQ-SANDBOX-065. Accept, amend, or make WSL2 the supported Windows path? | ADR-EXEC-08 |
| 3 | Custom tool plugins are specified as in-process Python; the stack is Node. Amend the language, bundle an interpreter, or drop the capability? | ADR-EXEC-12, C-144 |

Ten further open questions (OQ-1 to OQ-10) are specification questions rather than product decisions
and are listed in section 3. OQ-2 (stream frame payload), OQ-3 (shell state under confinement) and
OQ-4 (contradictory host canonicalization) block ADR-EXEC-07, ADR-EXEC-08 and ADR-EXEC-09
respectively and should be resolved before those are ratified.
