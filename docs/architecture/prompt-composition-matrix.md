# Prompt Composition Matrix

Spec for how a persona's system prompt is assembled at run time as a function of
**persona × classified intent × model tier**.

This document is the design authority. It defines *what* is injected and *when*, not the
final prompt wording. Prompt text is authored during implementation against this spec.

Related: [SWR-2416](../requirements/300-personas-prompts/SWR-2416-prompt-composition-matrix.md),
[SWR-386](../requirements/300-personas-prompts/SWR-386-tier-aware-coding-delegation.md),
[09-persona-branching.md](09-persona-branching.md).

---

## 1. Problem

Prompts today are effectively static:

| Mechanism | Location | Varies by | Reaches |
| --- | --- | --- | --- |
| `[[ROTARIS:INTENT_INSTRUCTIONS]]` | `agents/prompts/intents/*.md` | intent (13 files) | `config.default_persona` only |
| `_CODING_DELEGATE_GUIDANCE` | `agents/prompt_render.py` | tier (3 strings) | orchestrator's `coding-agent` delegate bullet only |
| everything else | `agents/prompts/*.md` + hardcoded dicts in `prompt_render.py` | nothing | fixed |

So: a `small_model` coding-agent receives the same "own the whole change" prompt as a
`large_model` one, and the orchestrator's route for an intent is identical regardless of how
capable the agent it delegates to actually is. Two concrete cases the current system cannot
express:

- **Small feature, large-model coding-agent.** Correct flow: orchestrator delegates once,
  immediately. The coding-agent decides for itself whether to spawn a `codebase-analyst` or
  explore inline, implements, and runs its own tests. The orchestrator only runs the
  verification loop afterwards.
- **Moderate feature, small-model coding-agent.** Correct flow: orchestrator runs a research
  wave first — `librarian` and/or `codebase-analyst` consolidate findings into an artifact —
  then splits the work into narrow ordered chunks, each handed to a coding-agent with the
  artifact attached. Testing and verification happen outside the coding-agent.

Both currently render as the same script.

---

## 2. Axes

### 2.1 Intent (13)

From `agents/prompts/intents/intents.yaml`:

`explicit_trivial`, `single_file_change`, `question`, `exploration`, `problem_resolution`,
`small_feature`, `moderate_feature`, `large_feature`, `refactor`, `architectural`,
`requirements`, `whole_project`, `ambiguous`.

**Intent groups** (used to keep the non-core matrices readable; they are a presentation
device only — resolution is always per concrete intent):

| Group | Members |
| --- | --- |
| `G-answer` | `question`, `exploration` |
| `G-clarify` | `ambiguous`, `requirements` |
| `G-micro` | `explicit_trivial`, `single_file_change` |
| `G-fix` | `problem_resolution`, `refactor` |
| `G-build-s` | `small_feature` |
| `G-build-m` | `moderate_feature` |
| `G-build-l` | `large_feature`, `architectural`, `whole_project` |

### 2.2 Model tier (3)

`small_model`, `medium_model`, `large_model` (`ModelTier`, resolved by
`_resolve_persona_model_tier`, `agents/factory.py:461`).

An unresolved tier (`None` — custom model, ambiguous slot match) resolves to
**`medium_model`**, and the prompt must state that the tier was not determined rather than
claim a tier. This mirrors `_UNKNOWN_CODING_DELEGATE_GUIDANCE`.

### 2.3 Which tier keys which matrix

- **Every persona except the orchestrator** keys on its **own** tier.
- **The orchestrator** keys on the tier of the **implementation owner for the resolved
  intent** — that is, the delegate that will actually do the work:

  | Intent | Implementation owner whose tier keys the orchestrator row |
  | --- | --- |
  | `refactor` | `refactorer` |
  | `requirements` | `requirements-engineer` |
  | `architectural` | `architect` |
  | all others | `coding-agent` |

  The orchestrator's own tier is assumed `large_model` and is not an axis. When the owner
  persona is missing from config, fall back to `coding-agent`, then to `medium_model`.

- **The planner** keys on **both** ([SWR-2425](../requirements/300-personas-prompts/SWR-2425-planner-sizes-for-executor.md)).
  Its slots are split by who they describe:

  | Facing | Slots | Keyed on |
  | --- | --- | --- |
  | self | `ROUTE`, `AUTONOMY`, `RESEARCH`, `ARTIFACT`, `BUDGET` | the planner's own tier |
  | consumer | `CHUNKING`, `OUTPUT` | the implementation owner's tier, as above |

  A plan is the executor's input contract, so how the work is cut and how the plan reads must
  follow the executor's capacity, not the author's. The consumer tier applies **only when it
  ranks below** the planner's own, keeping the downgrade-never-upgrade rule of §5 intact; an
  unresolved owner tier downgrades to `medium_model` and is reported as unresolved. A
  `not_routed` consumer cell is ignored — the planner's own cell stands.

  The shipped defaults make this a live case, not a hypothetical: `planner` is `large_model`
  and `coding-agent` is `medium_model` (`config/defaults.py`), and either can be re-pinned per
  workspace.

---

## 3. Section catalogue

A matrix cell selects **one variant per slot**. Slots not named in a cell fall back to the
persona's default profile. A cell may only select catalogued variants — it may never
introduce free text.

### `ROUTE` — who is called next, in what order

Applies only to personas that route a **whole request** — `orchestrator` and `planner`. Other
personas may still delegate; what they delegate is governed by `RESEARCH`, not `ROUTE`.
Selecting `ROUTE` for an implementer would tell it to hand its own work to someone else.

| Variant | Contract |
| --- | --- |
| `direct` | Delegate straight to the implementation owner. No pre-research wave, no plan step. |
| `research-then-code` | Exactly one research wave (`codebase-analyst` and/or `librarian`) completes and is attached before implementation is assigned. |
| `plan-first` | `planner` produces an ordered plan artifact; implementation slices are taken from it. |
| `design-first` | `architect` produces a design artifact, then `planner`, then implementation. |
| `requirements-first` | `requirements-engineer` establishes acceptance criteria before any other delegation. |
| `answer-only` | No implementation. Research → synthesize → answer. |

### `AUTONOMY` — how much the agent decides unaided

| Variant | Contract |
| --- | --- |
| `full` | Decide scope, approach, and whether to delegate. Do not check back mid-task; report at completion. |
| `bounded` | Decide freely inside the assigned slice. Escalate anything that changes the slice boundary. |
| `strict` | Execute exactly the assignment. No scope decisions, no self-directed delegation. Anything unclear or out of scope → stop and report. |

### `RESEARCH` — how context is acquired

| Variant | Contract |
| --- | --- |
| `self` | Gather own context (`grep`/`glob`/`read_file`/Serena). Delegating research is discouraged. |
| `self-then-delegate` | Start inline; delegate to `codebase-analyst` (internal) or `librarian` (external) once the question spans more than a handful of files or leaves the workspace. |
| `delegate-required` | Must delegate research to a specialist. No broad self-exploration. |
| `artifact-required` | Must not research. Required context arrives as attached artifacts. If it is missing → stop and request it; do not improvise. |

### `CHUNKING` — granularity of one assignment

| Variant | Contract |
| --- | --- |
| `whole-feature` | One assignment = one cohesive feature end to end, including exploration, cross-module edits, tests, and focused docs. |
| `slice` | One assignment = related files plus their tests, cut at an acceptance or architectural boundary — never by file or layer. |
| `micro-slice` | One assignment = one narrow, explicitly bounded change with a stated acceptance check and named target files. |
| `n/a` | No implementation decomposition applies. |

Consumer-facing for the `planner` (§2.3): it describes the assignment the *executor*
receives, so it follows the executor's tier.

### `VERIFY` — who tests, who gates

| Variant | Contract |
| --- | --- |
| `self` | The agent runs the relevant tests/lints for its own change and reports the evidence. |
| `self-then-tester` | The agent runs a narrow smoke check; `tester` runs the affected suites. |
| `external-only` | The agent must not judge its own work. `tester` and `verifier` do. |
| `gate-only` | The agent does not test; it runs the final `verifier` acceptance gate and remediates gaps. |
| `none` | No verification stage (answer/clarify work). |

### `ARTIFACT` — artifact obligations

`optional` · `read-required` · `publish-required` · `read+publish`.

`publish-required` is only selectable for personas with `can_publish_artifacts=True`
(`architect`, `planner`, `librarian`, `codebase-analyst`, `docs-writer`). Selecting it
elsewhere is a spec error.

### `OUTPUT` — report shape

| Variant | Contract |
| --- | --- |
| `narrative` | Prose summary of what was found or done. |
| `structured` | Fixed headings: what changed · evidence · residual risk · follow-ups. |
| `strict-schema` | A fixed machine-checkable schema (e.g. verifier `PASS`/`GAPS`). No free-form additions. |

Consumer-facing for the `planner` (§2.3): the report *is* the plan the executor reads, so its
shape follows the executor's tier.

### `BUDGET` — fan-out / depth / iteration ceilings

| Variant | Contract |
| --- | --- |
| `tight` | ≤1 delegation wave, ≤2 concurrent children, ≤3 remediation iterations. |
| `normal` | ≤3 waves, ≤4 concurrent children, standard depth. |
| `wide` | Up to system ceilings (6 concurrent / 20 total / depth 3). |

---

## 4. Matrices

Cell notation for §4.1–4.2: **`ROUTE / RESEARCH / CHUNKING / VERIFY / BUDGET`**.
Slots omitted from the notation are taken from the persona defaults line.

### 4.1 `orchestrator`

Axis = implementation-owner tier (§2.3). Defaults: `AUTONOMY=full`,
`ARTIFACT=read-required`, `OUTPUT=structured`.

| Intent | owner = `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `explicit_trivial` | `direct` / `self` / `micro-slice` / `self` / `tight` — orchestrator holds direct write tools for this intent; do it inline | ← tier-invariant | ← tier-invariant |
| `single_file_change` | `direct` / `self` / `micro-slice` / `self` / `tight` — inline | ← tier-invariant | ← tier-invariant |
| `question` | `answer-only` / `delegate-required` / `n/a` / `none` / `tight` | ← tier-invariant | ← tier-invariant |
| `exploration` | `answer-only` / `delegate-required` / `n/a` / `none` / `normal` | ← tier-invariant | ← tier-invariant |
| `ambiguous` | `requirements-first` / `delegate-required` / `n/a` / `none` / `tight` | ← tier-invariant | ← tier-invariant |
| `requirements` | `requirements-first` / `delegate-required` / `n/a` / `gate-only` / `tight` | ← tier-invariant | ← tier-invariant |
| `problem_resolution` | `research-then-code` / `delegate-required` / `micro-slice` / `self-then-tester` / `normal` | `direct` / `self-then-delegate` / `slice` / `self-then-tester` / `normal` | `direct` / `self` / `slice` / `gate-only` / `tight` |
| `small_feature` | `research-then-code` / `delegate-required` / `micro-slice` / `self-then-tester` / `normal` | `direct` / `self-then-delegate` / `slice` / `gate-only` / `tight` | **`direct` / `self` / `whole-feature` / `gate-only` / `tight`** |
| `moderate_feature` | **`plan-first` / `artifact-required` / `micro-slice` / `self-then-tester` / `wide`** | `plan-first` / `delegate-required` / `slice` / `gate-only` / `normal` | `direct` / `self` / `whole-feature` / `gate-only` / `normal` |
| `large_feature` | `design-first` / `artifact-required` / `micro-slice` / `self-then-tester` / `wide` | `plan-first` / `delegate-required` / `slice` / `self-then-tester` / `wide` | `plan-first` / `self-then-delegate` / `whole-feature` / `gate-only` / `normal` |
| `refactor` | `research-then-code` / `delegate-required` / `micro-slice` / `self-then-tester` / `normal` | `research-then-code` / `self-then-delegate` / `slice` / `self-then-tester` / `normal` | `direct` / `self` / `whole-feature` / `gate-only` / `tight` |
| `architectural` | `design-first` / `artifact-required` / `micro-slice` / `self-then-tester` / `wide` | `design-first` / `delegate-required` / `slice` / `self-then-tester` / `normal` | `design-first` / `self-then-delegate` / `whole-feature` / `gate-only` / `normal` |
| `whole_project` | `design-first` / `artifact-required` / `micro-slice` / `self-then-tester` / `wide` | `design-first` / `delegate-required` / `slice` / `self-then-tester` / `wide` | `plan-first` / `self-then-delegate` / `slice` / `self-then-tester` / `wide` |

The two bolded cells are the scenarios in §1.

`artifact-required` on the orchestrator means: the research wave must end in a **published
artifact** (`librarian` / `codebase-analyst` / `planner` all have `can_publish_artifacts`),
and every downstream implementation delegation must attach it via `attach_artifacts`. The
orchestrator does not paraphrase findings into the task description.

### 4.2 `coding-agent`

Axis = own tier. Defaults: `ARTIFACT=read-required`, `OUTPUT=structured`.
Cell notation here: **`AUTONOMY / RESEARCH / CHUNKING / VERIFY / BUDGET`**.

| Intent | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `explicit_trivial` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self` / `micro-slice` / `self` / `tight` | `full` / `self` / `micro-slice` / `self` / `tight` |
| `single_file_change` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self` / `micro-slice` / `self` / `tight` | `full` / `self` / `micro-slice` / `self` / `tight` |
| `problem_resolution` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self` / `slice` / `self` / `normal` | `full` / `self` / `slice` / `self` / `normal` |
| `small_feature` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self-then-delegate` / `slice` / `self` / `normal` | **`full` / `self` / `whole-feature` / `self` / `normal`** |
| `moderate_feature` | **`strict` / `artifact-required` / `micro-slice` / `external-only` / `tight`** | `bounded` / `self-then-delegate` / `slice` / `self` / `normal` | `full` / `self-then-delegate` / `whole-feature` / `self` / `normal` |
| `large_feature` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `artifact-required` / `slice` / `self-then-tester` / `normal` | `full` / `self-then-delegate` / `whole-feature` / `self-then-tester` / `normal` |
| `refactor` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self` / `slice` / `self` / `normal` | `full` / `self` / `slice` / `self` / `normal` |
| `architectural` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `artifact-required` / `slice` / `self` / `normal` | `bounded` / `artifact-required` / `whole-feature` / `self` / `normal` |
| `whole_project` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `artifact-required` / `slice` / `self-then-tester` / `normal` |
| `question`, `exploration`, `requirements`, `ambiguous` | not routed to `coding-agent` | ← | ← |

Notes:

- `architectural` caps autonomy at `bounded` even at `large_model`: the design belongs to the
  `architect` artifact, not to the implementer.
- `large_model` + `self` explicitly grants the agent the right to decide whether to spawn a
  `codebase-analyst` or explore inline — it is not required to do either.
- `external-only` at `small_model` is what makes chunking safe: a strict executor that also
  self-certifies is the main failure mode of small models.
- "not routed" cells still resolve if the orchestrator delegates anyway; fall back to
  `bounded` / `self` / `micro-slice` / `self` / `tight`.

### 4.3 Remaining personas

Keyed on own tier, tabulated by intent group (§2.1). `—` = the persona is not routed for
that group.

#### `planner`

Defaults: `ROUTE=research-then-code` (its own research delegation), `ARTIFACT=read+publish`.

Two axes (§2.3): `AUTONOMY` / `RESEARCH` / `BUDGET` read off the planner's own column;
`CHUNKING` / `OUTPUT` read off the **implementation owner's** column of this same table,
whenever that owner ranks lower.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-answer`, `G-micro` | — | — | — |
| `G-clarify` | `strict` / `delegate-required` / `n/a` / `strict-schema` / `tight` | `bounded` / `delegate-required` / `n/a` / `structured` / `tight` | `bounded` / `self-then-delegate` / `n/a` / `structured` / `tight` |
| `G-fix` | `strict` / `delegate-required` / `micro-slice` / `strict-schema` / `tight` | `bounded` / `self-then-delegate` / `slice` / `structured` / `normal` | `full` / `self-then-delegate` / `slice` / `structured` / `normal` |
| `G-build-s` | `strict` / `delegate-required` / `micro-slice` / `strict-schema` / `tight` | — (orchestrator goes `direct`) | — |
| `G-build-m` | `strict` / `delegate-required` / `micro-slice` / `strict-schema` / `normal` | `bounded` / `self-then-delegate` / `slice` / `structured` / `normal` | `full` / `self-then-delegate` / `whole-feature` / `structured` / `normal` |
| `G-build-l` | `strict` / `artifact-required` / `micro-slice` / `strict-schema` / `normal` | `bounded` / `delegate-required` / `slice` / `structured` / `wide` | `full` / `self-then-delegate` / `slice` / `structured` / `wide` |

`OUTPUT` column here replaces `VERIFY` (the planner never verifies). `micro-slice` +
`strict-schema` together are the *implementation contract* shape — ordered steps, named target
files, one executable acceptance check per step, plus the escalation condition the planner
prompt requires per task. That shape is selected by the **executor's** tier, because it is the
executor that needs it: a `large_model` planner writing for a `small_model` coding-agent still
owes it micro-slices, while keeping `full` autonomy and its own research judgement for the act
of planning. Reading `micro-slice` off the planner's own column instead would size the
contract for the wrong agent — the planner is not the one executing it.

#### `architect`

Defaults: `ARTIFACT=publish-required`, `CHUNKING=n/a`, `VERIFY=none`.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-answer` | `strict` / `delegate-required` / `strict-schema` / `tight` | `bounded` / `self-then-delegate` / `structured` / `tight` | `full` / `self-then-delegate` / `structured` / `tight` |
| `G-build-l`, `G-clarify` | `strict` / `artifact-required` / `strict-schema` / `tight` | `bounded` / `delegate-required` / `structured` / `normal` | `full` / `self-then-delegate` / `structured` / `normal` |
| others | — | — | — |

Notation: `AUTONOMY / RESEARCH / OUTPUT / BUDGET`.

#### `tester`

Defaults: `ARTIFACT=read-required`, `VERIFY=self`.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-micro`, `G-fix` | `strict` / `artifact-required` / `micro-slice` / `strict-schema` | `bounded` / `self` / `slice` / `structured` | `full` / `self` / `slice` / `structured` |
| `G-build-s`, `G-build-m` | `strict` / `artifact-required` / `micro-slice` / `strict-schema` | `bounded` / `self` / `slice` / `structured` | `full` / `self` / `whole-feature` / `structured` |
| `G-build-l` | `strict` / `artifact-required` / `micro-slice` / `strict-schema` | `bounded` / `artifact-required` / `slice` / `structured` | `full` / `self-then-delegate` / `whole-feature` / `structured` |
| `G-answer`, `G-clarify` | — | — | — |

Notation: `AUTONOMY / RESEARCH / CHUNKING / OUTPUT`. A `small_model` tester is given the
suites to run; it does not choose them.

#### `verifier`

Always `OUTPUT=strict-schema` (`PASS`/`GAPS`), `VERIFY=gate-only`, `CHUNKING=n/a`,
`ARTIFACT=read-required` (no delegates, so no `ROUTE`).

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| all routed groups (`G-micro`, `G-fix`, `G-build-*`) | `strict` / `artifact-required` / `tight` — check only the enumerated acceptance criteria, report anything else as an observation | `bounded` / `self` / `normal` | `full` / `self` / `normal` — may probe beyond the stated criteria for regressions |
| `G-answer`, `G-clarify` | — | — | — |

#### `ui-verifier`

Same shape as `verifier` (`strict-schema` PASS/GAPS + screenshot evidence). Tier varies only
`RESEARCH`/`BUDGET`: `small_model` = `artifact-required` + `tight` (execute the given
interaction script); `large_model` = `self` + `normal` (derive the interaction paths itself).

#### `librarian`

Defaults: `ARTIFACT=publish-required`, `CHUNKING=n/a`, `VERIFY=none`, no delegates.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| any routed group | `strict` / `strict-schema` / `tight` — answer exactly the questions asked, one source each, publish a fixed-schema digest | `bounded` / `structured` / `normal` | `full` / `structured` / `normal` — may follow leads and flag unasked-but-material findings |

The `artifact-required` cells elsewhere in this document depend on this persona publishing:
whenever an orchestrator cell selects `artifact-required`, the research wave that feeds it
must route through `librarian` and/or `codebase-analyst` with `publish-required`.

#### `codebase-analyst`

Defaults: `ARTIFACT=publish-required`, read-only, no delegates.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| any routed group | `strict` / `strict-schema` / `tight` — one targeted question, cite `file:line`, no open-ended exploration | `bounded` / `structured` / `normal` | `full` / `structured` / `normal` — may follow call paths across modules and synthesize |

#### `docs-writer`

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-build-*`, `G-fix` | `strict` / `artifact-required` / `micro-slice` / `structured` | `bounded` / `self` / `slice` / `structured` | `full` / `self-then-delegate` / `slice` / `structured` |
| `G-clarify` | `strict` / `artifact-required` / `micro-slice` / `structured` | `bounded` / `self` / `slice` / `structured` | `full` / `self` / `slice` / `structured` |
| `G-answer`, `G-micro` | — | — | — |

#### `refactorer`

Owner for `refactor`; has no delegates, so no `ROUTE`, and `RESEARCH` is always `self` or
`artifact-required`.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-fix` (`refactor`) | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `self` / `slice` / `self` / `normal` | `full` / `self` / `whole-feature` / `self` / `normal` |
| `G-build-l` | `strict` / `artifact-required` / `micro-slice` / `external-only` / `tight` | `bounded` / `artifact-required` / `slice` / `self-then-tester` / `normal` | `bounded` / `artifact-required` / `slice` / `self` / `normal` |
| others | — | — | — |

#### `requirements-engineer`

Owner for `requirements` and the first responder for `ambiguous`.

| Group | `small_model` | `medium_model` | `large_model` |
| --- | --- | --- | --- |
| `G-clarify` | `strict` / `delegate-required` / `strict-schema` / `tight` | `bounded` / `self-then-delegate` / `structured` / `normal` | `full` / `self-then-delegate` / `structured` / `normal` |
| `G-build-m`, `G-build-l` | `strict` / `artifact-required` / `strict-schema` / `tight` | `bounded` / `delegate-required` / `structured` / `normal` | `full` / `self-then-delegate` / `structured` / `normal` |
| others | — | — | — |

`strict-schema` here means the ReqToCode frontmatter contract (`req-id`, `status`, `trace`,
`test`, `epic`, test-portfolio table) per `docs/requirements/TEMPLATE.md`.

#### `intent-classifier`

**Tier-invariant, no matrix.** It runs before classification exists, so neither axis is
defined for it. Its prompt stays a fixed `strict-schema` classifier prompt.

---

## 5. Composition and precedence

Layers, applied in order. Later layers win on conflict:

1. **Persona base prompt** — identity, mandate, hard blocks, anti-patterns, tool/MCP/delegate
   listings. Tier- and intent-independent.
2. **Persona slot defaults** — the defaults line above each matrix.
3. **Matrix cell** — persona × intent × tier.
4. **Run-level override** — the host-selected `delegation_strategy` (`swarm` / `single`),
   carried as `RUN_OVERRIDES` in `agents/playbook.py` and rendered *after* the cell so it
   visibly wins over it.
5. **Per-delegation instructions** — the task description, `inherited_context`, and
   `attach_artifacts` in the `delegate` call.

Rules:

- **Cell beats base prompt.** Every rendered cell closes by saying so explicitly, so the
  precedence is visible to the model rather than merely intended by us.
- **Hard blocks are not overridable.** Layer 1 hard blocks (never edit files as orchestrator,
  never delete failing tests, etc.) survive every later layer. A cell that would contradict a
  hard block is a spec error.
- **Tool gating is orthogonal.** `allowed_tools` in `intents.yaml` and
  `_apply_tool_restrictions` continue to govern *which tools exist*. The matrix governs
  *what the prompt says about using them*. A cell must never reference a tool the persona
  does not have in that configuration.
- **Downgrade, never upgrade, on uncertainty.** Unknown tier → `medium_model`; unknown intent
  → `ambiguous`; missing required artifact under `artifact-required` → stop and request,
  never silently fall back to `self`.
- **One variant per slot.** No cell may select two variants of the same slot or emit prose.
- **Nothing run-varying outside the playbook.** Autonomy, research policy, task sizing,
  verification ownership, artifact duties, report shape, and fan-out budget appear in exactly
  one place. A persona prompt or a section builder restating any of them is duplication, and
  will eventually contradict a cell — a `strict` executor told elsewhere to "make autonomous
  decisions" is the failure this rule exists to prevent.

---

## 6. Mapping onto the token mechanism

No new rendering engine — `agents/prompt_render.py` gained one token and lost six.

- **`[[ROTARIS:PLAYBOOK]]`** renders the resolved cell. Present in all 12 persona prompts
  (`intent-classifier` excluded — it runs before a classification exists).
- `PromptRenderContext` carries the pre-rendered `playbook` string; resolution lives in
  `agents/factory.py::resolve_playbook_for_persona`, which knows the config and therefore
  the tiers. Tier resolution reuses `_resolve_persona_model_tier` — no second implementation.
- `delegate_model_tiers` covers every delegate, so `DELEGATES_SECTION` reports each one's
  **capacity as a fact**. It deliberately carries no sizing advice: how to cut work is the
  `CHUNKING` slot. The section exists because the orchestrator's own cell is keyed on one
  tier (the implementation owner's) while its delegate list spans several.
- **Intent propagation.** `ralph/bootstrap.py::make_agent_factory` seeds `intent` (and any
  `run_override`) into the runtime kwargs of **every** spawned persona. Only the
  orchestrator-scoped tool allow-list stays keyed to `config.default_persona`.
- **Retired tokens:** `INTENT_INSTRUCTIONS`, `DELEGATION_STRATEGY`, `HARD_BLOCKS`,
  `ANTI_PATTERNS`, `WORKFLOW`, `TROUBLESHOOTING`, `CATEGORY_SKILLS`. Unknown tokens render
  literally and log a warning, so a stale reference is loud rather than silent;
  `tests/unit/test_dynamic_prompt_generation.py` locks that behaviour for each retired name.

---

## 7. Migration (completed)

| Was | Now |
| --- | --- |
| `agents/prompts/intents/*.md` (13 snippet files) | deleted; orchestrator `ROUTE` + `RESEARCH` variants |
| `intents.yaml` `instructions:` keys | removed; the file carries `allowed_tools` only (SWR-156) |
| `intent_instructions_for`, `load_intent_instruction_mapping` | deleted |
| `_CODING_DELEGATE_GUIDANCE` (+ the generic twin) | `_DELEGATE_CAPACITY`: a capacity fact, no sizing prose |
| `build_hard_blocks_section` / `build_anti_patterns_section` | persona prompt files (layer 1) |
| `build_workflow_section` / `build_troubleshooting_section` | `AUTONOMY`/`RESEARCH`/`VERIFY` variants; the troubleshooting protocol itself moved into `coding_agent.md` |
| `build_category_skills_guide` + `PromptRenderContext.categories` | deleted (unused token) |
| `_DELEGATION_STRATEGY` (mechanics **and** economy) | `_DELEGATION_MECHANICS` (mechanics only); economy is `BUDGET` / `CHUNKING` / `AUTONOMY` |
| 8 persona×family `_MODEL_INSTRUCTIONS` blocks | `_MODEL_FAMILY_STYLE` (3, authored once) + `_PERSONA_FAMILY_STYLE` (planner only) |
| orchestrator "Delegation Economy", "Completion Gate", "Artifacts instead of delegation" | `BUDGET` / `VERIFY` / `ARTIFACT` slots |
| "Session Artifact Intake" repeated in 8 prompts | `ARTIFACT` slot |
| planner "Phase 1 — Intent Classification" | deleted; the run classifier already did it |
| orchestrator "Persona Routing Matrix" | kept — situation→persona is tier-independent |
| `delegation_strategy` text appended to the intent snippet | `RUN_OVERRIDES` in `agents/playbook.py` |

**Retired requirements:** SWR-149, SWR-150, SWR-151, SWR-153 (intent-snippet machinery)
and SWR-158 (planner-first routing) were deprecated with this change and have since been
deleted from the store — see `docs/requirements/retired-ids.txt`. SWR-158 was a deliberate
behaviour change, not a cleanup: planner-first is now conditional on the implementation
owner's tier, so `moderate_feature` and `refactor` with a `large_model` owner no longer
force a planner step.

---

## 8. Worked examples

**Small feature, `coding-agent` = `large_model`.**
Orchestrator cell → `direct` / `self` / `whole-feature` / `gate-only` / `tight`: delegate once,
no research wave, no planner. Coding-agent cell → `full` / `self` / `whole-feature` / `self` /
`normal`: it decides whether to spawn `codebase-analyst`, implements across modules, writes and
runs its own tests. Orchestrator then runs `verifier` and remediates gaps. Total children: 1 + 1
(+ optional analyst the coding-agent chose).

**Moderate feature, `coding-agent` = `small_model`.**
Orchestrator cell → `plan-first` / `artifact-required` / `micro-slice` / `self-then-tester` /
`wide`: delegate `librarian` and `codebase-analyst` (`publish-required`) → `planner`
consolidates into an ordered plan artifact → orchestrator assigns each ordered micro-slice to a
`coding-agent` with the artifacts attached. The planner is `large_model`, so its own slots stay
`full` / `self-then-delegate` / `normal`, but its consumer slots follow the `small_model`
executor: `micro-slice` / `strict-schema` (§2.3). Coding-agent cell →
`strict` / `artifact-required` / `micro-slice` /
`external-only` / `tight`: execute exactly the slice, no exploration, no self-certification.
`tester` runs the affected suites; `verifier` gates.

---

## 9. Layering

`matrix.yaml` and `variants.yaml` ship inside the package and are overlaid, lowest priority
first, from a `playbooks/` sub-directory in each config scope — the same global → workspace
layering as `agents.yaml`:

```
src/rotaris_core/agents/prompts/playbooks/   # shipped defaults
~/.config/rotaris/playbooks/            # global overrides
<workspace>/.rotaris/playbooks/         # workspace overrides (highest)
```

Merging is field-wise and recursive, so an override names only the cells it changes; every
unnamed slot is inherited.

Two constraints hold the design together:

- **Re-map, don't invent.** A `variants.yaml` override may re-word a catalogued variant, but a
  new variant id or a new slot is dropped with a warning. Cells must always resolve against
  the shipped vocabulary, otherwise `BUDGET_LIMITS` and the slot renderer fall out of sync
  with the matrix.
- **A broken override never fails the run.** Unreadable or malformed override files are logged
  and skipped; the shipped defaults stand.

Loads are cached per workspace root; `reload_playbooks()` clears the cache.
