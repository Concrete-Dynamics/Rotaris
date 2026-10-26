## A coordinator briefs a codebase-analyst to publish an artifact it holds no tool for, and the child invents `artifact_write`

Seen in fin46's final acceptance (round 2 at `3c03287`, finding F10), in the default live run's `delegation` scenario (pack
`2026-10-15T03-10-08-908Z`, session `d0c3a7f0`). The scenario asks the coordinator to delegate a codebase-analyst and then to
"find that child's report artifact with artifact_list". Nothing the coordinator is offered says that the run keeps every ended
child's report as a `child_report` artifact (REQ-LIBRARY-092): `delegate`'s description names no such thing, and its catalogue
entries state only REQ-TOOLS-001's three facets, so no entry can say who publishes. The coordinator therefore wrote into the
analyst's brief (`#5`, MUST DO) "Publish your findings as an artifact so later steps can attach it."

The analyst's system text said "ARTIFACT: Produce no artifact beyond your report", and its grant held no `artifact_write` (OQ-212
keeps every built-in persona's `can_publish_artifacts` false). It called `artifact_write` anyway (`#10`), which the gate refused
as an unknown tool — an enforced bound holding — then called `artifact_list` (`#11`, "No artifacts found", true at that moment,
since its own report becomes the artifact only when it ends). Its report opened on a paragraph about the missing tool, and the
stored report artifact `art_C1ZUuJ3B` says in its summary "It attempted to publish the findings with artifact_write, but that tool
was unavailable, so no artifact or file was created", repeats it in its key findings and carries the tag `errors` on a succeeded
report. That artifact was then attached whole to the docs-writer (`#17`), so the false claim travelled to the next agent. The
coordinator found `art_C1ZUuJ3B` only by its own `artifact_list` and `artifact_read` (`#14`, `#15`). OQ-256 records the same false
belief at an earlier duress run (request 98, "believed the architect had published no artifact").

## Specs

- REQ-LIBRARY-092: every terminal child report is materialised as an artifact; neither agent is told so, and the stored artifact
  states the opposite of what the product did.
- REQ-TOOLS-152 as `PD-TOOLS-006` revision 4 narrows it: the catalogue states what a child's grant lets it do, and revision 8
  forbids a brief offering a tool the entry does not show — which cannot cover publishing while no entry can show it.
- REQ-TOOLS-154: the child's payload, which carries nothing about its report.
- OQ-250's limb "any brief offering a command or tool its target lacks", stated for a duress run; here met in a default run.
- Ruled as [OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334) under [R-072](../../product/requests.md#r-072): `PD-TOOLS-006`
  revision 10.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — `delegate`'s description (`HAND_OFF_SENTENCE` and what follows it) and
  `renderDelegateCatalogue`'s facet words.
- `apps/desktop/src/run-host/tools.ts` — `resolveAgentGrant` and `delegateCatalogue`, which resolve each persona's grant with its
  own `can_publish_artifacts` and the store.
- `packages/engine/src/children/notify.ts` — `childPayload`, the child's first message.
- `apps/desktop/scripts/lib/routing-misses.mjs` — the live run's count of unknown-tool calls by children (`#10` was one).

## Outcome — repaired 2026-10-15 (fin47, `fin47-delegation-routing`)

Built as [OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334) ruled, `PD-TOOLS-006` revision 10:
- `REPORT_ARTIFACT_SENTENCE` (`packages/agent-tools/src/tools/delegation.ts`) follows `HAND_OFF_SENTENCE` in `delegate`'s
  description wherever the caller's run holds an artifact store (`DelegateToolOptions.artifactStore`, which `createToolPort` sets
  from the prerequisite the catalogue's grants are resolved under);
- `catalogueWords` appends "publishes artifacts" to an entry whose resolved grant holds `artifact_write` — under the defaults no
  built-in entry does (OQ-212);
- `CHILD_REPORT_ARTIFACT_SENTENCE` (`packages/engine/src/children/notify.ts`) follows the workspace-root line in every child payload,
  ahead of the write scopes, attachments and task.

Pinned by `tools/delegation.test.ts` (the sentence verbatim after the hand-off sentence and absent without a store; the word present
with `artifact_write`, absent without it), `run-host/tools.test.ts` (a persona configured with `artifact_write` and
`can_publish_artifacts: true` reads the word, without the flag or without a store it does not, no built-in does) and
`children/notify.test.ts` with `children/children.test.ts` (the sentence after the root in every payload) — each red on the code
before, but the built-in guard, which the old code met trivially. The live run counts children's unknown `artifact_write` calls and
briefs asking a non-publisher to publish (`routingMissReading`'s `unknownArtifactWrites` and `publishBriefs`, target 0 each); replayed
over the 3c03287 default pack they read 1 and 1 (`#10`, `#5`), the shape above. Not yet shown live: the next default pack is the
measure (0 of each, and the analyst's report artifact carrying no claim that publishing failed).
