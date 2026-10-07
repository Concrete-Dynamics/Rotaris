## The resume scenario's Pause can land on one running child

The live run's resume scenario (`apps/desktop/scripts/live-run.mjs`, 3b) presses the composer's Pause as soon as any agent
row is running (`.workspace:has(.agent-row[data-state="running"]) …`). Its prompt asks for two parallel children, and the
scenario exists to measure PD-ORCH-005 clauses 3, 4 and 13 (the pause rests every unfinished child, the continue resumes each
under its task id, the composer draws them paused); with one child held, those checks pass on one child, and a fault that
only shows with two would go unseen.

In the final default live run at `a68f121` (2026-10-07, session `be52b2b7`) the coordinator delegated both children in one
step, OQ-213 refused the second, and the Pause landed 86 ms later on the first: the timeline holds `child_paused` for one task
and `iteration_paused` with `paused_agents: 2` (root and one child), and the console read "paused 1 · 2 agents will
resume". At `c2a9444` the same scenario paused two. The scenario's report says nothing of how many it held.

Finding P7 of the autopsy of that run. Harness only.

**Repaired 2026-10-07 (fin31).** The schedule moved to `apps/desktop/scripts/lib/resume-pause.mjs`. Pause waits for two
running children (`.agent-row[data-state="running"] ~ .agent-row[data-state="running"]`); an eval step armed when the first
child runs marks `<body>` 45 s later (`TWO_RUNNING_WAIT_MS`), after which one running child is enough, so a coordinator
that never runs two at once still gets its pause. A second eval step, waiting on the press's own condition, logs how many
were running and whether the bound had run out, and `pauseReading` reports it with how many children the timeline records
paused: a PASS line when two or more were held, a NOTE "the pause held fewer than two children" otherwise. The resume
prompt and the scenario's other checks are unchanged (fin29 rewords the prompt). **Pinned by**
`apps/desktop/scripts/lib/resume-pause.test.ts`. **Measured in the built app** with the scripted model (load about 9 to
12): two children delegated one after the other were both running at the press (`→ 2`) and the timeline recorded two
`child_paused`; one child alone was pressed when the bound ran out, 45.0 s after it started (`→ -1`), and one was paused.
**Not measured:** the live model's resume scenario (the orchestrator's next default live run).

**Follow-up 2026-10-07 (fin31, the bundle's review).** The reading was a second eval waiting on the press's own
condition, polled independently of the click: a pause that took the children out of `running` before that eval's next
probe left "no reading at the press" (a NOTE, never a false PASS). The arming step now also installs a capture-phase click
listener that writes, at the press and before the product's own handler runs, how many children were running and whether
the bound had run out (`body[data-running-at-press]`, negative once it had); the press requires the arming step to have run
(`body[data-pause-armed="1"]`), and the second eval reads the mark (`Number(document.body.dataset.runningAtPress)`).
**Pinned by** the cases under "the press leaves its own reading" in `apps/desktop/scripts/lib/resume-pause.test.ts`, which
run the arming expression against a stand-in page, red before. **Measured in the built app** with the scripted model (load
about 15): two children that appeared in the same poll were armed 41 ms before the press, which read `→ 2`, and the timeline
recorded two `child_paused`; one child alone was pressed 45.0 s after it started, read `→ -1`, and one was paused.

## Specs

None contradicted; PD-ORCH-005 clauses 3, 4 and 13 are what the scenario measures.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the resume scenario's click and eval steps, and its checks.
- `apps/desktop/scripts/lib/resume-pause.mjs`: the `PAUSE` selector, the arming and reading steps, and `pauseReading`.
