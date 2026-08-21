---
req-id: SWR-2127
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Terminal tool module import robustness"
epic: SWR-500
date: 2026-07-23
---

# SWR-2127 — Terminal tool module import robustness

`src/rotaris_core/tools/terminal.py` re-exports the SDK's terminal action/observation
types and registers `HardenedTerminalTool` under the friendly name `"terminal"`
(`TOOL_NAME_MAP`). The SDK terminal backend inspects `sys.stdout`/`sys.stderr`
for an `encoding` attribute at import time; some hosts (certain daemonized or
piped-output launch contexts) provide streams without one, which would
otherwise crash the import. `_sdk_import_stdio_compat`/`_EncodingCompatibleStream`
paper over that gap so the module loads regardless of host stdio shape. This is
plumbing the terminal tool depends on to exist at all; it carries no product
behavior of its own beyond what SWR-500 already promises.

## Acceptance criteria

- Importing `rotaris_core.tools.terminal` succeeds even when `sys.stdout`/`sys.stderr`
  lack an `encoding` attribute.
- `HardenedTerminalTool.name` is `"terminal"`, matching the friendly name used
  to reference it from persona config.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
