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

- `packages/engine/src/run/supervisor.ts:150`, `:184-189` — `rawFallbackHasEvidence`; `:70` — `normaliseMessage`.
- `packages/engine/src/run/turn.ts:305` — `observe({ kind: 'message', text: report.text })`, `''` on a tool-only step.
- `packages/engine/src/run/supervisor.test.ts:72-74` — `rawClear`, with no empty message events.
