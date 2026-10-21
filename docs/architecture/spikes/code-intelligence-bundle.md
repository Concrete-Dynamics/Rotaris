# Spike — the bundled code-intelligence runtime (ADR-0035, ADR-0054; REQ-MCP-011/033, REQ-STARTUP-015/159)

- **Date:** 2026-09-06 (Part T; the first act of building ADR-0035)
- **Question:** can the pinned runtime — Serena, `serena-agent` on PyPI (MIT), the owner's decision of 2026-09-05 —
  ship as a self-contained tree under the application's resources, built at build time with `uv` and never fetched by
  the product; what does the tree cost, how long is a cold start to `tools/list`, and **does the runtime fetch anything
  at run time** (REQ-STARTUP-159)?
- **Verdict:** **the bundle works and answers the protocol from the tree; the runtime fetches its language servers on
  first use — IC-7 is raised.** The build step is `apps/desktop/scripts/code-intelligence/bundle.mjs`; the seven
  measurements are below, taken on the build machine (Windows 11, uv 0.12.5 on PATH, node and npm on PATH).

## 1. The bundle

| What | Measured |
|---|---|
| Pins | Python **3.13.15** (python-build-standalone through `uv python install --install-dir`), `serena-agent==1.7.0`, uv **0.12.5** (used from PATH when the version equals the pin, else downloaded by version and sha256, never shipped) — `scripts/code-intelligence/pins.json` |
| Form | no virtual environment: `uv pip install --python <tree>/python.exe --break-system-packages serena-agent==1.7.0` into the interpreter's own `site-packages`. A venv's `pyvenv.cfg` records the base interpreter's absolute path, which the move into the artifact would falsify; the interpreter's own tree records nothing path-bound |
| Console-script launchers | trimmed: each `Scripts/*.exe` embeds the absolute path it was built at. The product enters through `python.exe -c "from serena.cli import top_level; top_level()"` (the distribution's declared entry point, `entry_points.txt`) |
| Size | 143.7 MB in 7,523 files as installed; **175.4 MB in 10,602 files** after trimming (`Scripts`, `include`, `libs`, `Lib/idlelib`, `Lib/turtledemo`, `PyWin32.chm` — 4 MB) and `compileall` over `Lib` (+36 MB of bytecode, so an installation under Program Files, where the user cannot write, never compiles on import). Not A/B-measured: the cold start below is with the compiled tree |
| Build time | 14.0 s with uv's caches warm; the first `uv python install` of the interpreter took 3.4 s, the wheel install 10.4 s on this connection |
| Licence text | one copy inside the bundle: `Lib/site-packages/serena_agent-1.7.0.dist-info/licenses/LICENSE` (REQ-STARTUP-015/142); the notices generator is not built. *2026-09-27 (first-release-plan.md §4.4): the artifact now carries the copy in `THIRD-PARTY-LICENSES.txt` instead, and this file stays in the built tree only, for the generator (ADR-0054, "The two bundled assets")* |
| Marker | `bundle.json` beside `runtime/`: the pins' hash (a rebuild is skipped when it matches), the runtime's own answers for the Python and distribution versions (the evidence, ADR-0056's discipline), what was trimmed, the sizes |

**The dashboard.** Serena starts a web dashboard by default (an HTTP server on `127.0.0.1:24283` and a browser tab —
observed in the first launch: `Serena web dashboard started at http://127.0.0.1:24283/dashboard/index.html`) and, with
it, two network fetches at start (a PyPI version check and a remote news JSON, both failing harmlessly under the dead
proxy). REQ-MCP-033 forbids any user interface. The product's branch (`main/sentinel.ts`) sets `SERENA_HOME` to the
per-user data directory (`…/rotaris/data/code-intelligence`, REQ-STARTUP-145) and seeds it ONCE with the runtime's own
configuration template, three values changed: `gui_log_window: False`, `web_dashboard: False`,
`web_dashboard_open_on_launch: False`. **A three-line configuration is refused** — the runtime demands its `projects`
key ("`projects` key not found in Serena configuration") — so the seed is the whole template.

**A curiosity, recorded:** `serena -V` appends the *working directory's* git description to its version — from this
repository it prints `Serena 1.7.0-48fe2406-dirty`. The manifest generator reads the `MAJOR.MINOR.PATCH` and nothing
after it.

## 2. Cold start to `tools/list`

| Launch | `initialize` | `tools/list` | Tools listed |
|---|---|---|---|
| the tree's `python.exe` directly, uncompiled, dashboard on, `--project <TypeScript workspace>` | 5,406 ms | 5,413 ms | 22 |
| the same, a Python workspace | 5,419 ms | 5,427 ms | 22 |
| the compiled tree, dashboard off, no project (the manifest generator's launch) | — | **3,636–3,664 ms** | 24 (`activate_project` and `get_current_config` present without a project — withheld under one, REQ-MCP-034) |
| through the development entry (`electron.exe out/main/index.js builtin:code-intelligence -- start-mcp-server …`) | 4,556–4,589 ms | 5,548–5,614 ms | 22 |

Nothing but JSON-RPC on standard output from the runtime itself (`preambleBeforeFirstBrace: ""` on the direct launches).
The process **exits 0 on standard input's end-of-file** within a second (171,660 − 171,124 ms in the TypeScript run;
22,462 − 21,900 ms in the Python run) — the transport's close path (`stdin.end()`, then the grace, then the tree kill)
therefore ends the runtime without the kill.

## 3. Does the runtime fetch at run time? — YES, its language servers

Outbound blocked with `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` pointed at a dead port (`http://127.0.0.1:9`); a fresh
`SERENA_HOME`; one TypeScript workspace, one Python workspace; `get_symbols_overview` called on the one source file.

| Workspace | What the runtime did | Outcome |
|---|---|---|
| TypeScript | `Running command 'npm install --prefix ./ typescript@5.9.3'` then `'npm install --prefix ./ typescript-language-server@5.1.3'` in `<SERENA_HOME>/language_servers/static/TypeScriptLanguageServer/ts-lsp`, after asserting `node` and `npm` are on PATH | **succeeded in 165,711 ms** — npm answered from ITS OWN CACHE on this machine (a dead proxy does not empty it); the call then returned `{"Class": ["Counter"], "Function": ["greet"], "Interface": ["Greeter"]}` |
| Python | `uvx -p 3.13 --from pyright==1.1.403 pyright-langserver --stdio` (the machine's `uvx.EXE` from PATH) | **failed in 17.2 s**: `Failed to fetch: https://pypi.org/simple/pyright/ … tunnel error … (os error 10061)`; the language-server manager did not initialise and the call errored |

So: **the bundle carries the runtime and none of its language servers.** Each is obtained at first use of a language —
TypeScript through `npm install` (and `node` to run it), Python through `uvx` (PyPI, and the `pyright` wheel in turn
downloads a Node runtime on first run unless one is on PATH), most others likewise through the runtime's dependency
providers (`solidlsp/language_servers/*`, `download_and_extract_archive_verified`). The store is
`<SERENA_HOME>/language_servers/static/<Server>/`, i.e. the product's per-user data directory.

**Can Serena be pointed at pre-bundled ones?** Yes, two ways, both public configuration: (a) a language server already
present under the static directory is used without installing (`typescript-language-server … executable not found …
Installing` is the only trigger); (b) `ls_specific_settings.<language>.ls_base_cmd` / `ls_args` / `ls_extra_args` in
`serena_config.yml` override the launch command outright, bypassing the managed installation. **But the two servers that
matter first — TypeScript's and Python's (pyright) — are Node programs**, so a self-contained bundle would also have to
carry a Node runtime and the two packages (~60–100 MB more, a second interpreter to keep pinned and licensed), and every
other language's server is its own download. That is a release decision with size and licensing consequences, not this
part's to take: **IC-7 is proposed** in `implementation-conditions.md` (REQ-STARTUP-159 against on-demand language
servers). The mechanism — bundle, branch, manifest, client, setup — is built with the bundle as it is; the condition
binds the release.

## 4. What this leaves for the proof

`pnpm code-intel-proof` re-measures the branch through the real run host (launch 1), a real call on a TypeScript file
(launch 4 — the runtime provisions the language server on the first proof run of a machine, warm afterwards because the
proof keeps the runtime's home), and, on the packaged binary, the self-containment launch (launch 7: a fresh home,
outbound blocked, an empty npm cache — what the runtime tried to fetch is IC-7's evidence). The packaged artifact's
growth is ADR-0054's note.

## Windows 11 ARM64 — 2026-10-21 (the Windows ARM64 session's F2)

Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, uv 0.12.5 aarch64, built at `af692eea`. The bundle, as built today, is the `win32-x64` tree on this host (Python 3.13.15 x64, PE machine `0x8664`), built in 20.6 s from published `win_amd64` wheels only, and it runs under the x64 emulation: `tools/list` at 4.0 to 5.5 s in the proof's launch 1 (ADR-0035 consequence 1 recorded 5.5 to 5.6 s on x64), and the first symbol call provisioned the TypeScript language servers as section 3 found. The emulated interpreter reports `platform.machine()` as `ARM64`. ADR-0035, "The proof on Windows 11 ARM64", holds the readings.
