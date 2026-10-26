# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Fifth first execution — 2026-10-04, the session's shell is `bash` (`/bin/sh` on Fedora, RHEL, Arch)

Part 12 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Fifth first execution — 2026-10-04, the session's shell is `bash` (`/bin/sh` on Fedora, RHEL, Arch)

Every real-PTY case above was measured where `/bin/sh` is `dash`. Another author's Linux machine ran the file on an
unmodified `main` and two cases failed there, alone and in the full suite
([the note](../../../defects/fixed/two-terminal-pty-tests-fail-on-main-in-this-environment.md)). Varied one at a time on
this host, through a real PTY, at load averages 0.6 to 3.6 on four CPUs: `dash` at 240, 80 and 1,000 columns, with
`LANG=C.UTF-8`, with an `$ENV` startup file that sets `PS1` and `set -o emacs`, and under six CPU burners, passed both;
a `sh` link to `/usr/bin/bash` 5.2 (POSIX mode) failed both, at 240 and 80 columns and with `LANG=C.UTF-8`, as did
`/usr/bin/bash` itself; at 1,000 columns, where the wrapper fits on one row, only the first failed. **Found two defects,
one the product's and one the test's.**

**The product's: A10's echo removal held only where the echo is the line discipline's.** "A wrapper wider than the
screen wraps" (`withoutEchoedWrappers`) is how the kernel echoes. `bash -i` reads its input through readline, which on
the session's `dumb` terminal does not wrap a line wider than the screen: it scrolls it sideways on ONE row, its head
replaced by `<`, redrawn in place. The joined-rows match never met that row, and the next call's wrapper
(`<QQQ…'; printf '__rot_…_e:%s\n' "$?"`) reached the interrupted call's poll. The POSIX shell now starts with its
line editor off, `+o emacs +o vi -i`, where it takes those options (asked once per shell file with the same arguments,
`posixShellArgs`; `dash` has no editor and takes them as a no-op; a shell that refuses them starts with `-i` as before),
so the echo is the line discipline's again. A row an editor still draws — a startup file that turns one back on, or a
shell that refused the options — is dropped by the end statement it carries (`ECHOED_POSIX_END`), which the printed end
frame, never quoted, cannot spell. Each half alone made the case green under bash; the `$ENV` variant needs the
second.

**The test's: the L1 case read dash's error as every shell's.** `${PIPESTATUS[0]}` is a bash-ism `dash` cannot expand;
`bash` expands it, so the call ended with exit 0, which is right. The line now ends on `${a b}`, which no POSIX shell
expands. No product change: `command eval` guards the line under `bash` as under `dash` (measured: `bash -i` printed
the end frame with status 1 after `bad substitution`).

Pinned by the two cases' twins "… under bash as `/bin/sh` …" in `terminal.test.ts`, which run wherever bash is
installed through a `sh` link to it (red without the repair: the line editor read `on`), by "the echo a shell's own
line editor draws of a wrapper wider than the screen …" (red without `ECHOED_POSIX_END`) and by "the POSIX shell is
started interactive with its own line editor off …". The whole file passed with the host's `dash` and, run once more
with the session's shell overridden to the `bash` link, 82 passed and 1 skipped. **Could not show:** macOS, whose `/bin/sh` is a
`bash` 3.2 (or a `zsh` or `dash` it is pointed at) and where no host has run it; Windows is untouched (PowerShell).

**Corrected at its verification, the same day: no width was safe below the frames' own, nor the editor's row below
about 50 columns.** FALSIFIED, kept above beside its replacement: "a row an editor still draws … is dropped by the end
statement it carries (`ECHOED_POSIX_END`)". The display resizes the foreground PTY (REQ-TOOLS-128), down to
REQ-SHELL-100's 20 columns, and readline's sideways window then shows only a TAIL of that statement, its nonce cut
(`<74a244a85f47_e:%s\n' "$?"` at 40 columns, `<:%s\n' "$?"` at 20). Measured through a real PTY with a `sh` link to bash
5.2 and an `$ENV` file that turns emacs editing back on: the row reached the interrupted call's poll at 40 and 50 columns,
not at 80 or 240. Varying the width under `dash` found a second, older leak that no shell choice avoids: every capture
read its frames row by row (a row that ends with the start marker, a row that carries a later marker, the end frame
within one line), and a frame is 32 columns or more, so at 20 and 30 columns each call's capture began with its own
wrapped start frame and ended with its wrapped end frame and the prompt, and a paused call's poll carried its own end
frame or the next call's start frame; at 34 columns and wider nothing leaked. The capture now reads every marker across
row breaks (`joinedRows`, `firstRowEnd`, the end frame matched with a break allowed between any two characters), and a
row that is `<` followed by any tail of the end statement, matched against its template with a hex digit where the nonce
stands, is dropped like the wider row (`scrolledEcho`). Re-measured after the repair: `dash` at 10, 20, 30, 33 and 40
columns and the bash link with the editor on at 10, 20, 30, 40, 50 and 80 columns, both roads, nothing leaked. Pinned by
"the sideways-scrolled row is dropped at any width …" and "a frame the screen wraps … is found across its rows …" (pure,
red without the repair), "at the display's 20-column floor a call's capture and a paused call's poll carry no frame and
no echo" (real PTY, the host's shell) and "under bash as `/bin/sh` with its line editor turned back on by `$ENV`, no width
lets the echo of a next call reach the paused call's poll" (real PTY at 20, 40 and 240 columns), both red without it.
Found on the way and recorded, not repaired here: PD-TOOLS-001's snapshot reads its `__rot_b64__:` rows one screen row
at a time, so below 76 columns it decodes a corrupted environment
([the note](../../../defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)).

*Reported back 2026-10-06 (finacc2's acceptance finding A4), when that note was repaired:* the third first execution's
snapshot is now read across the screen's row breaks. The capture's rows are joined with nothing between them, as the
frames already were, and each `__rot_b64__:` opens one 64-character row of base64, which holds no newline of its own;
a capture whose rows are not 64 characters but the last, is not padded base64, or does not decode to NUL-terminated
entries is refused and the previous one kept (`encodedSnapshot`). The encoder's own line breaks are taken out before the
fold, so the 64 holds on every host. Measured under `dash` through a real PTY before the change, a capture at 75, 40, 30,
20 and 10 columns lost `PATH` or the directory or parsed to nothing, and a reset at 20 columns said its restore failed;
after it, every width from 10 to 240 read the 240-column capture, and a reset at 20 and 40 columns restored the
directory and the variables whole. The PowerShell capture is left as it was, its wrap recorded open
([the PowerShell note](../../../defects/fixed/the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md)).

*Reported back 2026-10-06 (fin21, bundle `fin21-leftover-notes`), when the PowerShell note was repaired:* the PowerShell
capture now prints the same encoded rows, spelled in PowerShell — a `__rot_ps__` tag field, the directory and every
`NAME=value`, NUL-terminated, UTF-8, base64, 64 characters a row behind `__rot_b64__:` — and `parseSnapshot` reads both
backends through `encodedSnapshot`; the tag stands in for POSIX's leading `/` in refusing a capture that lost its top
rows. Pinned on Linux over the parse through the `@xterm/headless` emulator at 20 to 240 columns, from the rows the
command's loop prints. **Not executed:** no Windows host and no `pwsh` here, so the PowerShell capture's first execution
is still owed, and it reports back here.

*Reported back 2026-10-15, the PowerShell capture's first execution on a real PTY (Windows 11 ARM64 (build 26200.9457),
Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell 5.1, at `fbbc3d23`; the Windows ARM64 session's B2;
windows-arm64 only, OQ-400).* **Held from 34 columns up.** A new case, three runs under each shell, read the capture whole
off the screen and restored the directory (170 characters) and every variable byte for byte across a hard-timeout reset at
34, 40, 64, 75, 76, 77, 120 and 240 columns: a `Path` with 24 extra entries, a 600-character value, a non-ASCII one, one
PowerShell would read as code; a spawn variable the command removed stayed removed; with one exclusion under 5.1 only, the
product's own empty `PSModuleAnalysisCachePath`, lost across the reset
([recorded](../../../defects/windows-powershell-5-1-loses-the-spawn-environments-empty-psmoduleanalysiscachepath-across-a-reset.md)).
The capture took 139 to 220 ms of its 15 s; the restore line was 3,009 to 3,165 characters, which bears on M1's
unmeasured line cap. **Not reached below 34 columns:** there no PowerShell call ends at all. ConPTY writes a wrapped row as
a hard `\r\n`, a cursor move back to the row it left and that column's character again, and the frame match over the
VT-stripped stream (`${end}:(-?\d+)`) never meets a 34-character frame split that way
([`below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md`](../../../defects/fixed/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md),
recorded, not repaired). *(Repaired the same day on the owner's ruling: ConPTY's wrapped rows are rejoined in the text the
frame match reads (`rejoinConptyWraps`), and the sweep now restores byte for byte at 20 and 33 columns too, under both
shells. The live tap's own raw scan is not rejoined and is unmeasured at those widths.)* And a restore line whose `Set-Item` fails still exits 0, so a partial restore reads "were
restored" ([recorded](../../../defects/a-powershell-restore-whose-set-item-fails-is-still-reported-restored.md)).
*(2026-10-15, Windows 11 ARM64 (build 26200.9457), pwsh 7.6.6 and Windows PowerShell 5.1, the session's B1: one real
PowerShell capture and restore ran, in "PD-TOOLS-001 (OQ-134): a reset restores the snapshot of the last command the
product saw complete", green in every run under both shells (about 17 s); the emulated-screen parse cases ran too. The
width sweep over a real PTY ("at 20 and 40 columns a hard-timeout reset restores …") is POSIX-only and skipped here; the
session's B2 owes it.)*
