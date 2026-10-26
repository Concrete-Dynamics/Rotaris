# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 7's three surfaces made to agree — 2026-10-13 (`PD-LIBRARY-002` revision 2, OQ-236, R-072)

Part 8 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 7's three surfaces made to agree — 2026-10-13 (`PD-LIBRARY-002` revision 2, OQ-236, R-072)

Decision 7 says three surfaces raise the same command, and they did not behave the same. The Library's and the Overview's
buttons were disabled whenever any analysis ran, a post-run one included, with "An improvement analysis is already
running."; the palette entry, listed always, raised the command and the job queued — which is consequence 2's reading, and
REQ-LIBRARY-125 lets no control be disabled while analysis runs. Nothing anywhere refused a second retrospective while one
was already queued or running in the workspace. Revision 2's clause (e) fixes the one state that rests the gesture: a
retrospective of this workspace queued or running. **Built:** the coordinator answers `retrospectivePending(workspaceId)`,
main sends each main window its own workspace's answer on `improvement:activity` (`retrospective_pending`), both buttons
are one `RetrospectiveGesture` reading it, and the handler refuses a press while it holds or while a capture is in flight,
with one info notice and no capture. **Measured:** `pnpm retrospective-proof`, 42 of 42 at a load average of about 5 on
four CPUs: while the pass ran the Library gesture read `aria-disabled=true` with the new reason, the palette's entry posted
one info notice and the store still held exactly one artifact afterwards, and the gesture was available again when the pass
ended. **Not measured in the built app:** a press made while a post-run analysis runs (the proof drives no run); the unit
cases in `main/improvements.test.ts` and `library/retrospective-gesture.test.ts` carry it.
