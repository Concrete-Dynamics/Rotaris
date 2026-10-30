# `live-run`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/live-run.mjs`](../../apps/desktop/scripts/live-run.mjs).

The built product against a real endpoint and a real key — **money; never automatic** against a metered endpoint. Since 2026-10-02 ([R-068](../product/requests.md#r-068)) the registered default (`katalyst`) is self-hosted and registered `unmetered`, and the owner's authorization to run against it is standing ("never ask for my persmission for it. you always have my permission."): it spends nothing and is run without asking, though still never by `pnpm check`, a hook or CI

When it runs, who may start it and the owner's standing authorization are the rules in
[`AGENTS.md`'s live-run section](../../AGENTS.md#the-live-run--pnpm-live-run), which bind every agent. Everything else —
its scenarios, its evidence pack, its cost and how to read a failure — is this record; it stood in `AGENTS.md` until
2026-10-26, when it moved here so that file fits the window every harness reads whole. Its rules bind as they did there.

## Parts

Since 2026-10-30 the rest of this document is in [`live-run/`](live-run/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](live-run/01-the-classifier-s-refusals.md) | The classifier's refusals |
| [02](live-run/02-registering-an-endpoint-and-storing-its-key.md) | Registering an endpoint, and storing its key |
| [03](live-run/03-running-it.md) | Running it |
| [04](live-run/04-what-it-costs-and-what-stops-it.md) | What it costs, and what stops it |
| [05](live-run/05-what-it-does.md) | What it does |
| [06](live-run/06-the-evidence-pack-and-what-it-is-for.md) | The evidence pack, and what it is for |
| [07](live-run/07-the-faults-scenario-the-endpoint-misbehaving-on-purpose.md) | The `faults` scenario — the endpoint misbehaving, on purpose |
| [08](live-run/08-the-two-duress-scenarios-and-the-rule-they-obey.md) | The two duress scenarios, and the rule they obey |
| [09](live-run/09-reading-a-failure.md) | Reading a failure |
| [10](live-run/10-what-the-first-execution-found-2026-09-11.md) | What the first execution found — 2026-09-11 |
| [11](live-run/11-what-the-fifth-scenario-s-first-execution-found-2026-09-11.md) | What the fifth scenario's first execution found — 2026-09-11 |
| [12](live-run/12-the-fixture.md) | The fixture |

A new finding or recipe is written into the part whose subject serves it, never here.
