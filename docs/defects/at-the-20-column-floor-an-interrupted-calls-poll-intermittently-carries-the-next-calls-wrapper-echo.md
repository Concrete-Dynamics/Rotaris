## At the 20-column floor, an interrupted call's poll intermittently carries the next call's wrapper echo

Road two of `wideEchoCase` at the display's 20-column floor failed once in a full `pnpm check`. In that road, a paused
`sleep 20` is interrupted with `C-c`, and a 300-column `printf` call then closes it. The interrupted call's earlier output,
as the closing call reported it, carried the closing call's own wrapped echo: one 20-column row per line, starting
`ot_<nonce>a6f1f48_s'; command eval 'printf …QQQ…'; printf '__rot_<nonce>_e:%s\n' "$?# "`. The row that would have held
the leading `__r` was missing, so the echo was neither recognised nor dropped. The test expects none of `__rot_`, `QQQ` or
`"$?"` there. The case was "REQ-TOOLS-097/127/128: at the display's 20-column floor a call's capture and a paused call's
poll carry no frame and no echo" (`terminal.test.ts:1409`, failing at `wideEchoCase`, line 1389).

Observed 2026-10-06 at about 23:31 UTC on the branch `finacc3-accept1-9`, whose changes touch no terminal code. It happened
inside the whole suite, at load averages 1.6 to 3.4 on four CPUs, with nothing else running but the suite. The same case
passed three times in a row alone straight after (load 3.3 to 2.0). So the leak depends on timing: when a row of the echo
arrives relative to the interrupt's end, or how the PTY splits the echo's first row. It is not yet known which. Noticed
while gating finacc3's F05 repair; not investigated further.

## Specs

REQ-TOOLS-127: the echo of a next call reaches neither road's poll of the paused call. REQ-TOOLS-128: this holds at the
display's 20-column floor. The repaired notes
`docs/defects/fixed/two-terminal-pty-tests-fail-on-main-in-this-environment.md` (fin15, the echo as bash's readline
draws it) and `docs/defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md` (narrow
screens) covered the deterministic forms; this is an intermittent one at 20 columns under `dash`.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — `wideEchoCase` (road two, line 1389) and the 20-column case at
  line 1409.
- `packages/agent-tools/src/terminal/foreground.ts` — `withoutEchoedWrappers` and the end-statement match
  (`ECHOED_POSIX_END`), which recognise a wrapped echo by its rows. An echo whose leading row is missing or split is not
  recognised.
