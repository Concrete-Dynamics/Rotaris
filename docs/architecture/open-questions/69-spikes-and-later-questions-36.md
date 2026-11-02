# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-468, OQ-477, OQ-490, OQ-491; OQ-460 – OQ-467 archived in [the archive](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md).

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

<a id="oq-477"></a>

**OQ-477 — How is a store refused as corrupt resolved?** *(REQ-SESSION-089, REQ-SESSION-201, REQ-SESSION-202, ADR-0058's recovery ladder, OQ-281. Raised 2026-11-01 by hardening C1, which built the refusal.)*

**What is open.** The workspace service's open now runs `PRAGMA quick_check` before it migrates, and a store that fails it is refused as `workspace.store-corrupt`, naming the store and SQLite's report, held by main beside the other store refusals (`main/store-notice.ts`). Nothing resolves it. ADR-0058's ladder (salvage into a fresh store, the exports of what it recovered, moving the damaged store aside and starting an empty one, and naming the restore as a remedy the user may take) is unbuilt. REQ-SESSION-201's restore is refused for a window with no workspace identifier unless the held refusal is `workspace.store-missing` (`main/store-resolution.ts`, `placeOf`), and Settings › Project disables it the same way. Admitting it here leaves open what the assessment says about a target it cannot read: its sessions and its lock rows may sit on the damaged pages, and REQ-SESSION-201's first dialog states how many sessions the replaced store holds. It also leaves open whether the inspection may open the target read-write, whose close checkpoints the log the refusal kept. Whether the notice should carry an action, and which, follows from that.

**What the build proceeds under.** The refusal is held and raised as an error notice with no action. Its detail says the store was left as it was found, its write-ahead log included, and that no session starts until it is resolved. It names no remedy the product cannot perform. The person resolves it by hand. A copy may be taken and repaired outside the product; and once the store is moved out of its place by hand, the place reads as REQ-SESSION-202's empty place, where Settings › Project admits the restore and the new store (OQ-281).

**What decides it.** A ruling on which of the ladder's steps, and whether the restore, are offered while the refusal is held; what the restore's assessment reports for a target that fails the check; and the notice's action.

<a id="oq-490"></a>

**OQ-490 — Does R-092's "superseded requirements" ask for more than the text beyond a definition line, which is none?** *(R-092, REQ-TRACE-181, `docs/architecture/hardening.md` §6 row 6, `AGENTS.md` "When the owner asks for something". Raised 2026-11-02 by hrd2's bundle I3, building the archive's specification kind.)*

**What is open.** R-092 named superseded requirements among the history to archive, and its classification fixed what stays: "a superseded or withdrawn requirement keeps its identifier, its anchor and its definition line in `docs/spec/`, and its text moves verbatim to the archive". The kind (`tools/archive/spec.mjs`) moves the lines beyond a definition's first paragraph, leaving the directive's back-pointer. Its first run over the 275 requirements that qualify (268 withdrawn in place, 7 superseded by a directive) moved nothing: every one of them is wholly its definition line, and the 7 superseded ones are that line and their back-pointer blockquote. The withdrawn ones' reasons (`*Withdrawn.* Its only surface was a terminal-interface modal … carried by REQ-…`) are written on the definition line itself, so the 88,622 bytes those 275 lines hold (2.1% of `docs/spec/`'s 4,167,448) stay where an agent reading a part loads them. Moving a withdrawal's reason would cut a definition line, which edits the specification in place.

**What the build proceeds under.** The kind is built, in `pnpm archive:migrate` and its `--check`: text written under a withdrawn or superseded definition from now on moves on the next run. No line of `docs/spec/` was changed, and the generated artifact is identical.

**What decides it.** A ruling on whether R-092 is met by the guard as built, or wants the withdrawn definition lines shortened to the identifier, the marker and the requirement that carries the capability, the reasoning archived. The second edits `docs/spec/` in place, against the rule `AGENTS.md` states, so it would be the owner's to allow (an escalation), not a ruling under R-072.

<a id="oq-491"></a>

**OQ-491 — Does `PD-ORCH-002` supersede `REQ-ORCH-153` whole, or narrow its presentation clause?** *(REQ-ORCH-153, PD-ORCH-002, REQ-ORCH-154, OQ-237, R-092. Raised 2026-11-01 by hrd2's bundle H1, building `rotaris/requirement-citations-resolve`.)*

**What is open.** `PD-ORCH-002`'s disposition reads `> **Supersedes:** REQ-ORCH-153`, so `pnpm symbols` writes `SUPERSEDED_BY['REQ-ORCH-153'] = 'PD-ORCH-002'`, marks the requirement `@deprecated` ("Cite the directive, not this"), and `pnpm req-coverage` leaves it out of the live shipping total; `PD-ORCH-003` and OQ-237's ruling reason from that supersession. The directive's own rule says something narrower: "`REQ-ORCH-153`'s presentation clause … is narrowed", and its text restates none of the requirement's other clauses — the planning grants withheld at dispatch, no child holding a writing tool and no hook or check suite while the gate is held, the three answers, `awaiting_plan_decision`, the hold surviving a restart and raising no terminal status. The code cites `REQ-ORCH-153` for exactly those clauses: 151 lines in 57 files under `packages/`, `apps/` and `tools/` name it without a word of supersession. Read as the disposition states it, those clauses no longer govern and nothing replaces them; read as the rule states it, the requirement still governs outside its presentation clause and the disposition, the artifact and the coverage denominator say otherwise.

**What the build proceeds under.** `rotaris/requirement-citations-resolve` holds `REQ-ORCH-153` in its `pending` option, citing this entry (`eslint.config.js`): the rule still fails a citation of an identifier that does not exist, and suspends the superseded check for this one identifier only. No citation was rewritten, and nothing `pnpm symbols` generates was changed (bundle I3 reads the superseded set as it stands).

**What decides it.** A ruling on which reading governs. If the rule's: a revision of `PD-ORCH-002` whose disposition narrows `REQ-ORCH-153` (`SUPERSEDED_BY` then loses one key and the live total gains one), and the `pending` entry leaves. If the disposition's: the clauses the code relies on are restated where they govern (a directive), each citation moves to it, and the `pending` entry leaves.
