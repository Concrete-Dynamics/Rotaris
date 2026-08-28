# devtools

Tooling for **developing** Rotaris. Nothing here is part of the Rotaris product.

| Layer | Lives in | Carries requirement ids? |
| --- | --- | --- |
| The Rotaris product | `src/rotaris_core/`, `apps/rotaris/`, specified by `docs/requirements/` | Yes — `@traces`/`@verifies`, build-breaking |
| How we build it | here, plus `AGENTS.md`, `.github/`, `docs/milestones/` | No |

Three properties make that split real rather than a claim, and all three are
asserted by tests:

1. **ReqToCode never sees this directory.** `devtools/` is outside the verifier's
   `impl_roots` (`src/rotaris_core`, `apps/rotaris/src`) and `test_roots`
   (`tests`, `apps/rotaris/tests`), so nothing here needs a `@traces`, and
   nothing here is reported as an orphan.
2. **Nothing here ships.** The root `pyproject.toml` builds with hatchling's
   src-layout, and `[tool.uv.workspace] members` lists only `apps/rotaris`, so
   `devtools/` is in neither wheel and in no lockfile.
3. **The dependency arrow runs one way.** These tools may import
   `rotaris_core.reqtocode` and `rotaris_core.packaging.release` — reading the
   requirement store with the store's own parser is the point. Product code must
   never learn that a milestone exists.

## `milestone.py`

Milestone planning and the merge gate. See
[`docs/milestones/README.md`](../docs/milestones/README.md) for what a milestone
*is*; this is how you ask about one.

```bash
uv run python devtools/milestone.py check               # validate the manifests
uv run python devtools/milestone.py status [M1]         # progress per member
uv run python devtools/milestone.py branch-for SWR-2901 # which branch this work belongs on
uv run python devtools/milestone.py gate M1 [--tests-passed]
uv run python devtools/milestone.py notes M1 [--base <ref>]
uv run python devtools/milestone.py pr-body M1 [--existing body.md]
```

Exit codes are ReqToCode's: **0 ok / 1 violations / 2 internal error**.

`uv run` is the form to use — `make` is unavailable on Windows, so the Makefile
targets are a convenience, not the contract.

### The gate

`gate` is green only when all six hold:

| Check | Source |
| --- | --- |
| every member requirement is `approved` | the requirement store |
| ReqToCode clean | `reqtocode.verifier.verify()`, in-process |
| no requirement text drifted from its code | `reqtocode.diff.compute_requirement_diff()` |
| both manifests carry the milestone's `target-version` | `packaging.release.declared_versions()` |
| `origin/master` is already merged in | `git merge-base --is-ancestor` |
| the full suite is green | **supplied** by the caller |

The last one is passed in rather than run. The suite is ~550 files and six
minutes; swallowing that would make the gate unrunnable by hand. Without
`--tests-passed` the gate reports it unverified and exits 1 — the CI job that
actually ran pytest supplies the verdict.

### Why it is stdlib-only

Apart from `rotaris_core.reqtocode` and `rotaris_core.packaging.release` — both
stdlib-only themselves — this tool imports nothing outside the standard library.
So it runs on a bare checkout with no dependency install:

```bash
PYTHONPATH=src python devtools/milestone.py check     # needs Python 3.12+
```

That is the same shape `.github/workflows/reqtocode.yml` and the release
`guard` job use, and it is why `.github/workflows/milestone.yml`'s manifest job
takes seconds. It is also why `epic_index_for` is reimplemented in
`milestone_lib/membership.py` instead of imported from
`rotaris_core.requirements.sources.reqtocode`: that module pulls in pydantic.
`devtools/tests/test_membership.py` pins the two implementations together across
the whole real store, so they cannot drift.

Note the interpreter: the repo targets Python 3.12 and uses 3.12 syntax, so a
system `python3` older than that will fail to import `rotaris_core`. Use
`uv run python` locally.

## Tests

```bash
uv run pytest devtools/tests -q
```

They are deliberately *not* under `tests/`: that root belongs to the product,
where every test owes a `@verifies`. `[tool.pytest.ini_options] testpaths`
stays `["tests"]`, so a bare `uv run pytest` still means "the product suite" and
this line is run alongside it in CI.
