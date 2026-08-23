# Worker prompt template

Fill every `<placeholder>`. Workers cannot ask questions, cannot see each other, and start
with no context — anything omitted is a defect they will invent an answer to.

Keep the section order: goal → branch setup → what already exists → this unit → conventions
→ gates → e2e recipe → worker instructions. Workers skim, and this order front-loads what
stops them going wrong.

---

```markdown
# Overall goal

Implement epic <SWR-nnnn> "<epic title>" in the Rotaris repo (Python, `src/rotaris_core/`,
plus the PySide6 desktop app **Rotaris** at `apps/rotaris/`). Spec:
`docs/requirements/<epic file>.md` — **read it first**, especially <the relevant SWRs>.
The epic is split across <N> units; you own **Unit <Un>** only. Do not implement other
units' scope.

# FIRST COMMANDS — base your work on the epic integration branch

Your worktree branches from `master`, which does NOT contain the work you depend on.

```bash
git fetch origin
git reset --hard origin/epic/swr-<n>
uv sync --all-packages
```

All PRs target `epic/swr-<n>`, never `master`: `gh pr create --base epic/swr-<n> ...`

**`git stash` is BANNED.** Worktrees share one `.git`, so the stash stack is global across
all parallel agents; one agent's `git stash pop` has already restored a sibling's
uncommitted work into the wrong worktree. Never run `git stash`/`pop`/`drop`/`clear`. To
compare against a baseline, use `git worktree add` on a scratch path or copy files aside.

# What already exists on your base branch — call it, do not reimplement

<Exact public API of every sibling unit this one depends on: module paths, function
signatures, dataclass fields, Qt signal names and payloads, and the semantics that are not
obvious from the signature. Copy the API verbatim from the sibling's final report. If a
reference implementation exists in a test file, name it and say "read it first".>

# Your unit: <Un> — <title>

**Files you own (do not touch files outside this list):**
- <path>
- new <path>

**Change:**
<Numbered, specific. Name the file and approximate line for every edit site. For each new
module, say what it must expose, because siblings will import it.>

<Where a house pattern exists, name the file and class to follow and say why that one:
"follow `widgets/approval_dialog.py:27` exactly — it is the house pattern for a decision
modal". Where the spec cites a pattern that does not apply, say so explicitly.>

# Conventions you MUST follow

**ReqToCode (build-breaking):** `@traces(SWR.SWR_<n>)` on production code, `@verifies(SWR.SWR_<n>)`
on tests, from `rotaris_core.reqtocode`. Every production module under `src/rotaris_core/` and
`apps/rotaris/src/` needs ≥1 `@traces()` or `# reqtocode: exempt`. Every `test_*` function
needs `@verifies(...)` or it is a build-breaking orphan. **Never** add entries to any
baseline file in `docs/requirements/` — all are shrink-only. `src/rotaris_core/reqtocode/swr.py`
is GENERATED; never hand-edit. Run `uv run python -m rotaris_core.reqtocode diff` →
`check --fix` → `check`.

**DO NOT edit `docs/requirements/<epic file>.md` and DO NOT flip any `status:`.** All ids in
that file share one content hash; editing it rewrites every one of its `META` rows in the
generated `swr.py` and will conflict with sibling units. Unit <U-last> owns the document.
Implementing against a `draft` requirement is verifier-clean — the verifier only errors on
*approved without annotations*.

**Tests (`tests/AGENTS.md`):** `test_<behavior>()` plain functions, no classes. Mandatory
docstring on every new test:
```
"""Productive use: <actor> can <productive action>.
Expected outcome: <user-observable result or enabling invariant>."""
```
Module-level `pytestmark`. Prefer `monkeypatch.setattr("dotted.path", fake)` over
`unittest.mock.patch`. `asyncio_mode = "auto"`. A test that would pass without the
implementation is a red flag.

<For Rotaris units, add:>
**Rotaris (`apps/rotaris/AGENTS.md` — read it):** `models/state.py` framework-free (no Qt);
views render store state and emit intent, never mutate the store or read private backend
state; `theme.*` tokens only, no hard-coded colours; `accessibleName`/`accessibleDescription`
on every control; never convey state by colour alone; explain why a disabled action is
disabled via `set_action_availability`; explicit ready/in-progress/success/empty/
recoverable-error states; keep heavy work off the Qt event loop; programmatic shutdown and
test teardown must never trigger interactive dialogs. **Never edit `src/rotaris_core/tui/`** —
a release gate checks that tree is clean.

`apps/rotaris/tests/conftest.py` has **no shared fixtures** (only `QT_QPA_PLATFORM=offscreen`
and `sys.path`). Support modules import by bare name: `ui_query`, `a11y`, `fakes`,
`run_wiring`. **Never import a helper from another `test_*.py`** — re-implement it.

**Boundaries:** do not touch <files owned by sibling units>. Do not bump version files
(unit <U-last> owns that).

**Style:** line length 100, `py312`, ruff `E,F,I,N,W,UP,B,SIM,TCH`; mypy `strict = true`.
Use `uv run` for every Python tool; never activate `.venv` or call bare `ruff`/`mypy`.

<Include only the traps this unit can actually hit — see the table in SKILL.md.>

# Gates

Before you hand the unit over, run the **fast gate** — seconds, and it is all
that stands between you and the epic branch:

```bash
uv run python -m rotaris_core.reqtocode diff
uv run python -m rotaris_core.reqtocode check --fix && uv run python -m rotaris_core.reqtocode check
uv run ruff format src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run ruff check src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run mypy src/rotaris_core/ && uv run mypy apps/rotaris/src/rotaris/
```

# E2E test recipe

<Concrete and executable. For an MCP-backed feature:>
1. `uv sync --all-packages`.
2. Write a real FastMCP stdio stub into `tmp_path` and launch it with `sys.executable` —
   proven pattern at `tests/unit/test_mcp_tool_discovery.py:141-170` — exposing <tools> and
   recording its calls so assertions read real invocations.
3. Point a scratch workspace at it: `.mcp.json` =
   `{"mcpServers": {"<name>": {"command": <sys.executable>, "args": [<stub>]}}}`.
4. <For UI units:> drive the **real `MainWindow`** with real store/services, stubbing only
   `ConfigService._providers`, `._subscription_limits` and the LLM. Interact only through
   `apps/rotaris/tests/ui_query.py` helpers — reaching into a private method downgrades the
   test from E2E to integration.
5. Assert the user-observable chain: <the specific chain>.

<Backend-only units: say which steps to skip and give an equivalent real-seam check.>

# Worker instructions

1. **Self-review** — re-read your own diff hunk by hunk looking for correctness bugs:
   <name the failure modes this unit can actually have — a QThread outliving its window, an
   unresolved modal exit path, a gate that never lifts on the error path, resource leaks on
   the timeout path, store fields mutated without a guarded setter>. Fix what you find.
   Run the `code-review` skill on your own diff as part of this and act on what it reports.
2. **Run the fast gate** — once, before handover; fix anything you broke.
3. **Test end-to-end** — follow the recipe above.
4. **Commit and push** — verify with `git show --stat HEAD` that your commit contains only
   your own files, then `gh pr create --base epic/swr-<n>`.
   Draft anything you write to disk — a PR body, notes — under a filename carrying **your
   own unit id** (`pr-body-<unit>.md`). The scratchpad is shared by the whole wave, and a
   sibling writing the generic name overwrites you silently: no conflict, no warning, just
   another unit's text in your PR.
5. **Report** — end with a single line `PR: <url>`, or `PR: none — <reason>`. State the
   exact public API you settled on (names, signatures, signal payloads) — **later units wire
   it and cannot ask you afterwards.** Report anything you could not finish, and anything a
   later unit must clean up.

Commit subject must be one line starting with the requirement id, e.g.
`<SWR-nnnn>: <imperative summary>`. Check it with `git log -1 --format=%s`. End the message
with:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
PR body ends with:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
```

---

## Why each awkward-looking bit is there

- **The `git reset --hard origin/epic/...` first command** — the harness branches worktrees
  from `master`. Without this, wave 2+ silently builds against missing dependencies.
- **The `git stash` ban with its reason** — a ban without a reason gets rationalised around
  when an agent wants a baseline diff.
- **"State the exact public API you settled on"** — the single highest-value line in the
  template. It is what makes the next wave's prompts accurate.
- **The unit-scoped scratchpad filename** — the scratchpad directory is per *session*, not
  per agent, and losing a draft to a sibling's identically-named file produces no error at
  all. It has already happened once, mid-PR-body.
- **"Run the code-review skill"** — earlier versions of this template banned it as
  `disable-model-invocation`. That is no longer true, and it pays: in the fix wave it found
  an unguarded `release_lock` between a run and its teardown, and a session-wide counter
  that would have dropped another session's parked save.
- **Naming this unit's plausible failure modes in step 1** — a generic "review your code"
  produces a generic skim; a list of concrete failure modes produces real fixes.
- **The baseline failure count** — otherwise agents spend a long time trying to fix
  unrelated pre-existing failures, or wrongly report success as failure.
