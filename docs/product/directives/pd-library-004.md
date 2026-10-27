[Product directives](../directives.md) › PD-LIBRARY-004

<a id="pd-library-004"></a>

### PD-LIBRARY-004 — a read marks the reading agent instance a consumer by its canonical name

Every successful `artifact_read`, filtered or full, SHALL append the reading agent instance's canonical name to the
artifact's `consumed_by`, at most once. That name is a child's canonical name (REQ-ORCH-044) or a root's recorded
`root_canonical_name`: the name REQ-LIBRARY-093 gives `created_by`. Two instances of one persona that read one artifact are
two consumers; one instance that reads twice is one consumer (REQ-LIBRARY-096). The received links of REQ-MONITOR-044,
REQ-MONITOR-052 and REQ-MONITOR-069 read these names.

**As built.** `ArtifactStore.markConsumed` in `packages/engine/src/artifacts/store.ts`, called by `artifactOps`'s `read` in
`packages/engine/src/artifacts/port.ts` with the calling agent's `canonicalName`; `agentArtifacts` in `packages/ui/src/agents.ts`
matches an agent's names against the consumers.

**Why, and what it costs.** REQ-LIBRARY-099 and REQ-TOOLS-148 say "the reading persona"; REQ-LIBRARY-096 says "the actor"
([OQ-211](../../architecture/open-questions.md)). REQ-LIBRARY-093's reason for naming `created_by` by instance, that two instances
sharing a persona stay distinguishable, applies as much to who read an artifact, and OQ-125, confirmed under R-071, already
reads an agent's received artifacts from the consumers by name. The persona can be recovered from the instance; the instance
cannot be recovered from the persona. Under the persona reading the received links would be wrong whichever way they matched:
empty when matched by name, or crediting every sibling of the persona, and the run-level agent with every read of a child of
the entry persona, when matched by persona. What it costs: canonical names are unique only under one parent (REQ-ORCH-044), so
two children of different parents that share a name are one consumer, the same limit `created_by` already has; every iteration
root of one persona shares one root canonical name; a black-box comparison of `consumed_by` with the reference may differ, and
only the received links show it; and PD-LIBRARY-001's back-pointer phrase "marks the persona a consumer" now reads as the
instance.

> **Narrows:** REQ-LIBRARY-099, REQ-TOOLS-148

*Raised under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of OQ-211, which weighed
advocate A's and advocate B's recommendations, both to confirm as built with a directive, and followed both.*

> **Built 2026-10-07 (bundle `fin28-artifacts`), as built before.** Nothing in the code moved: the comments in `store.ts` and
> `port.ts` cite this entry, and three pinning tests hold it, each green on the build as it stood — two instances of one persona
> read one artifact and are two consumers in read order (`artifacts/artifacts.test.ts`), only the reading instance has the
> received link and its same-persona sibling none, and a child of the entry persona that reads does not credit the run-level
> agent (`ui/src/inspector-links.test.ts`). No mechanism ran for the first time, so no row is owed to
> [`../architecture/first-executions.md`](../../architecture/first-executions.md), as the ruling decided.
