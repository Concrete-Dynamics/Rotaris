## A cancel during the first call's handshake can read as cancelled before the command completed

`packages/agent-tools/src/terminal/terminal.test.ts`'s case "REQ-TOOLS-097/099 (OQ-144, acceptance round 1): a run's
cancel that lands while a fresh shell answers the first call's handshake ends the call at once, and the command never
runs" went red twice in a full `pnpm check` on Linux (2026-10-20, the skill-review of branch `skill-survey-fin29-47`,
a skill-Markdown-only change: once at `b987732`, 1 failed and 6,760 passed; once at `435a66f` while a second
`pnpm check` ran beside it, load 7.6 on 4 CPUs). Each time the call ended inside its 1.5 s bound, so the cancel was not
lost, but its text read "Terminal execution was cancelled by the run before the command completed, so it has no exit
code; its process tree was ended …" where the case expects "cancelled by the run before the command was written, so it
never ran" (line 1105). The file passed alone three times, and a full `pnpm check` on each head with the host quiet was
green.

*2026-10-22 (branch `platform-targets`, a packaging-configuration change that touches no `agent-tools` file):* red in
two consecutive full `pnpm check` runs on Linux (4 CPUs, load about 2.5), each 1 failed and 6,987 passed, with the same
text at line 1105. **It also went red with the file run alone**, once in three consecutive runs, so the full suite's load is not
needed to reach it.

Read from the code, not confirmed: `ForegroundSession` runs the first call's handshake only when the fresh shell's
process identity can be read (`processIdentity(p.pid) !== null`, `foreground.ts` about line 1474). If it cannot be read
yet under load, the handshake is skipped, the command is written to a shell still in its three-second startup, and the
run's cancel at 300 ms takes the "after written" branch. The command itself likely never ran, but the call reports a
written command and an ended process tree, and the case's own premise (the cancel lands inside the handshake) did not
hold.

*2026-10-22, later (R-081's two dependency branches, `deps-security-patches` and `deps-electron-44-3`, neither touching
`agent-tools`' code):* red in four of seven full `pnpm check` runs on Linux (4 CPUs, Node 26.8.1). Each failed 1 case with
the same assertion ("expected 'Terminal execution was cancelled by t…' to contain 'cancelled by the run before the
comma…'"), at loads from about 4.9 down to 1.3 at the run's start. It went red alone on untouched `b0d1b3ff` once more
(1 failed, 116 passed). Two of the three runs that passed this case were red on something else: another case in this file,
and a wording check the branch then fixed. On the Electron branch, two
consecutive gates of one unchanged tree were red here, so that branch stopped uncommitted under its brief's one-repeat rule.

## Specs

`REQ-TOOLS-097` and `REQ-TOOLS-099` with OQ-144's ruling (a cancel that lands before the command is written ends the
call at once, and the command never runs), and `PD-TOOLS-013` (OQ-226) for the cancel's wording. Whether the product's
text is wrong when the handshake is skipped, or only the test's premise fails under load, is what a repair must settle
first.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the case (lines about 1089 to 1113) and `slowStart`.
- `packages/agent-tools/src/terminal/foreground.ts` — the handshake's guard (about line 1474) and the cancel branches.
- `packages/agent-tools/src/terminal/index.ts` — the two cancel texts (about line 457).
