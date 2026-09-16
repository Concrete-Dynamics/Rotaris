## The POSIX command wrapper cannot carry a multi-line command

ADR-0020's marker protocol brackets the agent's command with a start and an end marker and reads the exit
status out of the end frame. The PowerShell branch carries a multi-line command across as base64 and rebuilds
it as a script block, because ConPTY swallows submitted newlines. The POSIX branch interpolated the command
directly and was recorded in the ADR as *reasoned but never measured* — "a real pty's line discipline passes a
newline through as a line terminator rather than swallowing it, so `sh` reads a multi-line command across
lines as written".

Measured on Linux, that reasoning is wrong in the way that matters. The line discipline does pass the
newlines, and that is the defect. A command whose first physical line does not parse to completion — a quoted
string, a `for`, an `if` — puts `sh` on its **continuation prompt**, so the pty echoes every remaining line
back onto the screen the capture is read from. The line carrying the start marker is one of them, so the echo
lands **inside** the captured region, and the agent is handed the shell's prompt characters and its own
command text as though the command had printed them.

Measured, at the session's own 240×50, for `t="LINE ONE\nLINE TWO"` followed by `printf '%s\n' "$t"`:

```text
LINE TWO"
> __rot_904046598035310821ca0bc9_s
$ LINE ONE
LINE TWO
```

where `LINE ONE\nLINE TWO` is the whole of what the command wrote.

The defect was latent only because no POSIX shell had ever run this code: `REQ-TOOLS-104` sends Windows to
PowerShell, and the host this was built on was Windows.

## And a second one, in the cleaning rather than the wrapper

`cleanLines` located the start of the captured region by looking for a row that was **exactly** the start
marker. That row can carry the shell's **prompt** in front of it — the line discipline echoes what is written
as soon as it arrives, and the shell prints its prompt when it reads, so when the write lands first the screen
reads `<echo>` on one row and `$ <marker>` on the next. No row is then exactly the marker, the whole screen is
kept, and the agent is handed `$ __rot_…_s` as though the command had printed it.

It is load-dependent: about one call in six with a second suite running beside it, never once on an idle
machine. The echoed wrapper is now dropped **before** the marker is looked for rather than only after it, and
a row that *ends with* the marker is the marker's row whatever stands in front of it. The marker is a per-call
nonce, so ADR-0020 consequence 1's forgery argument is untouched.

## Specs

- `REQ-TOOLS-097` / `REQ-TOOLS-179` (ADR-0020, amended) — a multi-line command keeps its newlines and the
  exit status still comes out of it.
- ADR-0020 consequence 1 — the end marker never reaches the agent, and marker text the command echoes cannot
  forge the status.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `wrapCommand`'s POSIX branch; the falsified reason is
  kept beside its replacement in the comment there.
- `docs/architecture/adr/0020-terminal-execution.md` — the note the first execution reports into.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the proofs, now spelled in whichever shell the host
  runs.
