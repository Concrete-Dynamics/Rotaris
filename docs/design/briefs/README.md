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
| *(none yet; the first is the Overview audit of the design-system overhaul's dry run)* | | |
