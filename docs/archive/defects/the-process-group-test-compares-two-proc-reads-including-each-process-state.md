## The process-group test compares two /proc reads including each process's state

`packages/platform/src/process-group.test.ts`, "a `dash -c` group reads its shell catching SIGINT under the shell's
name, and its command at the default under its own", ends by asserting that the walk from the leader
(`table.tree(pid)`) reads the same members as the group read before it (`table.group(pid)`), with `toEqual` over the
whole `GroupMember`. The two are separate reads of `/proc`, and a `GroupMember` carries `state`, the `/proc/<pid>/stat`
state letter, which changes whenever the process is scheduled. A shell or `sleep` that is running (`R`) or in an
uninterruptible wait (`D`) at the first read and sleeping (`S`) at the second fails the assertion, though both reads
are right.

On 2026-10-01 a full `pnpm check` on the `skill-concurrency` branch (a change to `.agents/skills/` only), at load
average 9.84 on 4 CPUs while two workflow agents built and linted, failed it at line 107: `state` read D/R in one
read and S in the other. The file run alone passed 6 of 6, and a full re-run passed. The busier the host, the likelier
a process is caught mid-transition, so the test reds most where gates now run most: under parallel plans.

Found by the reviewer of the skill change that lets two plans run at once; recorded, not repaired. A faithful repair
keeps what the assertion means, that the walk and the group name the same processes with the same parent, name,
SIGINT standing and arguments, and leaves the volatile `state` out of the comparison (or reads both from one
snapshot). Removing the assertion is not a repair.

## Specs

None contradicted by the product. The test pins the process-group reading the terminal's signal delivery stands on
(REQ-TOOLS-110, REQ-TOOLS-128; OQ-135 and acceptance finding A8, round 3); the product's reads are right, and the
assertion compares a field that no requirement asks to be stable between two reads.

## Relevant files

- `packages/platform/src/process-group.test.ts:93-108`: the test; the comparison is at `:107`.
- `packages/platform/src/process-group.ts:19-33` (`GroupMember`, `state` at `:25-26`), `:72-93` (`parseStat` and the
  member read).
- `docs/architecture/open-questions.md`, OQ-135: the signal question the group reading serves.

## Repaired 2026-10-01

Repaired 2026-10-01 on `fin2-load-robust-tests`. The assertion still compares the walk from the leader
(`table.tree(pid)`) with the group read before it (`table.group(pid)`), member by member and sorted by pid. Each member
is now compared without its `state` letter. Everything else about the processes is still compared: pid, parent, name,
SIGINT standing and arguments. Fields a later change adds to `GroupMember` are compared too, because the comparison
drops `state` alone rather than picking the fields to keep. No product code changed.

**What confirmed it first.**
- **A probe of the live race.** A scratch probe ran the test's own steps 60 times each: spawn the `dash -c` group, wait
  for `sleep`, read the group, then walk the tree. The two reads gave different state letters 4 times in 60 on the
  host as it was (`SR/SS`, `RR/RS`, `RR/SR`, `RS/SS`). They differed once in 60 beside twelve CPU-bound `node` loops.
- **A forced change on the old form.** A scratch copy of the test wrapped the table so that each read reports `R` and
  `S` in turn. The old comparison failed on `state` alone; the new form passed 6 of 6.
- **The kept comparison still bites.** A second scratch copy made the walk report another parent for the command.
  The new form failed on `ppid`.

Both scratch copies and the probe were removed.

**Pinned by** the case itself, "a `dash -c` group reads its shell catching SIGINT under the shell's name, and its
command at the default under its own". It passed the file alone, 6 of 6 (`pnpm vitest run
packages/platform/src/process-group.test.ts`). Beside twelve CPU-bound loops (load average about 21), the old and new
forms ran 12 times each with `-t "dash -c"`. The comparison (`:107` on the old form) never failed in either form.

Each form failed once in those 12 runs, both times at `:103` and not on this note's comparison: the shell read
`sigint: 'blocked'` where the case expects `'caught'`. Those are the 2 failures in 24 runs that the separate note
counts. That is a separate volatile reading, recorded in
[`the-process-group-test-reads-the-shells-sigint-standing-before-dash-unblocks-it.md`](the-process-group-test-reads-the-shells-sigint-standing-before-dash-unblocks-it.md)
and repaired on the same branch: the case now waits until the shell no longer reads `'blocked'`.
