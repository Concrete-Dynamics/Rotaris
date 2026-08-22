.PHONY: install install-dev install-rotaris rotaris rotaris-demo test test-parallel test-rotaris test-capability reqtocode reqtocode-fix lint format typecheck clean

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

# The full pass. `-n auto` is what makes it affordable: measured 748s serial vs
# 147s across 16 workers on the same tree. No `-x` -- under xdist the first
# failure kills every worker, and one flake would then hide the rest of the run.
# The timeout is per test and has to clear the worst case under 16-way CPU
# contention, which is well above the 30s a serial run needs.
test:
	uv run pytest -q --timeout=120 -n auto

# Kept as the narrower selection: unit + integration only, no capability tests.
test-parallel:
	uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=120

# The Qt suite parallelizes after all: 217s single-process vs 67s across 16
# workers, same 642 passing. The `serial` marker carves out the one test that
# needs a core to itself; it runs in a second, single-process pass.
test-rotaris:
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -n auto -m "not serial"
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -m serial

test-capability:
	uv run pytest -m capability -x -v --timeout=600

test-cov:
	uv run pytest --cov=rotaris_core --cov-report=term-missing

lint:
	uv run ruff check src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'

format:
	uv run ruff format src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'

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
