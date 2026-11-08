# `persona-chip-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/persona-chip-proof.mjs`](../../apps/desktop/scripts/persona-chip-proof.mjs).

The three composer chips that choose what the **next** run starts with — persona, model and reasoning — are read at
rest (no session, run state `Ready`) and again while a run is live, in one launch, and the two readings must **agree**.
The run really starting as the configured role is measured too, where it is decided rather than where it is drawn: the
run host's own `configuration: loaded … entry <role> on …` line, and the store's `iterations.root_persona`.

Two launches, so the reading is diagnostic rather than incidental. Workspace A's `default_persona` is `architect`, on a
model key (`arch-model`) and a reasoning level (`low`) of its own, so a chip that names some other role is visible in all
three values at once. Workspace B's is `coding-agent` — deliberately **not** the word the retired fallback printed — so a
chip that still reads `orchestrator` there has been shown to ignore the configuration rather than to agree with it.

Kept because it was **red**, and for the reason it exists. `entryRole` (`packages/ui/src/agents.ts`) chose the entry role
as the live run's persona, else the transcript's latest root row, else the **literal** `'orchestrator'`. With no run and
no transcript the literal won, whatever the file said, so a workspace stating `default_persona: architect` drew the
persona chip `orchestrator` at rest and it appeared to jump to `architect` the moment a run began
(`docs/defects/the-composer-chips-name-orchestrator-at-rest-instead-of-the-configured-default-role.md`). The same
fallback names the role the model and reasoning chips read their values from, so all three misdrew together — the
permission-mode chip, which reads the configured mode through its own prop (the shape PR #71's sibling repair
established), stayed right and is this proof's non-moving control.

The repair gives `entryRole` the configured default role (`ConfigSnapshot.defaultPersona`, `snapshotOf` →
`entryOf`) as the fallback in place of the literal, so a surface with no run names the role the next run would start as
(REQ-CHAT-006/009 with REQ-CONFIG-063). The live-run and latest-root precedence is unchanged, and the literal
`'orchestrator'` remains only as the last resort for a caller that holds no configuration at all.

The control the reading rests on is the mode chip: it must **not** move between the two readings. A mode chip that moved
here would mean the premise — that this chip is the correct shape in this strip — is wrong, and the harness rather than
the product is at fault. Measured on Linux, 2026-11-08: workspace A read `architect` / `arch-model` / `Low` /
`mode: ask` in both readings, workspace B read `coding-agent` at rest, and the same proof failed on the unrepaired head
with *"the persona chip at rest does not name the configured default role: `orchestrator` while the file states
`default_persona: architect`"*.
