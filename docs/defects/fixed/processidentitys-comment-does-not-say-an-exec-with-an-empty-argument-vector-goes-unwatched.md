## processIdentity's comment does not say an exec with an empty argument vector goes unwatched

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-15`), a comment and a pin; no behaviour changed.** Confirmed on the
branch first: `processIdentity`'s comment (`packages/agent-tools/src/terminal/foreground.ts`) justified the empty-argument-vector
rule by the exiting shell alone and named no other process it reads as no identity. Measured on this host (Linux 6.18, Node 24):
a program `execve`d with argc 0 (`process.execve('/bin/cat', [], {})`, and the same from C and Perl) has `/proc/<pid>/cmdline`
read as one NUL byte, not empty, because Linux 5.18 and later give an argc-0 `execve` one empty argument; `processIdentity`
then reads `/usr/bin/cat\0\0`, an identity the replacement watch tells apart from the shell's. So the unwatched case the
finding names is reached only on a kernel before 5.18, where that `cmdline` reads empty.

The comment now carries a "Not reached" paragraph naming the case, the kernel bound and what the call meets there (it goes
unwatched and soft-pauses, as a replacement did before OQ-144's watch), and points at the replaces-the-shell note's list, which
gains the same item (`docs/defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`, dated). ADR-0020's
fin45 report-back states the same reach in one sentence.

Pinned by `packages/agent-tools/src/terminal/terminal.test.ts`, "OQ-144: a program run with an empty argument vector reads an
identity only where the kernel gives it one empty argument (Linux 5.18 and later)": it execs `cat` with argc 0 and asserts the
`cmdline` and the identity the running kernel gives (one NUL byte and `<cat>\0\0` from 5.18; empty and null before). The
change it pins is documentation, so the case passed before the comment changed too; inverted to the pre-5.18 reading it fails
on this host (expected `''`, received `'\0'`), which shows the instrument reads the kernel's answer. No proof or live scenario
found this note (fin45's reviewer did) and none reaches an argc-0 `exec`; none was run for it.

`processIdentity` (`packages/agent-tools/src/terminal/foreground.ts`) reads an empty `/proc/<pid>/cmdline` as no identity,
since fin45's repair of
`docs/defects/fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md`:
an exiting shell's argument vector reads empty between the release of its memory and its reaping, and that pair had read as
another program. Its comment justifies the rule by the shell alone ("The shell is started with an argument vector …, so an
empty one there is the exiting shell's, never another program"). It does not say that the rule also reads as no identity a
program that replaced the shell and itself runs with an empty argument vector (one `execve`d with `argv` NULL or `{ NULL }`,
argc 0: no shell's `exec` makes one, but a program the command `exec`s may start one in its own place before the watch's next
reading), whose replacement the watch then never sees, so the call goes unwatched and soft-pauses as it did before OQ-144's
repair. That is one more case the watch does not reach, beside those the replaces-the-shell note lists as "Not reached"
(macOS, an `exec` of exactly the shell's own executable and arguments, an `exec` inside a command already soft-paused), and a
reader of the comment would take the watch to cover it. Whether it is reachable depends on the kernel: Linux 5.18 and later
give an argc-0 `execve` one empty argument (`cmdline` reads one NUL byte), which reads as an identity.

Noticed by fin45's reviewer (`fin45-config-and-terminal`, Task 2, an optional finding) and taken as acceptance finding C10 of
fin46's round 1 (product-defect, cosmetic). Recorded 2026-10-14 by fin46 (`fin46-accept1-15`).

## Specs

None contradicted in behaviour: REQ-TOOLS-098, REQ-TOOLS-100 and REQ-TOOLS-103 with OQ-144 (a command that replaces the
session's shell ends the call) are what the watch serves, and the comment that states its reach leaves one unwatched case
unstated.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `processIdentity` and its comment (about line 125 to 140).
- `packages/agent-tools/src/terminal/terminal.test.ts` — the `processIdentity` cases (about line 169 to 216).
- `docs/defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md` — the "Not reached" list of the watch.
