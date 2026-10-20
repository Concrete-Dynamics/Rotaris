# Live run at `00957641` on Windows ARM64 — terminal, frictions, crlf

*Written 2026-10-20 by the Windows ARM64 session (its section 5, run 1), read-only against the packs in the
`Rotaris-crw-wt-arm64` worktree's `.live-run/runs/`. Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron
44.1.1 arm64, dev tree, pwsh 7.6.6 as the agent's shell; the code-intelligence runtime is the win32-x64 bundle under
emulation (OQ-401's reading). Endpoint `katalyst` (`openai-compatible--katalyst/qwen3.8-flash-next`), registered
unmetered, R-068's standing authorization; its key came from the DPAPI-protected registry file
(`%USERPROFILE%\.rotaris\live-run\katalyst.key.dpapi`, one ACE, the owner, FullControl, inheritance off), which the run's own
key-source line named. No URL, host, key or token is quoted here.*

The run was taken in two packs because the first attempt (`2026-10-15T15-16-50-373Z`, head `8080fbda`, all three
scenarios) lost every verdict: its `crlf` launch overran the harness's bound, the throw ended the run before `results.json`
was written, and the sandbox went with it
([`a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`](../../defects/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md),
[`the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`](../../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md)).

| Pack | `--only` | Verdict | Tokens (in / out) |
| --- | --- | --- | --- |
| `2026-10-20T07-55-35-723Z` | `terminal,frictions` | FAILED, 2 FAIL of 93 lines, both `frictions` | 681,872 / 22,388 |
| `2026-10-20T08-14-16-333Z` | `crlf` | passed | 336,794 over the run |

Code-intelligence discovery succeeded in every run launch (22 tools, 4,925-9,625 ms). No credential-shaped value reached a
log (the harness's bearer/key assertion held in both packs).

## terminal — `terminalShapes('win32')`, first Windows execution

Session completed (`tasks_complete`), 7 m 58 s, 12 terminal calls; every one of the 11 win32 shapes was attempted
(poll twice). PASS throughout:

- the here-string (`@"`) reached the tool with its five lines, ended 0, and both lines came back;
- long-output delivered all 40 `LINE-nnn` markers, each on its own line, VT-stripped;
- the wedge, sent with no timeout, soft-paused at the 30 s no-output window; `steady` ran to the 100 s default cap (exit 124,
  `session_reset`, 49 tick lines, 101,361 ms), what it printed came back with the timeout, and the reset named the shell
  state it restored;
- the empty poll claimed no window it had not waited (9.5 s stated, 9,554 ms passed);
- behind-paused (OQ-164) reported the paused `Start-Sleep -Seconds 45; Write-Output 'slept'` ended 1.9 s before, with
  `slept`;
- failed-word stayed `success` with no warning; `git diff` exit 1 was not a shell failure;
- pipe-to-shell into `powershell` was denied by `starter:deny-pipe-to-shell` (a NOTE, REQ-TOOLS-036/038);
- no `__rot_` marker reached the model.

**The interrupt shape did not go red** (as B7's note expected): the wedge had ended before the model's interrupt
arrived — "the interrupt reached nothing still running: outcome success, exit 0, 3609 ms after the interrupt" — so the
check was a NOTE and OQ-168's Windows C-c remains unread by a live model.

## frictions — the win32 pipe-session SIGINT (OQ-10, OQ-133)

Two FAILs:

1. **"the probe run completed" — `failed (agent_session_aborted)`.** The last model call's stream was reset by the
   upstream after 5.1 s (`read ECONNRESET`, mid-reasoning; the pack's only `unreachable` record), and the run failed with
   "Response stream ended without a finish reason." An endpoint fault, not read as a product defect; whether a stream cut
   mid-reasoning should be retried is not settled here.
2. **"the probe run attempted the SIGINT stop" — "no send_signal in the record".** The child sent, twice (ordinals 10 and 18),
   `{"command":"session_action=send_signal","session_id":"ts_…","signal":"SIGINT"}`, the action written into `command` with no
   `session_action`; the tool ran REQ-TOOLS-110's default `query` and said nothing of the `signal`
   ([`a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md`](../../defects/a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md)).

So no `failed (exit -1)` and no `killed (exit -1)` was read back: the scenario's Windows reading was not taken by the model.
The product side of it is measured without a model in `terminal.test.ts` (B8, 2026-10-20: every signal ends the tree in
5,157-5,250 ms and reads `killed (exit -1)` at `warning`). `frictions-cut` completed; its one cut error-path record carried
REQ-SESSION-194's marker. PD-TOOLS-007's inferred create was read as a create (frictions #7).

## crlf — PD-TOOLS-014 to PD-TOOLS-019, first execution anywhere

Session completed. PASS: every line of `greet.js` (2 edits), `render.js` (1) and `list.txt` (1) kept its CRLF ending; the
insert (#25) and the two-line `replace_all` (#17, 2 occurrences, 2 lines replaced by 4) each said they wrote the file's CRLF
endings, and the multi-line `haet_edit` on `greet.js` (#23) said so too. NOTEs: the `render.js` window edit landed at match
level 2, its block at the file's depth (so PD-TOOLS-019's level-4 FAIL and level-3 depth check were not asked); one
`haet_edit` near miss at level 2 (#15), not retried, not probed; one `haet_edit` refused at the gate as `invalid_request` (#8),
its `tool_error` filed. The level-3 near miss with an LF `old_string` that names the line endings was not produced by the model.
