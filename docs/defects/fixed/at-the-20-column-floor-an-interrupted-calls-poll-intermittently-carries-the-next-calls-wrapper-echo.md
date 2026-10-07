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

## Outcome — repaired 2026-10-07 (fin30)

**The cause.** After `C-c` dash prints a line end and its prompt (`\n# `) when it takes the interrupt, and the closing call's
wrapper can be written before it does: the line discipline then echoes the wrapper from the `^C` row on (`^Cprintf '%s\n'
'__r` is exactly 20 columns), and the prompt lands wherever dash's write meets the echo. In the failing run it landed one
character before the end statement's closing `"` — the leaked text's `"$?# "` is `"$?`, the prompt's row break, `# ` and
the `"`. The joined-rows match (`ECHOED_POSIX_WRAPPER`) no longer met the wrapper; the stray-echo filter then dropped the
row carrying its head, `^Cprintf '%s\n' '__r`, and with it the first three characters of the closing call's start marker,
so the cut at that marker (`until`) found nothing and every later row of the echo reached the poll. Measured with the
paused screen dumped on every poll: 30 runs of the 20-column case at load 4.9 to 8.7 all passed, and in 6 of them the echo
began on the `^C` row with the prompt after it, on the printed marker's row — the race this note names, decided the other
way. The failing order (prompt inside the echo) did not recur in those runs; the unit test below rebuilds it.

**The repair** (`ForegroundSession.cleanLines`, `packages/agent-tools/src/terminal/foreground.ts`): a paused call closed by
the next call is cut where that call begins, looked for in the rows **before** the stray-echo filter — the head of an
echo and the first character of its marker (`printf '%s\n' '_`, `ECHOED_POSIX_HEAD`) cut at the column it begins, which
keeps the `^C` it shares a row with, or the next call's start marker standing whole, cut at its row. One prompt splitting
the echo anywhere past its first sixteen characters leaves nothing of it; inside those sixteen it leaves at most that
much (`printf '%s\n' '`, no marker, command or end statement). Not changed: where the joined match still meets the echo
(a prompt inside the command's own text, which the match's lazy body takes in) the `^C` row goes with it, as it did
before; and a prompt landing after the whole echo but before its line end leaves the prompt's own row (`#`), a shape
built in the test's synthesis and not measured.

**Pinned by** "REQ-TOOLS-127/128: the next call's echo is cut from a paused call's poll wherever the shell's prompt lands
inside it" (`packages/agent-tools/src/terminal/terminal.test.ts`): the 446-character wrapper of road two with the prompt
at every position inside it, at 20, 30 and 80 columns, plus the observed shape verbatim; red on `a68f121` (first at
position 16, 20 columns). The real-PTY cases at the 20-column floor and the wide-echo roads stay green; the 20-column case looped
twelve times after the repair, twelve green at load 5.7 to 17.1, and `pnpm terminal-stream-proof
--skip-build` passed (load 8.8 to 9.4).
