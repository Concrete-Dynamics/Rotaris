# The Workflow tool, as it behaves

## Opt-in

A workflow spends many agents. Run one only when the owner asked for a workflow or multi-agent orchestration in
their own words, or invoked this skill. Load the `workflow-authoring` skill once per session before editing the
template.

## Shape

- `export const meta = {…}` must be a pure literal. Everything else is plain JavaScript with `agent()`, `parallel()`,
  `log()` and the global `args`.
- **A script cannot read files.** State goes in as `args` or embedded in the script. `render` embeds the whole plan
  and the recovered state, so the tool call carries only `scriptPath`: large inline `args` would cost the
  orchestrator's own context.
- `agent(prompt, { label, phase, schema, model, effort })` returns the schema-validated object, or `null` when the
  agent was lost. `model: 'opus'`; `effort: 'medium' | 'high' | 'max'`. The template wraps it in `call()`, which
  halts the run after three empty results in a row.
- Agents cannot see the conversation. Everything they need is in the prompt, the brief, the files the prompt names,
  and `CLAUDE.md`.

## Labels are the resume keys

`implement:<key>`, `implement:<key> (resumed)`, `verify:<key>#<n>`, `fix:<key>#<n>`, `merge:<key>`,
`accept:sweep-1#<round>`, `accept:sweep-2#<round>`, `accept:live#<round>`, `accept:autopsy#<round>`. `deriveState`
in `scripts/orchestration.mjs` reads them; change a label's shape only together with it and its self-test. The
`merge:<key>` stage lands its bundle as a rebase and a fast-forward push since 2026-10-04; its label keeps the name.

## Journals

`~/.claude/projects/<project>/<session>/subagents/workflows/<run>/journal.jsonl`, one JSON object per line:
`{"type":"started","key":…,"label":…}` and `{"type":"result","key":…,"result":…}`. A `started` without a
`result` is an agent the run lost. The completion notice's output file holds the script's return value (`status`,
every bundle's ending, acceptance); the journal holds every agent's.

## Resuming

- `resumeFromRunId` replays cached agent results **by call order**: editing an earlier call's prompt or options
  invalidates every later one, and with concurrent lanes the order is not stable from run to run. Use it only for a
  single sequential chain.
- For lane scripts, recover with `render --runs` (SKILL.md §4): the journals decide where each bundle stands, and the
  new script starts each bundle there.

## Concurrency and serialization

- **A run executes at most two agents at a time here.** The tool's own reference caps concurrent `agent()` calls at
  min(16, available CPUs − 2) per workflow, a nested `workflow()` sharing its parent's cap: two on a 4-CPU host.
  None of the sixteen runs of the session this skill came from exceeded two (fourteen peaked at two; measured from
  each agent transcript's first and last timestamps), whatever their lanes or `parallel()` width; a four-lane run
  started two lanes and queued the other two. Agents you start yourself (the Agent tool) run beside it. Lanes past
  the cap only queue, and one lane runs one agent at a time: plan duration on the cap per run.
- **Two runs at once each run two**: on 2026-09-29 `wf_4da43d03-b3a` and `wf_f722534f-88d` overlapped from 05:27 to
  11:29 UTC with four workflow agents at once, and every merge either made then had its gate green.
- **To run more, split the bundles over two plans** that share no bundle, no file and no `after`:
  - each has its own `id`, so its own branches and integration worktree (`<repo>-wt-integ-<id>`), and its own
    scratchpad directory (SKILL.md §3: `plan.json`, `RUNS.txt`, rendered scripts) and check-in;
  - each takes `"acceptance": { "rounds": 0 }`, because every plan shares the profile's acceptance worktree;
  - when both have settled and a fresh triage has run (SKILL.md §5), one acceptance-only plan (`"bundles": []`, the
    rounds a single plan would have had, 2 by default) runs the acceptance over merged main, and its repairs go
    through the same loop;
  - the acceptance live runs stay one at a time, in the acceptance-only plan; a builder's short `--only=<scenario>`
    run may meet one from the other plan, and two live runs leave each other's sandboxes alone
    (`references/live-runs.md`), competing only for CPU and the endpoint.
  Pushes from the two meet at `origin/main` (below).
- **A bundle that builds on another plan's unmerged changes** is a later plan, launched when what it builds on has
  merged, and the orchestrator holds it until then. A triage marks such a bundle with the plan it waits on, in the
  triage's own list (triage 4 wrote `after: ["fin6"]`); the mark never goes into `plan.json`, where `after` names
  bundles of the same plan only and `render` refuses any other. On 2026-10-02 fin8's `ladder-overrides` and
  `focus-bound-recovery` were held so while fin6's `auth-recovery` bundles had yet to merge.
- Landings are serialized with a promise-chain lock, proof sweeps with another. Two workflows, or a workflow and you,
  coordinate through `origin/main`: a push that is not a fast-forward is rejected, and whoever is rejected fetches,
  rebases, runs the gate again and pushes again. Never run two runs of one `RUNS.txt` at once.

## Cost and duration, as observed

A bundle takes one to three hours end to end; most pass on the first or second verification; a few needed five.
Thirty bundles took about a day on two lanes; a 25-bundle repair phase another day.
