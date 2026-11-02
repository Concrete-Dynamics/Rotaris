## A session action sent with `background: true` is refused as a missing command, and nothing says how to send one

`terminal`'s description names only "`query` / `kill`" for a background session's id and never says that a session action
(`session_action`: `query`, `kill`, `send_input`, `send_signal`, `list`) is sent with `background` false or absent. A model that
sends `send_signal` with `background: true` meets dispatch's rule that `background` outranks `session_id` (REQ-TOOLS-120): the
call is read as a new spawn with an empty command, and the refusal reads only "A command is required when background=True."
(REQ-TOOLS-101's fixed text), which names no remedy. Live-run finding Q1 of the final default pack at `552d346` (2026-10-13,
frictions `f16b13fe`): `#5` (`background: true, command: "", session_action: send_signal, session_id: ts_…, signal: SIGINT`) and
`#6` (the same without `command`) were both refused (issues 1–2, `tool_error`); `#7` with `background: false` sent the signal;
the model's reasoning at t#6: "The send_signal path requires background not to be true." Cost: 2 refused calls, 2 `tool_error`
issues, about 3.8 s, in any run that signals a background session.

## Specs

- REQ-TOOLS-110 (the five session actions). No requirement fixes the description's text beyond REQ-TOOLS-104's Windows
  sentences, so saying how a session action is sent is covered work under REQ-TOOLS-110.
- REQ-TOOLS-101 (the refusal's exact text) and REQ-TOOLS-120 (`background` outranks `session_id`) are faithful as built and
  are not changed: a different refusal text, or a session action outranking `background`, would need a ruling.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts` — `TERMINAL_USE` and `terminalDescription` (the description), `execute`'s
  validation (the refusal) and dispatch (`background` first).
- `packages/agent-tools/src/terminal/terminal.test.ts` — the description's tests.

## Outcome (fin38, 2026-10-13) — repaired

`terminal`'s description (`TERMINAL_USE`, every backend) now says, beside the background sentence: "A session action
(`session_action`: `query`, `kill`, `send_input`, `send_signal`, or `list`, which needs no id) is sent with `session_id` and with
`background` false or absent: `background=true` always starts a new command, so it needs one." The refusal's text
(REQ-TOOLS-101) and the dispatch order (REQ-TOOLS-120) are unchanged. Pinned by `terminal.test.ts` ("REQ-TOOLS-110 (live-run
Q1): the description says a session action is sent with session_id and background false or absent"), red without the change.
No proof reads the description; **what a live run should show**: in the `frictions` scenario, the signal to the background
session sent with `background` false or absent on the first try, and no "A command is required when background=True." issue.

## Reported back 2026-10-13 (fin41): the default live run at `0bc3eee`

The repair's first live execution held, once. In the `frictions` scenario (session `652a40e8`) the signal went out with
`background: false` on the first try (`#5`, `session_action: send_signal`, after `#4` started the background session) and
stopped it ("killed (exit -1)" at `#6`); 0 "A command is required when background=True." issues, against 2 refused calls at
`552d346`. One sample. Read from a copy of the pack:
[`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in
[`first-executions.md`](../../architecture/first-executions.md).
