# ReqToCode Propagation Playbook

Runbook for reacting to any ReqToCode signal (blueprint §10 —
`docs/reference/reqtocode-blueprint.md`). Activates on: verifier errors,
failing `tests/unit/reqtocode/` meta-tests, `AttributeError` on a removed
`SWR_<n>` symbol, `DeprecationWarning` on a reference, a hook-rejected commit,
or any edit under `docs/requirements/`.

## Toolbox

```bash
python -m rotaris_core.reqtocode check              # verify (exit 0/1/2)
python -m rotaris_core.reqtocode check --fix        # regenerate swr.py, then verify
python -m rotaris_core.reqtocode check --update-baseline   # prune paid-off debt (shrink-only)
python -m rotaris_core.reqtocode diff [--base <ref>]       # worklist of requirement changes vs base (the trigger)
python -m rotaris_core.reqtocode diff --strict             # exit 1 on text-changed-but-code-untouched drift
make reqtocode / make reqtocode-fix              # same via uv
```

`diff` is the **propagation trigger**: it turns a requirement change into a
worklist. Run it first when reacting to a requirement edit — it classifies every
change (added / removed / modified / status) and lists the exact `@traces` /
`@verifies` sites to review, so you do not have to hunt them by hand. `check`
still cannot see a text-only edit whose annotations stayed intact; `diff
--strict` is the gate that does (an approved requirement's text changed but none
of its site files were touched in the same change). Committing the requirement
edit and the code update together clears the diff.

- Generated symbols: `src/rotaris_core/reqtocode/swr.py` (`SWR.SWR_<n>`, `META`, `DEPRECATED`).
- Annotations: `@traces(SWR.SWR_<n>)` on the implementing element (impl roots),
  `@verifies(SWR.SWR_<n>)` on the covering test (test roots). Import:
  `from rotaris_core.reqtocode import SWR, traces, verifies`.
- Transitional coverage: `# @req: SWR-<n>` comments in tests still count.
- Bootstrap debt: `docs/requirements/traceability-baseline.txt` (missing
  trace/test), `docs/requirements/orphan-baseline.txt` (untraced modules), and
  `docs/requirements/orphan-test-baseline.txt` (unannotated tests) — all three
  may only shrink; `check --update-baseline` prunes/bootstraps all three.
- Reverse check (code): every impl module needs ≥1 `@traces()` or the
  `# reqtocode: exempt` marker, else it is an orphan-code error. Deleting a
  requirement that leaves its module untraced surfaces here — delete or
  re-point the module.
- Reverse check (tests): every `test_*` function needs ≥1 `@verifies()` /
  `# @req:` or the exempt marker, else it is an orphan-test error. Excused:
  `tests/capability/` and baselined pre-existing tests. New tests always need
  the annotation — the baseline never grows.

## Procedure

1. **Get the worklist**: run `python -m rotaris_core.reqtocode diff` (add
   `--base <ref>` to compare against a branch point). It classifies every
   requirement change and prints the affected reference sites. Then read the
   full new requirement text — not just the diff — and act per class:
   - **text changed** → rework every `traces` site to match the new text; update
     `verifies` tests. The changed content hash in `swr.py` is the review artifact.
   - **status → deprecated** → migrate or remove every reference (deprecation
     warnings at each site name the requirement).
   - **file/req-id removed** → every `SWR_<n>` reference now fails; remove or
     re-point the code and tests.
   - **new requirement (approved)** → implement, then add `traces` + `verifies`.
   - **`trace`/`test` flag flipped to required** → add the missing annotation(s).
   For every new or materially changed product SWR, review and update its test
   portfolio before implementation; follow the
   [product-centred test strategy](../testing/test_strategy.md).
2. **Regenerate and verify**: `python -m rotaris_core.reqtocode check --fix`, then
   `check`. The violation list is the work queue.
3. **Find all reference sites**: search for `SWR_<n>`. `traces` hits =
   implementation, `verifies` / `# @req:` hits = tests.
4. **Rework each implementation site** to the new requirement text; the `traces`
   annotation moves with the behavior.
5. **Update/create the `verifies` tests** from productive user intent, including
   the required productive-use docstring and a qualifying hermetic user-flow E2E
   test for each product SWR. Loop 4–5 against the **focused selection for the
   requirement** until green, then run the appropriate broader suite once as a
   final pass. Tests must exercise real behavior of the traced code — a test that
   would pass without the implementation is a red flag.
6. **Commit requirement docs + `swr.py` + baseline + code + tests as one unit**,
   requirement id in the message. The pre-commit hook re-checks. Never bypass it,
   never silence a violation by deleting annotations, weakening a requirement,
   or adding baseline entries (the baseline is bootstrap-only and shrink-only).

## Status changes

When you finish implementing a requirement, set `status: approved` in its file
AND add the `traces`/`verifies` annotations in the same change — an approved
requirement without annotations is a verifier error (unless baselined). When you
pay off baselined debt, prune it: `check --update-baseline`.
