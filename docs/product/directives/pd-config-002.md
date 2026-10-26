[Product directives](../directives.md) › PD-CONFIG-002

<a id="pd-config-002"></a>

### PD-CONFIG-002 — the Settings provider list shows every provider REQ-PROVIDER-140 lists

The provider list of the Settings Models category SHALL show a row for each provider REQ-PROVIDER-140 lists — the union
of the ids holding a stored credential, the built-in catalogue ids and the snapshot ids, each once, ordered by id —
whether or not it is authenticated. REQ-CONFIG-389's first sentence, "The provider list shows **no** built-in or
merely-referenced provider by default; a row appears only once a provider is authenticated", no longer governs. Its other
sentences still do: the managed-cloud provider's row carries its quick-start action in addition to the normal actions, and
a provider that a model slot references and REQ-PROVIDER-140's union does not hold, a deleted custom endpoint included,
causes no row.

**Why, and what it costs.** ESC-36: REQ-PROVIDER-140 and REQ-CONFIG-389 state disjoint populations for one list. The build
follows REQ-PROVIDER-140 (`packages/providers/src/signin.ts` `list()`, the renderer's providers card), the mockup's row
for an unauthenticated GitHub Copilot shows the same, and Settings is the one place a user starts authentication for any
provider. The owner kept the built behaviour. What it costs: the list is longer, and an unauthenticated built-in reads
"Not authenticated" rather than being absent.

> **Narrows:** REQ-CONFIG-389

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of ESC-36.*
