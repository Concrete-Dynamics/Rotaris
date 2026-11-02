## A capture's wait starts before its prompt is typed

`installFinish` (`apps/desktop/src/main/capture/probe.ts`) starts the wait's clock (`ROTARIS_CAPTURE_WAIT_MS`) when it is
installed, at launch, while `installPromptSeam` types the prompt as one `char` event per character afterwards. The renderer
takes those events one at a time, so a long prompt spends part of the scenario's budget before the run exists. In the final
default live run at `a68f121` (2026-10-07, the self-hosted endpoint) the terminal scenario's prompt had grown from 1,083 to
5,755 characters with the M1 replay (`722308a`), and its session started 27.4 s into the 420 s wait, where the other launches
started 3 to 7 s in and the same scenario about 4 s in at `c2a9444`. Under host load the loss grows. It was not decisive in
that run (finding P1 was), but a wait that measures typing as well as the run reports a run that needed its whole budget as
one that did not finish in it.

The same scenario's NOTE "what the model attempted — …×2 for seven shapes, poll×3" counts every call that matched a shape,
iteration 2's repeats of shapes 1 to 7 included, without saying so, so `×2` reads as the model attempting a shape twice
in one pass.

Finding P6 of the autopsy of that run. Harness only.

**Repaired 2026-10-07 (fin31).** `installPromptSeam` now returns when its last event was handed over (`PromptTyping`), and
`installFinish` reads the composer on its 500 ms poll: text seen and then none, or none a poll after the events were all
handed over, is the submission, and the bound counts from it, logged as "capture: the prompt was submitted N ms after the
wait was installed". Until a submission is seen the bound counts from the launch, as before, so a prompt never submitted
still ends the capture (its timeout line says so). The prompt is still typed one character at a time, as a person types and
as the packaged probe exercises; the `satisfied after` and `timed out after` lines keep their shape. The terminal scenario's
NOTE now says it counts every terminal call the session holds, every iteration and agent included, and names the agents
when more than one ran the shapes. **Pinned by** the three cases under "a capture's wait counts from the submission of its
typed prompt" in `apps/desktop/src/main/capture/probe.test.ts`, red before. **Measured in the built app** (a scripted
launch, load about 10 on four CPUs): a 4,618-character prompt was submitted 23,209 ms after the wait was installed, and the
wait for the result was satisfied 4,070 ms after the submission. Also seen there: the renderer answers a read only once it
has taken the typed events, so the first read returned at the submission. **Not measured:** the next default live run's
terminal scenario (the orchestrator's), where the session should start inside the wait's first seconds as counted.

**Follow-up 2026-10-07 (fin31, the bundle's review).** With the capture's bound counting from the submission, the live
run's own kill limit for the launch (`RUN_WAIT_MS` plus 90 or 120 s) still counted from the spawn, so the typing time came
out of that margin instead. `launch` in `apps/desktop/scripts/live-run.mjs` now adds a typing allowance of 10 ms per
character of `ROTARIS_CAPTURE_PROMPT` (about twice the 4.8 to 5.0 ms per character measured above;
`apps/desktop/scripts/lib/prompt-typing.mjs`), and a launch the harness kills at its limit says so with the limit and the
allowance in its error. **Pinned by** `apps/desktop/scripts/lib/prompt-typing.test.ts`. **Not measured:** a launch killed
at that limit in a live run.

## Specs

None: the capture seam and the live run are verification. The budget a scenario states (`LIVE_RUN_WAIT_MS`) is meant to
bound the run.

## Relevant files

- `apps/desktop/src/main/capture/probe.ts`: `installPromptSeam` (the typed prompt) and `installFinish` (the wait and its
  bound).
- `apps/desktop/src/main/capture/index.ts`: where the two are installed.
- `apps/desktop/scripts/live-run.mjs`: the terminal scenario's launch and its "what the model attempted" NOTE; `launch`'s
  kill limit.
- `apps/desktop/scripts/lib/prompt-typing.mjs`: the typing allowance on that limit.
