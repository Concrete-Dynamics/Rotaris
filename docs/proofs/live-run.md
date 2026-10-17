# `live-run`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/live-run.mjs`](../../apps/desktop/scripts/live-run.mjs).

The built product against a real endpoint and a real key — **money; never automatic** against a metered endpoint. Since 2026-10-02 ([R-068](../product/requests.md#r-068)) the registered default (`katalyst`) is self-hosted and registered `unmetered`, and the owner's authorization to run against it is standing ("never ask for my persmission for it. you always have my permission."): it spends nothing and is run without asking, though still never by `pnpm check`, a hook or CI

The full record — its scenarios, its evidence pack, its terms and its cost — is
[`AGENTS.md`'s live-run section](../../AGENTS.md#the-live-run--pnpm-live-run).
