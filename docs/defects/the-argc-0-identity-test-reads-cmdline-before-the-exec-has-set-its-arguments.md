## The argc-0 identity test reads `cmdline` before the exec has set its arguments

`packages/agent-tools/src/terminal/terminal.test.ts`, case "OQ-144: a program run with an empty argument vector reads an
identity only where the kernel gives it one empty argument (Linux 5.18 and later)", waits until `/proc/<pid>/exe` names
`/bin/cat` and then reads `/proc/<pid>/cmdline` once, expecting one empty argument (`'\0'`) on Linux 5.18 and later. The
kernel switches a process's executable link before the new image's argument area is in place: `exe` is set when the new
memory map is installed (`begin_new_exec`), while the arguments' bounds are set later, when the loader lays out the new stack.
A read that falls between the two reads an empty `cmdline` (`''`), so the case can fail on a correct `processIdentity`.

Seen 2026-10-15 at about 00:24 UTC in the landing gate (`pnpm check`) of `fin46-accept1-22` at `08ac894`, on kernel 6.18 at a
load average of about 6 on 4 CPUs: `AssertionError: expected '' to be '\u0000'` at line 233, one failure in 6,477 tests. Run
alone straight after (`pnpm vitest run packages/agent-tools/src/terminal/terminal.test.ts -t "OQ-144"`, three times, load 5.5
to 4.5) it passed every time. The race was read from the kernel's exec order, not traced. Not repaired: noticed while landing
an unrelated bundle (acceptance finding A3); recording only.

A repair would wait for the identity itself, not only for `exe`: poll until `cmdline` is non-empty or a bound passes (on
kernels before 5.18 it stays empty, so the bound decides there), then assert.

## Specs

None contradicted: the product's `processIdentity` is not at fault; the test's timing is. The case pins the reach that
`processIdentity`'s comment states (REQ-TOOLS-098, REQ-TOOLS-100, REQ-TOOLS-103;
OQ-144 in `docs/architecture/open-questions.md`), added by `0c513e0`.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the OQ-144 argc-0 case (about lines 213 to 239): the wait on `exe`
  and the single `cmdline` read.
- `packages/agent-tools/src/terminal/foreground.ts` — `processIdentity`, which the case pins (unchanged).
