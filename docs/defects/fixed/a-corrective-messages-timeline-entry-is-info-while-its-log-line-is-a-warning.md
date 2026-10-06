## A corrective message's timeline entry is `info` while its session-log line is a `WARNING`

`recordCorrectiveMessage` (`packages/engine/src/children/stall.ts`) records REQ-NOTIFY-111's one corrective message twice:
a `child corrective message: …` line through the run's warning channel, at the session log's `WARNING`, and a
`corrective_message` timeline entry. It passed `SessionWriter.appendTimeline` no severity, so the entry took the writer's
default, `info` (REQ-SESSION-134's default). One fact therefore read as a warning in the session log and as informational on
the timeline, where an autopsy or an export (REQ-SESSION-199) reads it, beside the `stall` issue's own `warning` entry.
OQ-127's ruling keeps the line at `WARNING` because a failed model step precedes the corrective message; nothing kept the
entry apart from it.

Recorded 2026-10-06 (finacc3, acceptance finding F11; known finding (1) of the repair plans' verifiers), before the repair.

**Repaired 2026-10-06 (finacc3, bundle `finacc3-accept1-7`).** `recordCorrectiveMessage` passes `'warning'`, so the entry
carries the line's severity; the intended states (`waiting_on_tools`, `stall_recovered`) stay `info` on the timeline as in
the log. `SessionWriter.appendTimeline`'s rule for a caller's severity now names OQ-127's ruling as the reason this one is
not the default. Pinned by `packages/engine/src/children/stall.test.ts`: "REQ-NOTIFY-111: the corrective message is a
`corrective_message` entry, its line a warning…", red on the code before (`[['corrective_message', 'info']]`); end to end, by
`children/children.test.ts`'s "the step goes silent for the window and then fails…", which reads the stored entry's severity
(it pinned `info` before); and the REQ-MONITOR-118/120 case, which now reads both intended states' severities as `info`.
The runtime view's stall-watch paragraph says so. **Not shown in the built app**: no proof or live scenario reaches a
corrective message (a child silent for the stall window whose model step then fails), so the unit and end-to-end cases are
the evidence.

## Specs

- `PD-ORCH-014` adds `corrective_message` to REQ-ORCH-139's vocabulary for REQ-NOTIFY-111's corrective message; OQ-127's
  ruling keeps its log line at `WARNING`, "which follows a failed step". The entry's severity contradicted the line's.
- `PD-MONITOR-005` revision 2 and OQ-127's ruling: `INFO` for the intended states, `WARNING` for the stall warning and the
  corrective message — on the timeline the corrective message read as an intended state.
- REQ-NOTIFY-111, REQ-SESSION-134 (the entry's `severity`).

## Relevant files

- `packages/engine/src/children/stall.ts` — `recordCorrectiveMessage`, now passing `'warning'`.
- `packages/engine/src/session-writer.ts` — `appendTimeline`, its `info` default and the rule for a caller's severity.
- `packages/engine/src/children/stall.test.ts` — the cases that pin it.
