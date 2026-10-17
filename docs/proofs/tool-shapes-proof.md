# `tool-shapes-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/tool-shapes-proof.mjs`](../../apps/desktop/scripts/tool-shapes-proof.mjs).

Two single shapes of a tool call the live run could not be sure to ask (since 2026-10-13, fin42, N60): `hard-cap` saves `runtime.shell_command_timeout: 4` and a scripted `terminal` call with no `timeout` that prints every 0.5 s for 15 s, and reads it ended by that cap — hard timeout naming 4 s, exit 124, `session_reset`, the printed lines kept, a `terminal_timeout` issue referencing it — never by the soft pause (REQ-TOOLS-097's `hardMs`, REQ-CONFIG-116); `inferred-create` sends `write_file` with a path and content and no `operation` (the scripted `writeinfer` step) and reads the file created, PD-TOOLS-007's sentence in the result and `operation: create` in the record; `inferred-existing` sends it again over an existing file and reads the refusal saying so, the content untouched, and its `tool_error` issue (REQ-SESSION-136)
