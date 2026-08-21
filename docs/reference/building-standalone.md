# Building the standalone binaries

How to produce the downloadable Rotaris artifacts (SWR-3001). Each target is
built on its native OS — there is no cross-compilation.

## One command per artifact

```bash
uv sync --all-packages                                          # PyInstaller lives in the dev group
uv run python -m rotaris_core.packaging build rotaris           # desktop app, onedir
uv run python -m rotaris_core.packaging build rotaris-cli       # rotaris-cli
uv run python -m rotaris_core.packaging build rotaris-headless  # rotaris-headless
```

Options: `--mode onedir|onefile` (default `onedir`) and `--output <dir>` (default
`dist/`). The command prints the artifact path it produced and fails with the
reason if it cannot.

## Why onedir is the default

A frozen PySide6 tree is a few hundred megabytes. `onefile` packs it into a
single executable that re-extracts itself into a temporary directory on **every**
launch — measurably slower to start. So:

| Artifact | Mode | Why |
| --- | --- | --- |
| Windows installer (NSIS) | `onedir` | installed app must start fast |
| Windows portable `.exe` | `onefile` | one file is the point; the cold start is the price |
| macOS `.app` in a DMG | `onedir` | the bundle *is* a directory |
| Linux AppImage | `onedir` | AppImage supplies the single-file packaging |

## Platform wrappers

```bash
# Windows, after the onedir build (needs NSIS on PATH)
makensis /DVERSION=<x.y.z> /DSOURCE_DIR=<repo>\dist\rotaris packaging\installer\rotaris.nsi

# macOS, after the onedir build
packaging/macos/make_dmg.sh <x.y.z>

# Linux, after the onedir build (needs appimagetool on PATH)
packaging/linux/make_appimage.sh <x.y.z>
```

Windows installs per user under `%LOCALAPPDATA%\Rotaris` — no elevation prompt,
and the in-app updater (SWR-3003) can replace the files without administrator
rights.

## Targets

| Platform | Artifact | Notes |
| --- | --- | --- |
| Windows x64 | installer + portable `.exe` | |
| macOS ARM64 | `.app` in a DMG | native Apple Silicon build |
| Linux x64 | AppImage | build on the oldest supported glibc |

**Windows ARM64 is not supported.** The pinned PySide6 publishes no `win_arm64`
wheel, so the desktop app cannot be frozen for it without building Qt from
source. ARM64 Windows runs the x64 build under emulation.

**Intel macOS is not supported.** A universal2 build needs every native
dependency — PySide6, pydantic-core, xxhash, mistune — installed as a universal2
wheel, and uv resolves host-matched wheels instead, so `target_arch` cannot be
satisfied without hand-assembling the environment (SWR-3001 AC-005).

## What the binary does and does not remove

It removes the Python and dependency install. It does **not** vendor the external
programs Rotaris shells out to:

- `git` — required for worktrees and checkpoints;
- `uvx` / `npx` — how MCP servers are launched, including the pinned
  `serena-agent`.

Missing ones degrade those features with the existing warnings; the application
still starts.

The binaries are neither code-signed nor notarized (out of scope for SWR-3001),
so Windows SmartScreen and macOS Gatekeeper will warn on first launch.

## How the bundle contents are decided

`src/rotaris_core/packaging/pyinstaller.py` derives them; the `.spec` files under
`packaging/` are thin wrappers over it. Three classes of content cannot be
discovered by PyInstaller's import analysis and are handled explicitly there:

1. **Package data read through `Path(__file__).parent`** — persona prompts, the
   playbook matrix, the intent catalogue, the TUI stylesheet. Collected by
   *walking* the packages, so a new prompt file needs no change here.
2. **Dependency data** — `litellm`'s price tables, `openhands`' templates,
   `binaryornot`'s signature CSVs, `textual`'s tree-sitter highlights.
3. **String imports and distribution metadata** — the OpenHands terminal
   internals, the Serena task runner, `tiktoken_ext`, and the metadata closure
   over both distributions' requirements. Two real failures found this way in a
   frozen run: `rotaris-cli version` printing `0+unknown`, and `fastmcp` raising
   `PackageNotFoundError` at import.

`tests/unit/packaging/test_pyinstaller_bundle.py` holds those decisions to their
contract in milliseconds; `tests/integration/test_standalone_build.py` runs the
real build when `ROTARIS_BUILD_STANDALONE=1` is set.

Adding an icon: drop `rotaris.ico` (Windows) or `rotaris.png` (Linux/macOS) into
`packaging/assets/` and the next build picks it up. Without one, PyInstaller's
default icon ships.
