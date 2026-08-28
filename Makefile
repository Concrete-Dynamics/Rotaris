.PHONY: install install-dev install-rotaris rotaris rotaris-demo test test-parallel test-rotaris test-capability test-live test-devtools reqtocode reqtocode-fix milestone milestone-status lint format typecheck clean

install:
	uv sync --all-packages

install-dev:
	uv sync --all-packages

install-rotaris:
	uv sync --all-packages

rotaris:
	uv run python -m rotaris .

rotaris-demo:
	uv run python -m rotaris --demo

# The full pass, 6225 tests. Measured 2026-08-22 on an 8-core/16-thread laptop:
# 258-399s wall against about 1500s of summed test time, so `-n auto` is what
# makes it affordable. `--dist loadfile` comes from `addopts` in pyproject.toml,
# which is also where the measurements behind it are written down.
#
# `-n auto` is *physical* cores, not logical ones -- xdist asks psutil, which is
# a declared dev dependency for exactly that reason. Do not replace it with a
# literal: the number is right on one machine and wrong on the next.
#
# No `-x` -- under xdist the first failure kills every worker, and one flake
# would then hide the rest of the run. The timeout is per test and has to clear
# the worst case under full CPU contention, well above what a serial run needs.
#
# Re-measure before quoting these numbers: the same command on the same commit
# has landed anywhere between 258s and 399s here depending on thermal state.
test:
	uv run pytest -q --timeout=120 -n auto

# Kept as the narrower selection: unit + integration only, no capability tests.
test-parallel:
	uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=120

# The Qt suite, 1462 tests. Measured 2026-08-22: 611s at `-n auto`, where the
# slowest entries are fixture *setup* and *teardown* rather than any test body
# -- most of that bill is one `MainWindow` built per test across 26 files, not
# work the assertions need. Treat the number as a standing debt, not a target.
# The `serial` marker carves out the tests that need a core to themselves; they
# run in a second, single-process pass.
test-rotaris:
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -n auto -m "not serial"
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -m serial

test-capability:
	uv run pytest -m capability -x -v --timeout=600

# The one test that spends money: a real model, delegating once and reading one
# file. Never part of `make test` -- collection skips it unless it is asked for
# by name, and again unless a key is readable (see tests/live/conftest.py).
test-live:
	uv run pytest tests/live -m live -q --timeout=900

test-devtools:
	uv run pytest devtools/tests -q --timeout=60

test-cov:
	uv run pytest --cov=rotaris_core --cov-report=term-missing

lint:
	uv run ruff check devtools/ src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'

format:
	uv run ruff format devtools/ src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'

typecheck:
	uv run mypy src/rotaris_core/
	uv run mypy apps/rotaris/src/rotaris/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf .mypy_cache .ruff_cache dist build *.egg-info

reqtocode:
	uv run python -m rotaris_core.reqtocode check

reqtocode-fix:
	uv run python -m rotaris_core.reqtocode check --fix

# Milestone planning and the merge gate (devtools/README.md). Dev tooling, not
# part of the product -- ReqToCode never sees devtools/ and it ships nowhere.
# `make` is unavailable on Windows, so these are a convenience: the contract is
# the `uv run python devtools/milestone.py ...` form the docs and agents use.
milestone:
	uv run python devtools/milestone.py check

milestone-status:
	uv run python devtools/milestone.py status
