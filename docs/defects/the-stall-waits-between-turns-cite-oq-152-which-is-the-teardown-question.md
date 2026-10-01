## The stall wait between turns cites OQ-152, which is the teardown question

`packages/engine/src/children/stall.ts` cites **OQ-152** four times for the watch's wait between a child's turns
(`betweenTurns`): the header at line 16, and lines 84, 122 and 143. That reading is "the repair of
`a-child-waiting-on-its-own-children-is-reported-stalled.md`".

On `origin/main` (8553bdb), OQ-152 in `docs/architecture/open-questions.md` is a different question: "Does a child that
never started owe REQ-ORCH-098's teardown entries?" (acceptance finding A16). `children/orchestration.ts` and
`children/scheduler.ts` cite it for that. The stall readings are **OQ-153**, "What does a host do with the stall callback,
which agent is watched, and what does a stall evaluation inject?" (acceptance finding A6). `run.ts`, `stall.test.ts` and
`children.test.ts` cite OQ-153 for the stall watch. So a reader who follows stall.ts's OQ-152 finds the teardown question.
No OQ entry records the between-turns reading under either number.

Beside it: stall.ts calls the between-turns wait "the repair of `a-child-waiting-on-its-own-children-is-reported-stalled.md`",
yet that note is still open in `docs/defects/`. It has no outcome written on it, and it has not been moved to `fixed/`.

Both came from the merge of two bundles that each took the next free OQ number. The repair of A6 (the stall watch) and
the repair of A16 (the teardown) both reached `origin/main` in 8553bdb. `pnpm symbols` checks requirement and directive
identifiers, not OQ numbers, so nothing failed.

Noticed 2026-09-30 by the repair of
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](fixed/a-child-settled-outside-its-execution-fires-no-child-completed-hook.md)
while renumbering that repair's own question (OQ-154), and confirmed by its verifier with
`git grep -n OQ-152 origin/main -- packages`. Established by reading the record and the code; nothing is driven.

## Specs

None. This is a traceability defect in the record, not a behaviour the specification governs. `CLAUDE.md`
("Traceability") has implementation cite the decision it rests on, and here the citation names the wrong one.

## Relevant files

- `packages/engine/src/children/stall.ts`: lines 16, 84, 122 and 143 cite OQ-152 for the wait between turns.
- `docs/architecture/open-questions.md`:
  - **OQ-152** is the teardown of a child that never started.
  - **OQ-153** holds the stall readings, including the root's watch between its turns. Its "What the build proceeds
    under" is where the child's between-turns reading would belong.
- `packages/engine/src/children/orchestration.ts` and `packages/engine/src/children/scheduler.ts`: they cite OQ-152
  correctly, for the teardown.
- [`a-child-waiting-on-its-own-children-is-reported-stalled.md`](a-child-waiting-on-its-own-children-is-reported-stalled.md):
  still open, although stall.ts names its repair.
