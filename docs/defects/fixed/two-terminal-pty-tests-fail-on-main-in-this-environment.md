## Two real-PTY terminal tests fail on `main` in this environment

`packages/agent-tools/src/terminal/terminal.test.ts` fails two cases, alone and in the full suite, on an unmodified `main`
(6d9305bc) as well as on a branch that touches no terminal code, so `pnpm check` is red here before any change:

- "REQ-TOOLS-097/098/179 (live-run L1): a command sh cannot expand or parse ends with its own exit status, never a soft pause"
- "REQ-TOOLS-127 (A10): the echo of a next call wider than the screen reaches neither road's poll of the paused call"

The first reads output containing the sentinel wrapper's own text (`__rot_…`, a run of `Q`, `"$?"`) where the test expects none
of it to leak, so the shell's echo of the wrapped command reaches the call's output. The whole file takes about 120 s.
Observed 2026-10-03 on Linux; not investigated further, so whether it is the shell, the PTY size or the harness is not known.

## Specs

REQ-TOOLS-097/098/179 (the command's own exit status, no leaked wrapper), REQ-TOOLS-127 (the next call's echo reaches neither
poll of the paused call).

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the two failing cases (around line 1057 for the first).
- `packages/agent-tools/src/terminal/` — the terminal implementation the cases drive.

## Outcome — repaired 2026-10-04 (fin15)

**What differed: the shell.** The machine that failed has `bash` as `/bin/sh` (Fedora, RHEL, Arch); this host has
`dash`. Varied one at a time here through a real PTY, at load averages 0.6 to 3.6 on four CPUs, each variant running the
two cases:

| Variant | L1 case | A10 wide-echo case |
|---|---|---|
| `dash` (this host's `/bin/sh`), 240 columns | pass | pass |
| `dash`, 80 columns / 1,000 columns | pass / pass | pass / pass |
| `dash`, `LANG=C.UTF-8 LC_ALL=C.UTF-8` | pass | pass |
| `dash`, `$ENV` startup file setting `PS1` and `set -o emacs` | pass | pass |
| `dash`, six CPU burners | pass | pass |
| `sh` link to `/usr/bin/bash` 5.2 (POSIX mode), 240 columns | **fail** (exit 0) | **fail** (`<QQQ…'; printf '__rot_…_e:%s\n' "$?"` in the poll) |
| the same, 80 columns / `LANG=C.UTF-8` | **fail** / **fail** | **fail** / **fail** |
| the same, 1,000 columns (the wrapper fits on one row) | **fail** (exit 0) | pass |
| `/usr/bin/bash -i` itself | **fail** | **fail** |

`TERM` is not a variable: the product sets `dumb` for the session whatever the parent has. The note's description of the
first case's output (`__rot_…`, a run of `Q`, `"$?"`) is the second case's; the first failed on its exit code.

- **The second case was a product defect** (REQ-TOOLS-127, A10). `bash -i` reads input through readline, which on a
  `dumb` terminal scrolls a line wider than the screen sideways on one row (head replaced by `<`) instead of wrapping
  it, and `withoutEchoedWrappers` matched the echo only as the line discipline wraps it. The POSIX shell now starts as
  `+o emacs +o vi -i` where it accepts those options (`posixShellArgs` in
  `packages/agent-tools/src/terminal/foreground.ts`), so the echo is the line discipline's, and a row an editor still
  draws is dropped by the end statement it carries (`ECHOED_POSIX_END`). Each half alone made the case green under
  bash; an `$ENV` file that turns the editor back on needs the second. *Corrected at its verification (below): that
  drop held only where the row is wide enough to carry the whole statement.*
- **The first case was a test defect.** It used `${PIPESTATUS[0]}` as "a command sh cannot expand", which holds of
  `dash` only; `bash` expands it and exit 0 is right. The command now also carries `${a b}`, which no POSIX shell
  expands, so the case holds under both. `command eval` guards the line under `bash` too (`bash -i` printed the end
  frame with status 1 after `bad substitution`).

Pinned in `packages/agent-tools/src/terminal/terminal.test.ts`: each case now runs a twin "… under bash as `/bin/sh` …"
wherever bash is installed, through a `sh` link to it (`bashAsSh`), red without the repair; the A10 twin also asserts
the session's `set -o` reads `emacs off` and `vi off`. Two pure cases pin the parts: "the echo a shell's own line editor
draws of a wrapper wider than the screen …" (red without `ECHOED_POSIX_END`) and "the POSIX shell is started interactive
with its own line editor off …" (red without `posixShellArgs`). The terminal directory passed (118 passed, 7 skipped)
with `dash`, and the whole file passed with its session shell overridden to the `bash` link (82 passed, 1 skipped).
Reported back in [ADR-0020](../../architecture/adr/0020-terminal-execution.md), "Fifth first execution". Not shown:
macOS, whose `/bin/sh` is `bash` 3.2 by default, has no host here.

### Corrected at its verification — 2026-10-04 (fin15, repair round)

The claim above that "a row an editor still draws is dropped by the end statement it carries" was false below about 50
columns, a width the display reaches (REQ-TOOLS-128 resizes the PTY; REQ-SHELL-100's floor is 20 columns). Varying the
**screen width** as well, through a real PTY, the interrupted road (road two) and the self-ended road (road one):

| Variant | 10 | 20 | 30 | 33 | 40 | 50 | 80 |
|---|---|---|---|---|---|---|---|
| bash link, `$ENV` turns emacs back on, before | — | **leak** (tail row, next start frame) | **leak** (tail row, next start frame; road one: own end frame) | — | **leak** (tail row) | **leak** (tail row) | pass |
| `dash`, before | **leak** (own end frame; next start frame) | **leak** (same; every capture carried its own frames and the prompt) | **leak** (same) | **leak** (own end frame) | pass | — | — |
| bash link with `$ENV`, after | pass | pass | pass | — | pass | pass | pass |
| `dash`, after | pass | pass | pass | pass | pass | — | — |

Two causes, both in `ForegroundSession.cleanLines` (`packages/agent-tools/src/terminal/foreground.ts`):

- readline's sideways row shows only a tail of the end statement at narrow widths (`<74a244a85f47_e:%s\n' "$?"` at 40
  columns), which `ECHOED_POSIX_END` cannot match. `scrolledEcho` now also drops a row that is `<` followed by any tail of
  the statement, checked against its template with a hex digit where the nonce stands.
- every frame was looked for within one screen row, and a frame is 32 columns or more, so below 34 columns it wraps on
  any shell. The start marker, the later markers and the end frame are now read across row breaks (`joinedRows`,
  `firstRowEnd`).

Pinned in `packages/agent-tools/src/terminal/terminal.test.ts`, each red without the repair: "the sideways-scrolled row is
dropped at any width …" and "a frame the screen wraps … is found across its rows …" (pure), "at the display's 20-column
floor a call's capture and a paused call's poll carry no frame and no echo" (real PTY, the host's shell) and "under bash as
`/bin/sh` with its line editor turned back on by `$ENV`, no width lets the echo …" (real PTY at 20, 40 and 240 columns).
CPU load was again varied under `dash` only. Found on the way and recorded open:
[the shell-state snapshot is corrupted on a screen narrower than its rows](../the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md).
