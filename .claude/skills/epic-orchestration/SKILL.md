---
name: epic-orchestration
description: Plan and execute a large multi-requirement epic in Rotaris by splitting it across parallel background agents in git worktrees. Use when asked to implement or execute a whole epic or a feature spanning many SWRs, files, or both src/rotaris_core and apps/rotaris. Not for single-requirement changes.
---

# Epic Orchestration

Deliver a whole epic through waves of parallel worktree agents, integrated on one
branch. Optimises for *every PR being independently green*, not for maximum fan-out.

**Do not use this for a single requirement or a change under ~3 files.** The
coordination overhead exceeds the parallelism gain. Use it when the work spans
several SWRs, both packages, or more than a few days of serial effort.

## The shape

```
research → decide open questions → decompose into waves → integration branch
  → launch wave → integrate + verify → reconcile → next wave → finalise
```

Waves exist because [ReqToCode](../../../docs/reference/reqtocode-playbook.md) breaks
the build on partial work and because units in a coupled feature share files. Within a
wave, file sets must be **disjoint**; across waves, dependencies flow forward only.

## Phase 1 — research and decide

Read the epic's requirement document first, then explore. Three parallel `Explore`
agents covering different territory (backend/config, Rotaris UI, tests + ReqToCode
workflow) is usually the right shape.

**Expect the spec to disagree with the code.** Requirement documents are often written
ahead of implementation. Hunt for this explicitly — every epic so far has had several.
Typical classes: a config file that does not exist, a pattern cited from the Textual TUI
when the work ships in Rotaris, test paths in the wrong suite, a named precedent that was
never built.

Resolve every material disagreement with `AskUserQuestion` **before** planning. Batch them
into one call. Each option needs the concrete trade-off, not a label. Also ask about:

- Any security or UX decision a worker would otherwise make unilaterally (permission
  scope, default-on behaviour).
- The execution shape itself, if the work is coupled enough that full fan-out would
  produce unmergeable PRs. Say so plainly and recommend waves.

Then write the plan: units, waves, file ownership per unit, the e2e recipe, and the
worker template.

## Phase 2 — decompose

- 8–12 units for a typical epic. Scale to the work, not to a target number.
- **One owner per file.** Two units editing the same file belong in different waves.
- Wave 1 is foundation (config, schema, pure helpers). Wave 2 is backend behaviour.
  Waves 3–4 are UI. The last wave is E2E plus paperwork.
- Give every unit an explicit file list and an explicit "do not touch" list.

### Conflict control — the rule that matters most

**No unit except the final one may edit the epic's requirement document or flip any
`status:` field.** All ids declared in one spec file share a single `content_hash`, so any
edit rewrites every one of that file's `META` rows in the generated `swr.py` and conflicts
with every sibling.

This is safe because the verifier errors on *approved without annotations*, never on
*draft with annotations*. Implement against `draft`; the final unit flips everything and
adds the `Derived requirements:` back-links in one commit.

## Phase 3 — integration branch

Never let unit PRs target `master`. Units land on the epic branch, and the epic
branch reaches whatever base the epic itself belongs to — a milestone branch if
one claims these requirements, `master` if none does. Ask, do not assume:

```bash
BASE=$(uv run python devtools/milestone.py branch-for SWR-<n>)   # milestone/… or master
git branch epic/swr-<n> "origin/$BASE"
git worktree add <scratchpad>/epic-integration epic/swr-<n>
git push -u origin epic/swr-<n>
gh pr create --draft --base "$BASE" --head epic/swr-<n> --title "Epic SWR-<n>: ..."
```

This nesting is what [AGENTS.md § 4](../../../AGENTS.md#workflow--worktree-merge)
calls the chain: unit → epic → milestone → `master`. Only the last hop needs the
milestone gate.

Workers reset onto it as their first command (see the template) and target it with
`gh pr create --base epic/swr-<n>`.

Note: once you merge a unit branch into the epic branch, you can no longer retarget its
PR — GitHub rejects it as having no new commits. Leave those PRs against whatever base
they were opened on; they auto-close as merged when the epic lands.

## Phase 4 — launch a wave

One `Agent` call per unit, all in a single message, `isolation: "worktree"`,
`run_in_background: true`, `subagent_type: "general-purpose"`.

Every prompt must be fully self-contained — workers cannot ask you anything, and cannot
see each other. Use [worker-prompt-template.md](worker-prompt-template.md).

Hand each worker the **exact public API** of anything a sibling built: names, signatures,
semantics. Ask each worker to report the API it settled on, because the next wave depends
on it.

## Phase 5 — integrate and reconcile

After each wave, in the integration worktree: merge each branch `--no-ff`, then run the
fast gates before launching the next wave.

Merge every unit branch that passed its fast gate, and launch the next wave — the same
merge order [AGENTS.md § Workflow](../../../AGENTS.md#workflow--worktree-merge)
sets for `master`.

**Actively hunt for duplication after every wave.** Independent agents solving related
problems converge on the same abstraction with different names. This has happened in every
wave so far, and one instance was not just duplication but a live bug — two
implementations of the same rule that disagreed. Grep for the same constant, the same
predicate, the same dataclass in two places.

Reconcile it yourself rather than deferring, when a later wave is already being written
against one of the two shapes. Rules of thumb:

- Keep the name the *downstream* units are already coded against.
- Fold in the richer implementation's extras.
- One owner per decision; other layers render or delegate.

**Test the seams the split hid.** A unit tested in isolation cannot catch a contract
mismatch. The coroutine-dispatched-synchronously bug survived both units' full test suites
and only appeared when their code ran together. After reconciling, convert at least one
test per seam to drive the real composed path.

## Phase 6 — finalise

The last unit owns: the canonical hermetic user-flow E2E, all `status: approved` flips,
the spec corrections, `Derived requirements:` back-links, and the epic index.

**Version bumps depend on the base.** When the epic sits under a milestone, both manifests
(`pyproject.toml` and `apps/rotaris/pyproject.toml`) go to that milestone's
`target-version`, set once by whichever unit closes the *milestone* — not per epic, since
the gate checks the manifests against it. When the epic goes straight to `master`, bump
both as usual.

Then: `reqtocode diff --strict` → `check --fix` → `check`, mark the epic PR ready, and
write its body with the unit table, the notable findings, and anything left unmet.

If the epic belongs to a milestone, `uv run python devtools/milestone.py status M<n>`
afterwards shows what the milestone still owes — merging the epic is not the same as
closing the milestone.

## Traps this project will spring on you

| Trap | Consequence |
| --- | --- |
| `git stash` in a worktree | The stash stack is **shared across all worktrees**. One agent's `pop` restores a sibling's uncommitted work into the wrong tree. **Ban it in every worker prompt.** |
| The session scratchpad directory | **Shared by every agent in the wave**, not per-agent. Two workers drafting `pr-body.md` overwrite each other silently — no conflict, no warning, just the wrong text in someone's PR. Tell each worker to use a filename carrying its own unit id (`pr-body-f3.md`), and never a generic one. |
| `code-review` skill | **Correction (2026-08-09): subagents *can* invoke it now**, and it earns its keep — in the fix wave it caught an unguarded `release_lock` sitting between a run and its teardown, and a persister-wide counter that would have dropped a parked save for another session. Put it in every worker prompt as the first step of the finishing routine. |
| `SettingsView._TAB_IDS` | Positionally coupled to `addTab()` order, a persisted preference, and hard-coded indices in `test_views.py`. **Append only.** |
| `tests/conftest.py::_isolate_runtime_mcp_discovery` | `autouse`, stubs MCP tool discovery for every test outside one named file. Patch a different seam; never weaken it. |
| `ConfigService.load()` | Costs 5–18 s, almost all in `_providers()`. Stub only `_providers` / `_subscription_limits` in Qt tests or they time out. |
| Importing `rotaris_core.tools` or `rotaris_core.config` | Pulls in `openhands.sdk` — ~12 s. Keep out of hot paths and per-test setup. |
| `swr.py` | Generated. Never hand-edit. On any merge conflict: take the incoming file, re-run `check --fix`. |

## Reporting

Keep a status table across turns: unit, wave, status, PR link. Re-render it as
notifications arrive.

Relay what the user cannot see: bugs found, decisions a worker made on its own, gates left
unmet, and any behaviour change with a bigger blast radius than the spec implies. Correct
your own earlier claims when a worker's measurements disprove them — that has happened and
it matters more than looking consistent.
