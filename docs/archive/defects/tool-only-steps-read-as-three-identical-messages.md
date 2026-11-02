## The loop supervisor's raw-count fallback reads tool-only steps as three identical messages

Every step is observed as a `message` event carrying the assistant's text, and a step that only called tools carries
`''`. When the loop classifier times out on a raw-count trigger, the fallback declares a loop if the last three messages
normalise equal, and three empty texts do. A child making steady, distinct edits is told to "pause and reassess" from
counts alone. The test of the fallback never feeds the empty message events a real turn records.

Live-run finding: D3 (live runs of 2026-09-29)

## Specs

- `REQ-ORCH-104`: on a raw-count trigger, "declare a loop only from repeated identical assistant messages (last 3
  normalized-equal) or ≥ 4 consecutive same-tool calls — never from counts alone". Three steps with no message are not
  three identical messages.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`, timeline #37 (03:34:27.350): trigger raw-count after `d`'s 61st tool call (threshold
  60). The classifier (#158) answered at 03:34:50, `"loop_detected": false … distinct documentation corrections followed by
  verification reads`, after the 2 s bound had fallen back. The injected "Pause and reassess read_memory around
  /todos-pure-functions…" reached a child with 20 successful edits.

## Relevant files

Line numbers are those of `origin/main` 5c7de7c, before the repair.

- `packages/engine/src/run/supervisor.ts:150`, `:184-189` — `rawFallbackHasEvidence`; `:70` — `normaliseMessage`.
- `packages/engine/src/run/turn.ts:305` — `observe({ kind: 'message', text: report.text })`, `''` on a tool-only step.
- `packages/engine/src/run/supervisor.test.ts:72-74` — `rawClear`, with no empty message events.

## Outcome — repaired 2026-09-29 under R-067

`LoopSupervisor.rawFallbackHasEvidence` (`packages/engine/src/run/supervisor.ts`) now reads a message that normalises to
nothing — a tool-only step's `''`, or whitespace — as no assistant message: REQ-ORCH-104's "last 3 normalized-equal" is
taken over the last three messages with text, so three tool-only steps are no evidence, and three identical texts with
tool-only steps between them still are. The turn still observes every step's text as before (`run/turn.ts` unchanged),
so the message count REQ-ORCH-101's raw trigger reads is unchanged; whether a tool-only step should count there is
[OQ-126](../../architecture/open-questions.md), open, raised by this repair. The four-consecutive-same-tool limb is
unchanged.

Pinned by `packages/engine/src/run/supervisor.test.ts`: the fallback's `rawClear` case now feeds the empty message event a
real turn records before each step's calls, and four cases under "REQ-ORCH-104: a raw-count fallback never reads tool-only
steps as identical messages" — distinct edits and reads in tool-only steps declare no loop; whitespace-only texts are no
message; three identical messages with tool-only steps between them are still evidence; four consecutive same-tool calls
in tool-only steps are still evidence. The first three, and `rawClear`, failed on the code before the repair (the first two
and `rawClear` declared a loop; the third declared none).

**Not reached live.** The duress live run on the repaired branch (2026-09-29, pack `.live-run/runs/2026-09-29T12-40-51-800Z/`
of the `fix-turn-accounting` worktree, git-ignored, session `c0066cc5`) never tripped the raw-count trigger: its busiest
agent made 54 calls against the threshold of 60, the recorded traffic holds no loop-classifier request, and the timeline no
`loop_supervisor_activation`. The repair is pinned by the unit cases above only.

*Added 2026-10-07 (fin32), the sentences "The four-consecutive-same-tool limb is unchanged" and "Not reached live" kept as
written:* the unchanged limb reached live at the final duress run at `a68f121` (session `e6747bd0`, finding D6; timeline
entry 43, `trigger: raw-count`). With the classification cut at 1,915 ms it read four `read_file` calls over two files of a
child checking its own document as a loop and told the child to "Pause and reassess read_file around docs/decisions.md …".
OQ-232's ruling narrowed the limb by [`PD-ORCH-016`](../../product/directives/pd-orch-016.md#pd-orch-016): four calls are evidence only
when they are the same action, name and whole arguments
([`the-raw-count-fallback-declares-a-loop-on-four-reads-of-different-files.md`](the-raw-count-fallback-declares-a-loop-on-four-reads-of-different-files.md)).
