## The prompt roots are read twice as a window settles

Two effects in the composer's toolbar start a `prompts.roots.read` while a window settles, and neither
can see the other. The skill catalog's reader beside it has the same gap with three starters. The registrar's effect reads when nothing is cached yet; the configuration key's
effect always reloads. At start neither has an answer to find, so both read, and each round trip is an
IPC to the workspace service and three directory listings.

The launch of 2026-09-16 shows the pair in `/tmp/rotaris-launch.log`, two lines at the same
millisecond and two more within 16 ms:

```
[main 2026-09-16T13:20:16.374Z] workspace service info: prompt roots: 0 file(s), 0 skipped (/home/david/dev/NodeGrade)
[main 2026-09-16T13:20:16.374Z] workspace service info: prompt roots: 0 file(s), 0 skipped (/home/david/dev/NodeGrade)
[main 2026-09-16T13:20:16.836Z] workspace service info: prompt roots: 0 file(s), 0 skipped (/home/david/dev/NodeGrade)
[main 2026-09-16T13:20:16.852Z] workspace service info: prompt roots: 0 file(s), 0 skipped (/home/david/dev/NodeGrade)
```

This is the third finding in the code ADR-0060's first execution examined: AO-1 was a registry rebuilt
by its memo re-reading the disk, AO-2 was an in-flight read landing on a replaced registry. AO-1's
repair kept the reader's LAST answer beside the reader, which is why a rebuild no longer reads. It did
not keep the read that has not answered yet, so two callers that arrive before the first answer still
read twice. The gap is in that repair, not in the effects.

## Specs

No requirement is contradicted. REQ-CHAT-160 says the prompt files are offered as commands and
REQ-CHAT-028 says a configuration change makes them current again; neither says how many times the
disk may be read to do it, and both are met by one read as well as by two. The defect is that the
product does twice the work it needs, once per window, and says so twice in the log — the observable
part the 2026-09-16 inspection saw.

## Relevant files

- `packages/ui/src/slash/prompts.ts` — `readPromptRoots` holds the read IN FLIGHT beside the last
  answer AO-2 already kept, so a second caller in the same window joins it. The handle is cleared when
  the read settles, so a later focus or configuration change still reads the disk afresh, and binding a
  reader (a new window, a new workspace) drops it along with the cached answer.
- `packages/ui/src/slash/skills.ts` — the same gap, verbatim, in the skill catalog's reader (ADR-0063 §5 says
  AO-1 and AO-2 apply to it; AO-3 does too). Its comment already claimed a read in flight was this window's
  answer, which was false because the read was never handed back. It is now, and there are three starters here
  rather than two: the registrar's effect, the configuration key's and the rescan counter's.
- `packages/ui/src/slash/controls.tsx` — the effects that race: the registrar's, which reads when
  nothing is cached, and the configuration key's, which reloads on every change. Both are correct as
  written and are untouched; joining is the reader's job, because the reader is the only place that
  knows a read is already running.

## Repaired — 2026-09-16

Regression tests: `packages/ui/src/slash/prompts.test.ts` — "defect AO-3: two callers in the same tick
join one read, and a later one reads again", which drives two concurrent calls against a reader held
open, asserts one invocation and one shared promise, then asserts that a call after the read settles
reads again and that binding a reader drops both the answer and the handle. And
`packages/ui/src/slash/skills.test.ts` — the same over three concurrent callers, which is what the skill
catalog has.

**What this does not claim.** Coalescing removes a second read only while the first has not answered.
The identical-millisecond pair above is removed with certainty. The pair 16 ms later is removed only if
it overlaps in flight; if the first had already settled, that is the specified behaviour of a
configuration change and not a duplicate. The remaining measurement is a launch of the built app, which
this repair has not had.
