## A persona window at rest can keep a first view without its transcript

In REQ-CHAT-008's recovery state, the fourteenth review round popped out the run-level agent's persona window and it
read `orchestrator paused`, `0 rows` and "No transcript activity for this agent yet.". Meanwhile the main transcript
showed the root's rows from before the crash. After Continue, the same window showed them. The run-level agent's last
activity, which clause 13 keeps (OQ-100), was missing from that window while the session rested.

This round did not reproduce the picture. Two drives on the same head showed the rows: one crash-left session with a
single child and one with the reviewer's three-child script, the window each time opened from the inspector after the
run row was selected in the Mission view. The one route found in the code is a gap in `PersonaApp`. Its first render
read the replica, and it subscribed only afterwards, in an effect. A transcript increment applied in between reached no
listener. In a live run the next publication covers the gap, but a session at rest publishes nothing more, so the window
kept its first view: the session, without the rows.

## Specs

`PD-ORCH-005` clause 13 ("keep its last activity"), as OQ-100 extends it to the run-level agent. REQ-SHELL-076's
coalesced refresh of an auxiliary window.

## Relevant files

- `apps/desktop/src/renderer/windows.tsx`: `PersonaApp`, which follows the replica.
- `apps/desktop/src/renderer/coalesced-follow.ts`: `followCoalesced`, the subscription it now uses.
- `apps/desktop/src/renderer/coalesced-follow.test.ts`: the test.

## Repaired — 2026-09-28

By the fourteenth fix round of the merged revision 4 build (R-065). `PersonaApp` follows the replica through
`followCoalesced`. It subscribes, delivers what the replica holds at that moment, and then keeps REQ-SHELL-076's
single trailing delivery per 120 ms, with none while hidden. Whatever was applied between the first render and the
subscription therefore reaches the window.

Evidence: `coalesced-follow.test.ts`, "delivers what was applied between the first read and the subscription…", red
without the delivery on subscribing. The repair closes the only route found. If the picture recurs, it has another
cause, and this note should be reopened, not duplicated. In the built app, the crash-left session's orchestrator window
shows its six rows.
