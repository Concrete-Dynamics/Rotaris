# Spike — the reserved-token branch on the application's own binary (spike-list item 5; ADR-0035 consequence 1, ADR-0055; REQ-MCP-033, REQ-STARTUP-002)

- **Date:** 2026-09-06 (Part T; taken as the first act of building the branch)
- **Question:** which process mode makes `<the application's executable> builtin:code-intelligence …` answer the
  protocol on standard output with **nothing else** there, open no window, and exit with the runtime's own status —
  Electron's main entry with the token at `argv[1]` (Chromium initialises before our JavaScript runs), or
  `ELECTRON_RUN_AS_NODE=1` (then the token cannot be the first argument)?
- **Verdict:** **Electron's own main entry, token first, with `--` as the SECOND argument.** Three things Electron's
  binary does on Windows before any JavaScript of ours, none of which the requirement anticipated, each measured on the
  development binary (`electron.exe 44.1.1` with `out/main/index.js`) and on a packaged `Rotaris.exe` (the main
  checkout's IC-6 build of 2026-09-05):

## 1. A scheme-looking positional followed by another positional kills the process before JavaScript

`electron.exe index.js builtin:code-intelligence start-mcp-server` exits **−1 (0xFFFFFFFF) after 50–63 ms** with
nothing on either stream and no process started below it. Every variant in the table was run through Node's
`spawnSync` (not a shell):

| Command line (after the executable and, in development, the main bundle) | Result |
|---|---|
| `builtin:code-intelligence x`, `builtin:code-intelligence tools list`, `builtin:code-intelligence <existing directory>` | exit −1 in ~55 ms, no output |
| `foo:bar x` (any scheme-looking word, then a positional) | exit −1 in 56 ms — **not our token; Chromium's command line** |
| `builtin:code-intelligence x:y` | exit −1 |
| `a:b c:d` | runs (a one-letter "scheme" is a drive letter on Windows) |
| `builtin:code-intelligence -V`, `--help`, `-x`, `--x` | runs: the runtime answers (`-x` → click's "No such option", exit 2) |
| `foo:bar` alone, `builtin` `x` (no colon) | runs |
| **`foo:bar -- x`, `builtin:code-intelligence -- start-mcp-server …`** | **runs; the token is still the first argument; `--` reaches `process.argv` and the branch drops it** |
| the packaged `Rotaris.exe foo:bar x` / `Rotaris.exe foo:bar -- x` | −1 in 144 ms / runs — the same on the frozen binary |

The launch of the token (`packages/config`, `resolveCommand` with the run host's `codeIntelligenceLaunch`) therefore
produces `Rotaris.exe builtin:code-intelligence -- <the entry's arguments> --project <root>`; the derived setup
invocation of REQ-MCP-036 is `Rotaris.exe builtin:code-intelligence --` and the setup subcommands follow it through the
same branch. REQ-MCP-033's letter — the token as the first argument — holds; the `--` is the branch's separator and is
recorded on the sentinel beside the reason.

## 2. Electron writes CR LF to standard output about 50 ms after start

When standard output is a pipe, the binary emits `0d 0a` at 48–118 ms — before Python is even started (the runtime's
import alone takes 4 s) — in development and packaged alike, and even for `electron.exe --version` (whose output begins
`\r\nv44.1.1\n`). `ELECTRON_NO_ATTACH_CONSOLE=1` does not change it; under `ELECTRON_RUN_AS_NODE=1` standard output is
clean (`x\n` and nothing before it). The runtime itself writes nothing before its first `{` (the bundle spike).

Consequence 1's "nothing else on standard output" is therefore false by exactly one blank line on this platform, and
the branch cannot prevent it (it runs after). **The reading taken:** a blank line is not a message under newline-framed
JSON-RPC; `OwnedStdioTransport` drops whitespace before the first byte of the first message and nothing else, and the
proof asserts the preamble is `0d0a` or empty and that no non-JSON line follows. Recorded in ADR-0035's note as a
finding about the platform, not a defect of ours.

## 3. `ELECTRON_RUN_AS_NODE` cannot run the main bundle at all

The main bundle is ES modules with `import { app, … } from 'electron'`; under `ELECTRON_RUN_AS_NODE=1` the import fails
before the sentinel runs (measured: `SyntaxError`-class refusal on the `electron` import). The node mode would need a
separate script entry and `--require`, putting the token second — REQ-MCP-033's letter would break for nothing, since
mode 1 with `--` works. Not taken.

## 4. The four observables of consequence 1, on the development entry with `--`

| Observable | Measured |
|---|---|
| valid JSON-RPC on standard output | `initialize` answered at 4,556–4,589 ms (Serena 1.7.0 over `mcp` 1.28.1, protocol 2025-06-18), `tools/list` at 5,548–5,614 ms with **22 tools** under `--project` (no `activate_project`, no `get_current_config` — REQ-MCP-034's withholding) |
| nothing else on standard output | the CR LF of §2 and then JSON only; zero non-JSON lines in 3 runs |
| no window | 11–12 samples at 300 ms of every `electron`, `Rotaris`, `python`, `conhost`, `node` process started after the launch: `electron` and `python` only, `MainWindowHandle` 0 at every sample |
| the runtime's own exit status | stdin's end → the server exits 0 and the sentinel exits **0** ~1 s later; `no-such-subcommand` → click exits 2 and the sentinel exits **2** (its usage text on standard error, 4.1 s); the runtime killed with `taskkill /F` → it dies 1 and the sentinel exits **1** 0.8 s later. The parent observed the runtime's code in each case and never a substitute |

The branch is `apps/desktop/src/main/sentinel.ts`, the first import of `main/index.ts`: a **synchronous** spawn with
`stdio: 'inherit'`, so main's body — the machine id, the data directory, the instance claim (ADR-0055) — is never
evaluated on this path; it forwards no signal (on Windows there is none; the runtime ends on end-of-file, which the
parent's pipe delivers to both processes). The per-user `SERENA_HOME` is seeded here (the bundle spike, §1); measured
on this run: the seeded file carries the three interface keys off and the `projects` key the runtime demands.

## 5. What the proof adds

`pnpm code-intel-proof` launch 1 repeats this table through the proof's own client on the development entry, and on the
packaged `Rotaris.exe` under `ROTARIS_CODE_INTEL_PACKAGED=1` (the artifact of `pnpm package`, whose `afterPack` also
asserts the interpreter answers from inside `win-unpacked`). **Taken 2026-09-06 on both:** development `initialize`
4,556 ms, `tools/list` 5,571 ms, 22 tools, preamble `0d0a`, exit 0 at 6,584 ms, `electron` and `python` the only
processes over 12 samples, unknown subcommand → 2; **packaged** `initialize` 4,507 ms, `tools/list` 5,523 ms, 22 tools,
preamble `0d0a`, exit 0 at 6,549 ms, `Rotaris` and `python` the only processes over 12 samples, unknown subcommand → 2.
Launch 7 (packaged, outbound blocked, a fresh home, an empty npm cache): `tools/list` at 4,909 ms; the symbol overview
errored in 712 ms with the runtime's own text naming `npm install --prefix ./ typescript@5.9.3` — IC-7's evidence.
Figures in `.proof/code-intel-proof/results.json`.
