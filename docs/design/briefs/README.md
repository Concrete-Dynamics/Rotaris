# Surface briefs — one file per surface, the brief before and the audits after

A **brief** is what `design-ui` (`.agents/skills/design-ui/SKILL.md`) writes before a surface is drawn: its journeys, its content model within the fixed structure, its states, its interaction, its copy, its accessibility obligations, its composition intent, its components, its disagreements and its evidence plan — in the shape of `.agents/skills/design-ui/references/design-brief.md`. An **audit** is what the same skill writes about a built surface, appended to the same file as `## Audit YYYY-MM-DD` in the shape of `.agents/skills/design-ui/references/surface-audit.md`.

Rules:

- One file per surface, named by the slug of its row in [`docs/design/README.md` §7](../README/07-7-fidelity-consult-before-maintain-after.md); that row points here once the surface is drawn or audited.
- The brief **cites** — a requirement by id, a token or component by name, a § by number — and restates neither the specification nor §1. The specification fixes structure; the design language fixes appearance; a brief decides what is left ([§6.1](../README/06-6-reference.md)).
- Status moves `proposed` → `approved <date>` → `built <date, commit>` → `verified <pack revision>`, or `superseded by <path>`. An audit's items start `proposed`.
- A brief that proposes behaviour no requirement states is a request first (`docs/product/requests.md`); a gap it finds in the language is an open question, raised and never ruled here.
- The document budget applies (`docs/README.md`): a brief whose audits outgrow it moves its oldest audits to `<slug>/` parts.

| Surface | Brief | Last audit |
|---|---|---|
| Overview | [`overview.md`](overview.md), an index of [`overview/`](overview/) | 2026-11-02; its executable items implemented 2026-11-03 (items 1, 3–6, 8–10, 12–16, P1–P4) and 2026-11-05 (items 2 and 11, after OQ-537, OQ-539, OQ-540) |
| Transcript rows, run header | [`transcript-rows.md`](transcript-rows.md) — an audit of the run header alone, with the brief's §1, §8, §10 and §11 | 2026-11-10 (R-097), proposed |
| Git | [`git.md`](git.md) — an audit, with the brief's §1, §8, §10 and §11 | 2026-11-10 (R-097), proposed |
| Library | [`library.md`](library.md) — an audit of the Prompts tab, with the brief's §1, §4, §8, §10 and §11 | 2026-11-10 (R-097), proposed |
| Settings | [`settings.md`](settings.md) — the brief for how a category arranges its rows, and its audit | 2026-11-10 (R-097), proposed |
| Requirements board | [`requirements-board.md`](requirements-board.md) — the brief for the view's frame (header, empty states, foot), and its audit | 2026-11-10 (R-097), proposed |
