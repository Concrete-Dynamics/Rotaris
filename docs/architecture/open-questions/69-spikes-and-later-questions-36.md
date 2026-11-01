# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-468; OQ-460 – OQ-467 archived in [the archive](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md).

- OQ-460 — May clause (4)'s second hand-over wait an interval of its own?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460)
- OQ-461 — What does a launch end as when the holder is live and never answers?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461)
- OQ-462 — What is the person told when a utility process is lost or never reports ready, and is it forked again?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462)
- OQ-463 — Should a credential at rest be encrypted under the platform's user-bound key, beyond the mode bits and the access-control list …; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-463)
- OQ-464 — Does the workspace write boundary bind the terminal, git and MCP tools, or the file tools alone?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-464)
- OQ-465 — May the per-session log be bounded in size, and by what shape?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-465)
- OQ-466 — Does the renderer stay on the `file:` scheme, or move to a privileged custom scheme?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-466)
- OQ-467 — What bounds the size of what a renderer command carries?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467)

<a id="oq-468"></a>

**OQ-468 — Do the workspace-boundary sentences the user reads overclaim where OS confinement is inactive?** *(REQ-WORKSPACE-022, REQ-TOOLS-131, REQ-CONFIG-327, REQ-TOOLS-129, ADR-0022, IC-8. Raised 2026-11-01 by the ruling of OQ-464, which asked for it and did not rule it.)*

**What is open.** OQ-464 ruled the boundary per tool: the fence binds every first-party tool that takes a path, the gate's key scoping binds a tool call carrying a path key, and the terminal and MCP are bounded by OS confinement where it exists and by nothing on native Windows (IC-8). Three sentences the user reads say more. REQ-WORKSPACE-022 and REQ-TOOLS-131 state, verbatim, "File access: agents may read and write inside this workspace folder only." REQ-CONFIG-327 states that "any call reaching a path outside the workspace continues to require approval". Where confinement is inactive a shell command reaches any path the operating system allows, and the sentences promise what the mechanism does not hold.

**What the build proceeds under.** The sentences stay as the requirements state them; a change to those strings needs a directive, which OQ-464's ruling did not mint. The hardening plan hardens the fence (bundle `fence-hardening`) and adds OQ-464's invariant test, and changes no user-facing wording.

**What decides it.** A ruling on whether the wording is narrowed where confinement is inactive (a directive over the three requirements, stating the terminal's and MCP's boundary as it is), or left as the target's own words with the gap recorded in `docs/architecture/hardening.md`.

<a id="oq-491"></a>

**OQ-491 — Does `PD-ORCH-002` supersede `REQ-ORCH-153` whole, or narrow its presentation clause?** *(REQ-ORCH-153, PD-ORCH-002, REQ-ORCH-154, OQ-237, R-092. Raised 2026-11-01 by hrd2's bundle H1, building `rotaris/requirement-citations-resolve`.)*

**What is open.** `PD-ORCH-002`'s disposition reads `> **Supersedes:** REQ-ORCH-153`, so `pnpm symbols` writes `SUPERSEDED_BY['REQ-ORCH-153'] = 'PD-ORCH-002'`, marks the requirement `@deprecated` ("Cite the directive, not this"), and `pnpm req-coverage` leaves it out of the live shipping total; `PD-ORCH-003` and OQ-237's ruling reason from that supersession. The directive's own rule says something narrower: "`REQ-ORCH-153`'s presentation clause … is narrowed", and its text restates none of the requirement's other clauses — the planning grants withheld at dispatch, no child holding a writing tool and no hook or check suite while the gate is held, the three answers, `awaiting_plan_decision`, the hold surviving a restart and raising no terminal status. The code cites `REQ-ORCH-153` for exactly those clauses: 151 lines in 57 files under `packages/`, `apps/` and `tools/` name it without a word of supersession. Read as the disposition states it, those clauses no longer govern and nothing replaces them; read as the rule states it, the requirement still governs outside its presentation clause and the disposition, the artifact and the coverage denominator say otherwise.

**What the build proceeds under.** `rotaris/requirement-citations-resolve` holds `REQ-ORCH-153` in its `pending` option, citing this entry (`eslint.config.js`): the rule still fails a citation of an identifier that does not exist, and suspends the superseded check for this one identifier only. No citation was rewritten, and nothing `pnpm symbols` generates was changed (bundle I3 reads the superseded set as it stands).

**What decides it.** A ruling on which reading governs. If the rule's: a revision of `PD-ORCH-002` whose disposition narrows `REQ-ORCH-153` (`SUPERSEDED_BY` then loses one key and the live total gains one), and the `pending` entry leaves. If the disposition's: the clauses the code relies on are restated where they govern (a directive), each citation moves to it, and the `pending` entry leaves.
