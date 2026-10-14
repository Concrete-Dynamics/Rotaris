## Windows PowerShell 5.1's error text quotes the terminal's wrapper

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, Windows PowerShell
5.1.26100.9457 (German UI culture), at `3c3f4478` with B3's repair in the working tree (the Windows ARM64 session). When a
command's error is raised inside the script block `wrapCommand` runs it in, 5.1's error record, which the wrapper's
`catch` renders with `Out-String`, carries text the agent never wrote:

- `Write-Error 'boom' -ErrorAction Stop` reads `Write-Error 'boom' -ErrorAction Stop` / `$global:__rot_<nonce>_e_ok = $? :
  boom`: the record's command name is the script block's whole text, the flag's line included;
- every such record's position points at the wrapper's own line, `In Zeile:1 Zeichen:139` /
  `+ ... _s'; try { $global:… = [Text.Encoding]::UTF8.GetString( ...`.

pwsh 7's concise error view prints `Write-Error: boom` and `Exception: boom` and none of it. Before B3's repair the same
leak reached the agent on 5.1 in a different form (a single-line command's error quoted the exit expression,
`} else { if ($null -ne $LASTEXITCODE …`), and the multi-line path has always produced the form above. It is cosmetic for the
protocol (the end marker is matched only as `<end>:` followed by digits, which none of this is), but it hands the agent the
wrapper's internals and the nonce, and a 5.1-only agent reads more noise than its command produced.

Not repaired (record-only).

## Specs

REQ-TOOLS-127 and REQ-TOOLS-097 (the agent's capture is what the command wrote, the wrapper and the markers removed):
ADR-0020 consequence 2 keeps the echoed wrapper out of the capture, and an error record quoting the wrapper brings part
of it back.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `wrapCommand`'s `catch { … Write-Output ($_ | Out-String).TrimEnd() }`,
  the rendering of the whole error record.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the B3 case, whose wrapper-text assertion holds for pwsh only.
