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
in `scripts/orchestration.mjs` reads them; change a label's shape only together with it and its self-test.

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

- Observed here: two lanes ran two agents at a time, and an unbounded `parallel()` had six builders working at once.
  Do not rely on the tool to bound load; the template bounds the repair phase with `pool` (the profile's
  `repairPool`).
- Merges are serialized with a promise-chain lock, proof sweeps with another. Two workflows, or a workflow and you,
  coordinate through `origin/main`: a push that is not a fast-forward is rejected, and whoever is rejected fetches
  and merges. Never run two runs of one `RUNS.txt` at once.

## Cost and duration, as observed

A bundle takes one to three hours end to end; most pass on the first or second verification; a few needed five.
Thirty bundles took about a day on two lanes; a 25-bundle repair phase another day.
