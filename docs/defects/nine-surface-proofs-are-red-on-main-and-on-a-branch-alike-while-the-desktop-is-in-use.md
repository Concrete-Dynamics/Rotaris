## Nine surface proofs are red on `main` and on a branch alike while the desktop is in use

Seen on 2026-11-19 on the Linux agent host (X11 forced for the harness, Node 24.18.0), verifying `feat/workspace-run-panel`
(PD-SHELL-017) after its rebase onto `e425c5a7`. The owner's desktop was in use during the runs: a browser renderer held one
core and other windows took the keyboard focus. Each proof below was run on the branch and on `main`'s own build, back to
back, and was red on both:

| Proof | On the branch | On `main` (`e425c5a7`) |
| --- | --- | --- |
| `transcript-proof` | `two rows overlap by 30.7 px ["row:25","row:26"]` | the same line |
| `rows-proof` | `the expanded card carried no input: ""` | the same line |
| `mission-proof` | `the refusal text: message ""` (REQ-MONITOR-276) | the same line |
| `chat-controls-proof` | `the persistent incomplete notice: null` | `on activation the control relabels "Compressing…" and disables: []` |
| `artifacts-proof` | `the inspector did not open: []` | `following the link did not open the artifact in the Library` |
| `dictation-proof` | `the composer should hold focus after the text` (`"focused":false`) | the same line |
| `questions-proof` | `after the click 0 option cards were selected` | the same line |

Two more changed colour between runs of one head: `layout-proof` (the status strip's shortened label read at the width
before the resize, REQ-WORKSPACE-149) and `composer-proof` (`after the press the run-state label reads "Paused"`) were red
in the pass and green alone on both trees; `slash-proof` was green on the branch and red on `main`
(`the model chip picker did not close on Escape`).

All of them had been green on the branch's head the night before, on an idle desktop, `theme-proof` excepted (red on both
trees at contrast 1.25, recorded before). Most of the failing lines read a focus, a press or an Escape that did not arrive.

Not established: whether the cause is the keyboard focus another window holds, the load, or both; and whether
`transcript-proof`, `rows-proof` and `mission-proof` — the same line on both trees, twice — are a regression on `main`
rather than the host. They were not run on an idle desktop on this head.

## Specs

None contradicted that is known. A proof is evidence of the product (AGENTS.md, "The proof scripts"); these reds are
recorded as not attributed, not as passed.

## Relevant files

- `apps/desktop/scripts/{transcript,rows,mission,chat-controls,artifacts,dictation,questions,layout,composer,slash}-proof.mjs` — the proofs.
- `apps/desktop/scripts/lib/` — the driver and the bounded launch the proofs share; a press and a focus read go through it.
