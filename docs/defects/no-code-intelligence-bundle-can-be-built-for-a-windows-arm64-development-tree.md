## No code-intelligence bundle can be built for a Windows ARM64 development tree

Found 2026-10-16 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, uv 0.12.5 arm64, dev tree, at `16477015` (the
Windows ARM64 session, preparing its live runs). Since fin47 built OQ-400's ruling (2026-10-15), `pnpm code-intel:bundle` with
no `--target` builds for the host, `win32-arm64`: uv installs `cpython-3.13.15-windows-aarch64-none`, then
`uv pip install serena-agent==1.7.0` finds no `win_arm64` wheel for six of its dependencies and builds them from source:
`tiktoken` 0.12.0 and `cryptography` 50.0.0 (Rust), `psutil` 7.0.0, `pyyaml` 6.0.2 and `ruamel-yaml-clib` 0.2.15 (C), and
`proxy-tools` 0.1.0 (pure Python). With no Rust compiler on the host the first failed ("can't find Rust compiler"), the step
refused, and the tree is left with no bundle: `--check` reads it absent or stale for `win32-arm64`. Every check that needs the
bundle refuses at once (`pnpm live-run`, `init-proof`, `code-intel-proof`), and a `--target=win32-x64` bundle, which builds from
`win_amd64` wheels under emulation, is read as stale by those checks, which ask for the host's target.

Before OQ-400's ruling the same host built the bundle in 14 s: uv picked the x86_64 interpreter by itself, and every
dependency came as a `win_amd64` wheel.

Not repaired by itself: the session raises [OQ-401](../architecture/open-questions.md#oq-401) and proceeds under its stated
reading, which is a tooling change.

## Specs

None contradicted directly. OQ-400's ruling, part (c), builds the interpreter "for the target artifact's architecture" and
says nothing of a development tree on a Windows ARM64 host; REQ-STARTUP-026 publishes no `windows-arm64` artifact.

## Relevant files

- `apps/desktop/scripts/code-intelligence/target.mjs` — `parseTarget`'s default, the host.
- `apps/desktop/scripts/code-intelligence/bundle.mjs` — the build and `--check`.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — the callers' `--check` (`live-run`, `init-proof`).
