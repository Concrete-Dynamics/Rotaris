#!/bin/bash
# SessionStart hook: prepare a remote Claude Code container so the documented
# Makefile targets (test, test-rotaris, lint, typecheck, reqtocode) all run.
#
# Three things the base image does not provide:
#   1. Python 3.12 — both workspace packages set requires-python = ">=3.12",
#      and the image ships 3.11.
#   2. libEGL/libGL/libxkbcommon/libdbus — PySide6 links them even under the
#      offscreen platform plugin, so `make test-rotaris` fails to import Qt
#      without them (same list the Rotaris desktop CI workflow installs).
#   3. QT_QPA_PLATFORM=offscreen — there is no display in the container.
set -euo pipefail

# Local checkouts already have their own toolchain; only fix up the remote one.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Qt runtime libraries. Skipped once present so re-runs on a cached container
# stay fast, and never fatal: the core suite does not need Qt, so a package
# mirror hiccup should not take the whole session down with `set -e`.
if ! dpkg -s libegl1 >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
  $SUDO apt-get update -qq \
    && $SUDO apt-get install -y -qq libegl1 libgl1 libxkbcommon0 libdbus-1-3 \
    || echo "session-start: Qt system libraries unavailable; apps/rotaris tests may not import PySide6" >&2
fi

# uv resolves and pins the interpreter itself; `uv sync` would fetch 3.12 on
# demand, but doing it explicitly keeps the failure legible if it ever breaks.
uv python install 3.12

# --all-packages covers both workspace members (rotaris-core and apps/rotaris)
# and their PEP 735 dev groups, which is where pytest, ruff, mypy and pytest-qt
# live. Not `--frozen`: the lockfile is the input, and re-syncing is cheap once
# the container cache is warm.
uv sync --all-packages

# Every Qt test runs headless here. The desktop CI workflow sets the same value.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export QT_QPA_PLATFORM=offscreen' >> "$CLAUDE_ENV_FILE"
fi
