# AGENTS.md — Rotaris

Agent orientation for this repo, and the index of every other instruction file.
Keep this file short and operational; anything stated here is not restated
elsewhere.

Scoped instructions — each owns its area and is not duplicated here:

| File | Owns |
| --- | --- |
| [tests/AGENTS.md](tests/AGENTS.md) | test locations, fixtures, mock patterns, annotations, orphan-test rule |
| [apps/rotaris/AGENTS.md](apps/rotaris/AGENTS.md) | Rotaris desktop UX, accessibility, and Qt test standards |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot entry point (pointer + ReqToCode kernel) |

Canonical policy docs: [test_strategy.md](docs/testing/test_strategy.md) (testing
policy), [textualize_testing_guide.md](docs/testing/textualize_testing_guide.md)
(Textual interaction rules), [requirements/README.md](docs/requirements/README.md)
(requirement store format), [reqtocode-playbook.md](docs/reference/reqtocode-playbook.md)
(ReqToCode runbook), [terminology-glossary.md](docs/terminology-glossary.md).
For architecture detail start at [docs/architecture.md](docs/architecture.md),
especially [02-code-topology.md](docs/architecture/02-code-topology.md) and
[14-e2e-trace.md](docs/architecture/14-e2e-trace.md).

## Naming

The product is **Rotaris**. There is no other product name; `geraet-ai` is the
retired one and must not appear in new code, docs, or user-visible strings.
Three surfaces share the name, and each has exactly one spelling:

| Surface | Distribution | Import package | Entry point |
| --- | --- | --- | --- |
| Rotaris desktop (primary UI) | `rotaris` | `rotaris` (`apps/rotaris/src/`) | `rotaris` |
| Rotaris engine (backend) | `rotaris-core` | `rotaris_core` (`src/`) | `rotaris-cli`, `rotaris-headless` |
| Rotaris TUI (secondary UI) | part of `rotaris-core` | `rotaris_core.tui` | `rotaris-cli run` |

State and identifiers follow from that: `<workspace>/.rotaris/`,
`~/.config/rotaris/`, `~/.local/share/rotaris/`, session worktree branches
`rotaris/session/<id>`, prompt placeholders `[[ROTARIS:TOKEN]]`, and classes
prefixed `Rotaris…` (`RotarisConfig`, `RotarisTuiApp`, `RotarisDelegateTool`).

Four pre-rename strings are deliberately frozen because they are wire or
identity values owned by systems outside this repo: the OAuth `CLIENT_ID`
`"geraet-ai"`, the `"geraet-cloud"` provider alias, `feedback.geraet.ai`, and
the `github.com/theUpsider/geraet-ai` remote. Do not "fix" them.

## Architecture map

The code lives under `src/rotaris_core/`. The **Rotaris** desktop app (`apps/rotaris/`, PySide6) is the **primary** user interface; the Textual TUI is **secondary** — keep it working, but Rotaris takes priority (see `apps/rotaris/AGENTS.md`).

- `cli/`: CLI entry points, including interactive startup and `cli/background.py`
- `tui/`: Textual UI (secondary interface); `tui/app.py` is the stable `RotarisTuiApp` facade
- `ralph/`, `orchestrator/`, `improvement/`: run loop, scheduling, child lifecycle, delegation, improvement flow
- `agents/`: persona construction, prompts, tool wiring, agent-facing helpers
- `tools/`: concrete tool implementations exposed to agents
- `config/`: layered config loading, validation, MCP discovery/resolution
- `session/`: session snapshots, persistence, locking
- `haet/`: hash-anchored edit engine
- `auth/`, `providers/`, `models/`: auth, provider integration, model selection
- `core/`, `tracking/`, `mcp/`: shared runtime support, tracking, MCP shims
- `api/`: prompt/API-facing helpers

Runtime shape:

```text
Interactive CLI -> RotarisTuiApp -> MainScreen -> TuiRunController -> TuiRalphLoop
Background CLI  -> cli/background.py -> SessionManager + RalphLoop

RalphLoop -> Scheduler -> ChildManager -> asyncio.to_thread(LocalConversation.run)
```

## Rules that matter

### Runtime and orchestration

- `LocalConversation.run()` is synchronous OpenHands SDK code. Run it via `asyncio.to_thread`.
- Call `record.transition(new_state)`. Do not assign `record.state` directly.
- Pause conversations via `pause_with_daemon()` (`orchestrator/scheduler_conversation.py`), never `conversation.pause()` inline — a sync call from inside the conversation's own run-loop risks it waiting on itself.
- Never re-override `RalphLoop._run_iteration`; add a `RalphIterationObserver` hook instead.

### Imports and boundaries

- Use lazy imports in widely imported modules.
- Keep heavy imports inside functions or behind `TYPE_CHECKING`.
- Do not use `from rotaris_core import X` at module scope inside submodules.
- Keep `scheduler`, `child_manager`, and `delegate_tool` cross-imports local to functions.
- Keep `tui/app.py` thin; put behavior in helper modules unless the facade contract changes.

### Agents and tools

- `agents/factory.py` is the source of truth for persona construction and friendly tool names.
- `TOOL_NAME_MAP` in `agents/factory.py` is authoritative.
- `create_agent_for_persona()` returns a factory, not an instantiated agent.
- Personas exposing `"delegate"` use closure-based factories over `runtime_kwargs`; do not try to serialize that wiring.
- MCP servers belong under `mcp_servers:` in `agents.yaml`, not under `tools:`.
- Unavailable MCP servers are filtered at runtime and surfaced in the TUI.

Adding a tool: create `tools/my_tool.py` with `MyTool(ToolDefinition)` +
`MyToolExecutor`, map the friendly name to the SDK class name in
`agents/factory.py::TOOL_NAME_MAP`, re-export from `tools/__init__.py`, then
reference it by friendly name in the persona config `tools:` list.

### Config and persistence

- Config precedence is `~/.config/rotaris/` < `<workspace>/.rotaris/`.
- Config merges are field-wise overlays; list and dict fields replace rather than deep-merge.
- Keep `api_key` values as `SecretStr` and out of normal dumps.
- New `SessionState` fields need defaults for backward compatibility.
- Bump `SESSION_SCHEMA_VERSION` only for breaking snapshot changes.
- Sessions live under `<workspace>/.rotaris/sessions/<session_id>/` and writes must stay atomic.

### User-facing behavior and docs

- Surface user-visible errors with `self.notify(...)` at the correct severity.
- Bump `pyproject.toml` after every bug fix or feature addition.
- New or materially changed tests and product requirements follow the
  [Product-Centred Test Strategy](docs/testing/test_strategy.md): state productive
  use, model the unit/integration/E2E portfolio, and preserve a hermetic public-boundary
  user flow for every product SWR.

## Workflow — worktree, merge, verify, fix forward

**Every feature runs in its own worktree, on its own branch off `master` —
small, medium, or large.** A feature is anything that carries a requirement id
or changes behavior beyond a one-liner. Quick fixes may land directly on
`master` in the main checkout: a typo, a one-line fix, a doc tweak, a lint nit,
repairing the checkout, resolving a merge, editing this workflow.

The size of the change decides whether it gets a workspace, not the ceremony
around it. When in doubt — worktree. Sessions here run in parallel, so a branch
switch in the shared checkout is never private.

**The order is: implement → fast gate → merge → verify → fix forward.** An agent
merges its own finished work into `master` without asking anyone, resolving
conflicts so that both sides keep working, and *then* runs the long suites on
the merged result. Whatever they turn up ships as a small, short-lived
`fix/…` branch (§ 5). This is deliberate: the multi-minute suites are not
allowed to hold the next slice hostage, and no step here waits on a human.

### 1. Pick the workspace

**Worktree (default).** One worktree per feature, carrying that feature's
branch. The main checkout is shared — a live Rotaris session's agents write
uncommitted changes into it, parallel agents collide in one tree, and a
`checkout` in one session yanks the files out from under another. A worktree
gives the feature its own tree and its own branch while the main checkout stays
on whatever branch it already had.

Where the worktree comes from depends on which harness you are. Each harness
owns exactly one area, and none of them may write into another's:

| You are | Your worktree |
| --- | --- |
| an agent inside a Rotaris session | You are **already** in one: `.rotaris/worktrees/<session-id>`, branch `rotaris/session/<session-id>`, cut from the base checkout's current branch by `GitWorktreeService` (`rotaris … --isolate`). Work there. Do not create another, and do not `git checkout` — the harness owns this tree. |
| Claude Code | `.claude/worktrees/<name>` — mechanics in [CLAUDE.md](CLAUDE.md#worktrees-in-claude-code-sessions). |
| any other agent, or a background job that cannot change directory | `rtk git worktree add .tmp_wt/<name> -b <type>/<swr-id>-<slug> origin/master` |

Branches are `feat/…`, `fix/…`, or `chore/…` plus the requirement id when there
is one. Keep every worktree **inside** the repo — `.rotaris/worktrees/`,
`.claude/worktrees/` and `.tmp_wt/` are all gitignored, and untracked local
config is still found by walking up from there.

**`master` is checked out in the main repo root and nowhere else.** Never
`git worktree add … master`, never `git checkout master` inside a worktree, and
never cut a worktree whose branch *is* `master`. Every worktree carries a
`feat/…`, `fix/…`, `chore/…`, epic, or session branch. One tree owning `master`
is what keeps parallel runs from colliding: git only refuses a second checkout
of `master` while the first is on it, so the moment the main checkout sits on a
feature branch, a second tree can grab `master` and two sessions then merge into
two different working copies of the same branch. If you find `master` checked
out somewhere other than the repo root, that is a defect — move that tree off it
(`git checkout -b …` or remove the worktree) before doing anything else.

Then give the worktree its own environment, once, before any test:

```bash
uv sync --all-packages       # ~25 s, ~1.2 GB, wheels come from the uv cache
```

That is what makes worktrees safe here: after it, `uv run` resolves
`rotaris_core` and `rotaris` to *this* worktree's `src`, not the main
checkout's.

**Branch in the main checkout (exception).** For a human-driven or Claude Code
session only — an agent inside a Rotaris session never takes it, since the
harness already gave it a tree. And only when nothing else is running in the
checkout and the work needs untracked state that lives only there — `.rotaris/`
(`agents.yaml`, `secrets.yaml`, sessions), a populated `.serena/`, a Rotaris run
driven from the workspace root:

```bash
rtk git checkout master            # in the main repo root — the only tree that
                                   # may sit on master (see the rule above)
rtk git checkout -b <type>/<swr-id>-<slug>
```

Check `rtk git worktree list` and `rtk git status` first; if a session owns the
checkout, take a worktree instead. To run Rotaris itself from a worktree, copy
the workspace config over rather than switching back:

```bash
mkdir -p .rotaris && cp "$(rtk proxy git rev-parse --path-format=absolute \
  --git-common-dir)/../.rotaris/agents.yaml" .rotaris/
```

### 2. Implement completely, on the branch

1. Implement the requirement **completely**: production code, `@traces`/`@verifies`
   annotations, and the full test portfolio the requirement's table declares.
2. While implementing, run **only the focused tests for the slice in hand** —
   the node ids, files, or `-k` selection covering it — and iterate there. The
   full suite is a single pass on the merged result (§ 5), not an iteration loop
   ([policy](docs/testing/test_strategy.md#focused-during-development-full-suite-as-the-final-pass)).
3. In a worktree: always `uv run …`, never a bare `python`/`pytest`. An
   inherited `VIRTUAL_ENV` still points at the main checkout's `.venv`, whose
   editable install resolves `rotaris_core` to the **main checkout's** `src` —
   tests then silently exercise code you did not write. `uv run` ignores it
   (it says so in a warning) and uses the worktree's own `.venv` from step 1.
   Prove it once per worktree:

   ```bash
   uv run python -c "import rotaris_core; print(rotaris_core.__file__)"
   ```
4. Stage explicit paths. Never `git add -A`: `snapshot_report.html` is tracked
   and rewritten by every test run. Never `git stash` — the stash stack is shared
   across all worktrees, so a `pop` can restore a sibling's work into your tree.

### 3. Fast gate on the branch — seconds, not minutes

Once the slice is complete and committed, run **only the gates that finish in
seconds** — exact invocations in [Commands](#commands):

ReqToCode `check` → `ruff format` + `ruff check` → the focused tests for the
slice you just wrote.

`mypy` and the two pytest suites deliberately do **not** run here. They run on
`master`, after the merge, in § 5. A multi-minute suite in front of the merge
blocks the next slice and catches nothing a post-merge run does not.

### 4. Merge into `master` yourself — no review, no waiting

**Merging is the agent's job, not a human's.** With § 3 green and the branch
fully committed, integrate it. Do not wait for approval, a review, or a full
suite.

First bring `master` into the branch, inside your own worktree — that is where
conflicts get resolved, with the worktree's own environment behind you:

```bash
rtk git fetch origin
rtk git merge master               # in your worktree, on your branch
```

**Resolve conflicts by keeping both sides' behavior.** A conflict is two
features meeting, not a vote between them: read both sides, then write the
version that does both jobs. Taking `--ours` over a whole file, deleting a
sibling's feature, or reverting a hunk to make the markers go away are all
wrong — the sibling merged tested, working behavior, and you are its only
guard. If two behaviors genuinely cannot coexist, keep both code paths alive
and say so plainly in your report.

- `swr.py` conflicts are expected when both sides added ids: take the incoming
  file, re-run `reqtocode check --fix`, commit the regenerated result.
- Requirement docs and epic indices: keep **both** ids, never drop the incoming
  one to make `diff --strict` quiet.

Then merge to `master` **in the main repo root** — the one tree allowed to hold
`master` (§ 1). There is no second place to do this:

```bash
rtk git status                     # untracked or uncommitted work you did not
                                   # create? Leave it alone — a live session may
                                   # own it, and never `git stash` it away.
rtk git checkout master            # only ever run in the main repo root
rtk git merge --no-ff <branch> -m "<type>: <summary> (SWR-<n>)"
```

If the main checkout is busy — a live session owns it, or it sits on a branch
whose owner still needs it — do **not** spin up a scratch worktree on `master`.
Two trees on `master` is exactly the collision § 1 forbids. Instead, update the
`master` ref without checking it out anywhere, from your own worktree:

```bash
rtk proxy git push . <branch>:master   # fast-forward only; refuses otherwise
```

This is safe precisely because you just merged `master` into `<branch>` above,
so `master` is an ancestor and the update is a fast-forward. If git refuses,
`master` moved underneath you: `rtk git fetch origin && rtk git merge master` in
your worktree again, then retry. It costs the `--no-ff` merge commit, so prefer
the main checkout whenever it is free; when it is not, a fast-forwarded `master`
beats a second tree owning the branch.

**Keep the feature branch and its worktree until § 5 is green.** That worktree
now holds the same tree as `master` and already has a synced `.venv`, which
makes it the cheapest place to run the full pass. Never merge from inside the
worktree that holds the branch. Push only when asked. Epic units merge into the
epic integration branch, not `master`; only the epic branch merges into
`master`.

### 5. Verify on `master`, then fix forward on a bugfix branch

Now run the full pass — `mypy` (both packages) → unit + integration pytest →
Rotaris desktop pytest — against the tree that actually landed. Two places
qualify, pick whichever your harness already stands in:

- **the tree you merged from**, sitting on `master` with the merge in it — the
  main checkout normally, and the simplest choice when the merge went there;
- **the feature worktree you kept**, whose tree equals `master` and whose
  `.venv` is already synced. If `master` moved between your `git merge master`
  and your merge, re-run `rtk git merge master` there first.

**Green** → the branch is spent:

```bash
rtk git branch -d <branch>         # -d, not -D: it refuses if the merge failed
rtk git worktree remove <worktree-path>            # ~15 s
```

- `git worktree remove` refusing means uncommitted work is still in the tree.
  Look at it before deciding; do not reach for `--force` to make it quiet.
- `git worktree remove` failing with `Permission denied` is different: Windows
  still holds handles inside the worktree's `.venv`. Nothing is at stake there —
  `rm -rf <path> && rtk git worktree prune` finishes the job.
- `rtk git worktree repair` silently degrades to `git worktree list` — it exits 0
  printing a listing, having repaired nothing. Use `rtk proxy git worktree repair
  <path>`, which bypasses the filter and does the real work.

**Red** → do not revert, do not stop, and do not re-open the feature branch.
Ship the fix on a short-lived bugfix branch cut from the merged tree, so the
next slice starts while this one settles:

```bash
rtk git checkout -b fix/<swr-id>-<slug>            # in the tree you verified in
# …fix, then re-run only the tests that were red…
rtk git commit -m "fix: <what broke> (SWR-<n>)"
# …merge into master exactly as in § 4, then…
rtk git branch -d fix/<swr-id>-<slug>
```

- One bugfix branch per failure cluster; minutes long, not hours. It carries no
  requirement of its own unless the fix adds behavior — then it is a feature and
  takes the full § 2 treatment.
- Cutting it in the main checkout takes that tree off `master` for as long as it
  lives, which is fine for a few minutes and wrong for anything longer. If a
  sibling may need to merge meanwhile, cut it in your own worktree instead.
- Re-run only what was red plus the suite it lives in. The next full pass is the
  one after the next merge.
- A test that already fails on the commit before your merge is **not** your
  breakage: check it there before branching, then say so instead of fixing it.
- Last resort only, if the merge broke behavior you cannot repair in one short
  branch: `rtk git revert -m 1 <merge-commit>` on `master`, keep your branch,
  and state in your report that `master` no longer carries the feature.

### Done means done

**Do not stop early.** Work is finished when *all three* hold: the
[Product-Centred Test Strategy](docs/testing/test_strategy.md) portfolio for the
requirement is written and passing (unit + integration + a hermetic
public-boundary user flow), ReqToCode is clean (`check` green, requirement
`status: approved`, epic index updated), and the branch is **merged into
`master`** with the § 5 pass green — every failure it found either fixed
forward or shown to pre-date the merge. A partial implementation, a missing E2E
flow, an unresolved trace, an unmerged branch, or a red `master` left behind is
not done — keep going until it is, or state plainly what is blocked and why.

## Critical rules — ReqToCode (enforced, build-breaking)

**No orphan code, bidirectional or bust.** ALL production code and ALL tests trace to a requirement: implementations carry `@traces(SWR.SWR_<n>)`, tests carry `@verifies(SWR.SWR_<n>)` (`from rotaris_core.reqtocode import SWR, traces, verifies`). Code with no requirement is spec drift. Supplementary code (helpers, plumbing, refactors) with no product requirement → author a **technical requirement** (`type: technical`, `derived-from: SWR-<origin>`) and mirror the `Derived requirements:` link back on the origin. Full workflow: [.github/copilot-instructions.md](.github/copilot-instructions.md) and [docs/requirements/README.md](docs/requirements/README.md).

- Enforced by verifier, `tests/unit/reqtocode/` meta-tests, and CI. A broken trace is a broken build.
- After any edit under `docs/requirements/`, run `python -m rotaris_core.reqtocode diff` **first** — it lists the exact `@traces`/`@verifies` sites to update (`check` misses text-only edits; `diff --strict` gates them). Then `check --fix` → `check` → loop tests green.
- Every production module under `src/rotaris_core/` and `apps/rotaris/src/` needs ≥1 `@traces()` or an explicit `# reqtocode: exempt` (`__init__.py` + generated `swr.py` auto-excused). Orphan-test rule in [tests/AGENTS.md](tests/AGENTS.md).
- Implementing a requirement → set `status: approved` in its frontmatter in the same change + update epic index. Commit requirement docs + `swr.py` + code + tests as one unit, req id in the message.
- **Never** silence a violation by deleting annotations, weakening a requirement, or adding baseline entries (`orphan-baseline.txt` / `traceability-baseline.txt` are shrink-only). Never reuse/renumber an `SWR-<n>` id. On any ReqToCode failure: [docs/reference/reqtocode-playbook.md](docs/reference/reqtocode-playbook.md).

## Commands

All commands use `uv run` (cross-platform: Linux and Windows) — never activate
`.venv`, call `.venv/bin/*`, or invoke bare `pytest`/`ruff`/`mypy`. `make` targets
(`make test`, `make lint`, …) are thin aliases over the same commands but require
`make`, which Windows lacks — prefer the `uv run` forms below.

```bash
uv sync --all-packages                # setup (apps/rotaris is a uv workspace member)
# ── Focused (default while implementing a slice) ──
uv run pytest tests/unit/test_module.py -q --timeout=30                  # one file
uv run pytest tests/unit/test_module.py::test_name -q --timeout=30       # one test
uv run pytest tests/unit/ tests/integration/ -k "expr" -q --timeout=30   # by name
uv run pytest --lf -q --timeout=30                                       # last failures
# ── Full pass (post-merge, on the merged tree — Workflow § 5) — always parallel ──
uv run pytest -q --timeout=120 -n auto   # full suite, 6225 tests (= make test)
uv run pytest tests/unit/ -n auto -q --timeout=120         # unit only
uv run pytest tests/integration/ -n auto -q --timeout=120  # integration/e2e only
# desktop (= make test-rotaris), 1462 tests: parallel pass, then the serial ones
uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -n auto -m "not serial"
uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -m serial
# Coverage, lint, format, typecheck —
uv run pytest --cov=rotaris_core --cov-report=term-missing                     # coverage (= make test-cov)
uv run ruff check src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'    # lint (= make lint)
uv run ruff format src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'   # format (= make format)
uv run mypy src/rotaris_core/ && uv run mypy apps/rotaris/src/rotaris/          # typecheck strict (= make typecheck)
uv run python -m rotaris_core.reqtocode check --fix                             # reqtocode fix (= make reqtocode-fix)
uv run python -m rotaris .            # run desktop app (--demo for demo data)
# ── The one test that talks to a real provider — never part of a pass above ──
uv run pytest tests/live -m live -q --timeout=900   # ~40s, costs money (= make test-live)
```

### The live run (`tests/live`)

One test, one real model, one real run: the orchestrator delegates to the
codebase-analyst, which reads a file and reports a token that exists nowhere but
in that file. It is the only check in this repository that a real model actually
drives a Rotaris run — every other test fakes the provider, and a fake answers
the way its author assumed it would.

It never joins a normal pass. Collection skips it unless the run **asked for it
by name** (`tests/live` in the arguments, `-m live`, or `-k live`), and skips it
again if no key is readable from the environment or from `.env.live`
(gitignored — copy `.env.live.example`). A key that is present but *rejected*
fails rather than skips.

### What a full pass actually costs

Budget **5–7 minutes for the engine suite and about 10 for the desktop one**, on
an 8-core laptop, measured 2026-08-22. That is the number to plan against; the
older ~150s and 67s figures were measured against a much smaller suite and are
gone. Wall time swings by up to 50% between identical runs on the same commit —
thermal state, not your change — so re-measure before quoting a number rather
than repeating one.

Both suites take `--dist loadfile` from `addopts`, so a worker gets whole files
rather than individual tests. The reasoning is in `pyproject.toml` next to the
setting; do not override it with `--dist load` to chase a faster number.

`-n auto` is **physical** cores — xdist asks psutil, which both packages declare
for that reason. Do not substitute a literal `-n 16`: it is right on one machine
and oversubscribed on the next, and the sandboxed-terminal tests are the first
to fail when it is. Mark a test `@pytest.mark.serial` when it needs a core to
itself. Never `-x` on a parallel pass — the first failure would hide every other
result.

**Judge a red run against the baseline, not against zero.** A handful of tests
here fail intermittently under load without any change to the code
(`docs/testing/flaky-quarantine.md` names the ones already triaged), and at
least one flips on machine state rather than on anything in the tree. Before
attributing a failure to your change, re-run that node id alone; if it fails on
the commit before yours too, say so instead of fixing it.

- ruff, mypy (`strict`), line length, target version: configured in `pyproject.toml` (source of truth).
- HAET edit engine, playbook prompt matrix, session persistence/diagnostics internals: [02-code-topology.md](docs/architecture/02-code-topology.md), [prompt-composition-matrix.md](docs/architecture/prompt-composition-matrix.md), [1500-sessions-diagnostics.md](docs/requirements/1500-sessions-diagnostics.md).

## OpenHands SDK

When touching SDK-adjacent code, verify current OpenHands SDK docs. Main integration points are `Agent`, `AgentContext`, `LLM`, `LocalConversation`, and the tool registry.
