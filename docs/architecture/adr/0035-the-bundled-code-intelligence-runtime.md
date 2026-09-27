# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-10)
- **Depends on:** ADR-0002, ADR-0033, ADR-0054
- **Blocked by an open question (OQ-23) about what the sentinel branch must do.**

## Context

`REQ-MCP-033`: the reserved token `builtin:code-intelligence` is recognised **before every other
command-resolution rule** and is never looked up on the search path. In a frozen installation it
resolves to "the application's own executable with the same token as its first argument — one literal
serves as both the token and the sentinel, so there is nothing else to keep in step". Such a process
answers the protocol on its standard streams, **presents no user interface, opens no window**, and
terminates with the server's own exit status.

`REQ-MCP-037`: a `stdio` entry carrying the token counts as available **unconditionally**, because what
it resolves to ships with the application. `REQ-MCP-113`'s launch guarantee applies to this child too —
it is the application's own executable (ADR-0033).

`REQ-MCP-116`: **exactly one binding manifest** is the single place the pinned runtime's identifiers
are written — distribution id, pinned version, transport and mode arguments, launch subcommand, both
project-selection options, marker file name, the three setup subcommands, the indexable extension list,
and the four grant tiers' tool names plus three never-grant names. It is **not user-editable**, is not
read at run time from any location a user can write, and does not vary by workspace.

`REQ-MCP-015`, `REQ-MCP-011` and `REQ-MCP-095`: build checks verify tier cardinalities, pairwise
disjointness, the absence of never-grant names, that **every name is reported by the pinned runtime's
own tool listing**, and that a shipped entry's version string matches the setup manifest character for
character. **A failing build must not ship.** `REQ-MCP-015`'s stated purpose is that "an upstream rename
therefore fails a build rather than silently degrading a grant at run time".

`REQ-MCP-036` and `REQ-MCP-099`: the setup invocation is **derived** from the configured entry — the
resolved command plus exactly the argument prefix preceding the launch subcommand — and **no substitute
command may be used**; setup then runs three subcommands against it, at 300, 1800 and 120 seconds, with
UTF-8 child encoding, quarter-second polling, a 5-second terminate grace then force-kill of the whole
process tree, failing output truncated to its **last** 400 characters, and a status vocabulary in which
a failure stops the steps that follow.

`REQ-MCP-034`: workspace binding appends exactly two arguments at the end when the args contain the
launch subcommand and no project-selection argument, matched on the launch subcommand alone
independently of the entry's name; a server launched with a project path must not advertise its
project-switching or configuration-introspection tools. For an isolated working tree the appended path
is that tree's root, so **binding is per run, not per configuration**.

`REQ-CONFIG-181` leaves the identity of the pinned distribution to the implementation and permits it to
change between releases.

## Alternatives considered

**A — Ship the runtime as a separate bundled executable and resolve the token to its path inside the
application's resources.**

*For:* simplest mental model; the setup subcommands work because it is just the runtime's own
executable; no argv branch in the application; the process is plainly not the application, so "presents
no user interface" is trivially true.
*Against:* it contradicts `REQ-MCP-033` as written — a frozen installation is required to resolve the
token to **the application's own executable** with the token as its first argument, with the explicit
rationale that one literal serves as both the token and the sentinel. Choosing A means proposing a
change to that requirement, which is legitimate but must be stated rather than done quietly. It also
sits awkwardly with `REQ-STARTUP-002`'s single-executable rule.

**B — An early argv branch in the packaged binary that hosts the runtime in-process.**

*For:* matches `REQ-MCP-033` exactly; nothing extra to locate on disk.
*Against:* it only works if the runtime can be hosted in the application's own language runtime.
`REQ-MCP-011` pins a third-party **distribution** at an exact version and `REQ-CONFIG-181` leaves its
identity open and permits it to change — so the runtime may well not be hostable in-process, and
committing the architecture to that constrains a choice the specification deliberately left open.

**C — An early argv branch that executes or supervises the bundled runtime, passing through all
remaining arguments and propagating its exit status.** Chosen.

*For:* satisfies `REQ-MCP-033`'s letter — the token is the sentinel, the process answers the protocol on
its standard streams, no window, the parent observes the server's own exit code — while leaving
`REQ-CONFIG-181`'s freedom intact. It also answers OQ-23 in the only way that makes `REQ-MCP-036` and
`REQ-MCP-099` work: the branch is a **general pass-through**, so the setup subcommands reach the runtime
unchanged.
*Against:* an extra process in the chain, and the branch must run before **anything** in the
application bootstrap that could open a window, write to standard output, or install a crash handler
that writes to standard output — a real ordering hazard, since anything on standard output corrupts the
JSON-RPC stream.

## Decision

**Alternative C, subject to OQ-23 being confirmed.**

- The packaged binary's entry point begins with: **if the first argument is the reserved token, hand
  the remaining arguments to the bundled runtime and propagate its exit status; do nothing else first.**
  No application bootstrap, no window, no writing to standard output, ever, on this path. On Windows
  this branch needs the runtime's node-mode environment flag or an equivalent, which is a spike item.
- The bundled runtime's location inside the packaged resources is resolved **by the branch**, not by
  command resolution — command resolution's only job is to recognise the token and report the entry
  unconditionally available.
- **The binding manifest is generated at build time, not hand-maintained.** The build starts the pinned
  runtime, reads its tool listing, and emits a module containing the tier membership and the never-grant
  names, then asserts `REQ-MCP-015`'s cardinality, disjointness and coverage checks. This is the
  difference between a manifest that is *checked* against the runtime and one that **is** the runtime's
  answer; `REQ-MCP-015`'s "an upstream rename fails a build rather than silently degrading a grant" is
  only true of the latter.
- The version cross-check of `REQ-MCP-095` is the same kind of build assertion over the shipped default
  entry and the setup manifest.

## Open question carried

`REQ-MCP-033` describes the sentinel branch **only** as an MCP server on standard streams, while
`REQ-MCP-036` derives a command line from the same entry and `REQ-MCP-099` runs it with the runtime's
three setup subcommands. **Recommended reading: the sentinel branch is a general pass-through, and
`REQ-MCP-033` describes what happens when the remaining arguments select the server.** Confirm, because
it changes what the packaged binary's early-argv branch must do. If it is answered the other way, one
of the two requirements must change. See OQ-23.

## Consequences accepted

1. The application entry point acquires a **pre-bootstrap branch that must never be reordered.** Guard
   it with a test that runs the packaged binary with the sentinel and asserts: valid JSON-RPC on
   standard output; **nothing else** on standard output; no window; and the runtime's own exit status.
2. The build depends on being able to execute the pinned runtime, so continuous integration must be able
   to install it. That is already implied by `REQ-MCP-015`'s coverage check.
3. The sentinel is an argv surface that `REQ-STARTUP-015` and `REQ-MCP-033` both intend to be internal.
   It must be undocumented and unadvertised, and it must be inert if discovered: the branch's worst
   outcome is a process speaking a protocol on its streams.

## Revisit if

`REQ-CONFIG-181`'s chosen runtime turns out to be hostable in the application's own language runtime
after all, making alternative B available and removing a process from the chain; or OQ-23 resolves
against the pass-through reading.

## First execution — 2026-09-06, Part T (the two spikes, the bundle, the branch, the manifest, the client's owed halves, the setup)

*Recorded under GD-10. The runtime is Serena — `serena-agent` **1.7.0** (MIT) on Python **3.13.15**, the owner's
decision of 2026-09-05 — bundled at build time with uv 0.12.5; the proof is `pnpm code-intel-proof` (seven launches,
`.code-intel-proof/results.json`); the spikes are `spikes/code-intelligence-bundle.md` and
`spikes/code-intelligence-branch.md`. OQ-23 is resolved with the recommended reading; spike-list item 5 is taken;
IC-7 is proposed. The status of this record stays as it is: the owner adopts or refuses IC-7.* **Adopted 2026-09-06 in its
second form, ESC-32 — see the note "IC-7 adopted" below.**

**The mode that worked, and why.** Electron's own main entry with the token **first** — and `--` second. Two things the
platform does before any JavaScript of ours runs, neither anticipated here (the spike's §1–2): a scheme-looking
positional followed by another positional exits the binary −1 in ~55 ms (`Rotaris.exe builtin:code-intelligence
start-mcp-server` never reaches the branch; `Rotaris.exe builtin:code-intelligence -- start-mcp-server` does, on the
development and the packaged binary alike), and the binary writes CR LF to standard output ~50 ms after start when it
is a pipe (`electron --version` too; `ELECTRON_NO_ATTACH_CONSOLE` changes nothing). So the launch is
`<exe> builtin:code-intelligence -- <args>` — `REQ-MCP-033`'s letter holds, the `--` is the branch's separator and the
branch drops it — and the transport drops whitespace before the first message and nothing else. `ELECTRON_RUN_AS_NODE`
was not needed and cannot load the main bundle anyway (an ES-module `import 'electron'`). The branch is
`main/sentinel.ts`, main's first import: a **synchronous** spawn with the parent's own pipes, so main's body — the
machine id, the data directory, ADR-0055's claim — is never evaluated on this path; the decision's "no writing to
standard output, ever, on this path" is true of us and false of Electron by one blank line, recorded. The runtime's
per-user home (`SERENA_HOME`, under the product's data directory) is seeded once with the runtime's own configuration
template, its dashboard, browser tab and log window off: `REQ-MCP-033`'s "no user interface of any kind" is otherwise
false — the runtime starts a web dashboard and opens a browser tab by default, and a partial configuration is refused
(the bundle spike §1).

**Consequence 1's four observables, measured** (the branch spike §4; the proof's launch 1 on the development entry and
on the packaged `Rotaris.exe`): `initialize` at 4,507–4,556 ms and `tools/list` at 5,523–5,571 ms (22 tools under a
project; `activate_project` and `get_current_config` withheld, `REQ-MCP-034`); the preamble `0d0a` and no non-JSON line;
`Rotaris`/`electron` and `python` the only processes started, window handle 0 at every one of 12 samples; exit 0 on
stdin's end, 2 from the runtime's argument parser, 1 when the runtime is killed — the runtime's own code every time.

**The bundle.** 175.4 MB in 10,602 files under `resources/code-intelligence/runtime/` (143.7 MB as installed, +36 MB
of bytecode compiled once at build so a read-only installation never compiles on import, −4 MB trimmed: the
console-script launchers, which embed their build path, and the C headers); no virtual environment (a venv records the
base interpreter's absolute path); the marker `bundle.json` carries the pins' hash and the interpreter's own answers.
`pnpm package` runs the bundle step first (idempotent on the marker), then the manifest check, and `afterPack` asserts
the interpreter answers Python 3.13.15 and serena-agent 1.7.0 from inside `win-unpacked` (167.2 MiB there, 10,603
files) — the packaged build passed end to end in 353 s with IC-6's rules green. The build fetches (uv by version and
hash when the machine's differs from the pin, the interpreter, the wheels); the product never does — **except the
runtime's language servers**, below.

**The manifest, generated.** `scripts/code-intelligence/manifest.mjs` starts the bundled runtime with the shipped
arguments (`start-mcp-server --transport stdio --context ide`; the runtime's "context" is `REQ-MCP-010`'s
host-integration mode — it withholds `create_text_file`, `read_file`, `execute_shell_command`, `find_file`, `list_dir`
and keeps `search_for_pattern`), reads `tools/list` (**24** names without a project, 3.6–4.0 s), its version and the
extensions its language servers index (every language with a positive default priority, 63 languages), and emits
`config/src/mcp/code-intelligence-manifest.generated.ts`; the tiers are held by capability and bound to names in the
generator, the checks are 10/7/2/1, disjoint, no never-grant name inside, every name reported. **One reading, recorded:**
the never-grant `open_dashboard` is not in the server's listing under the shipped arguments (the interface is off), so
the three never-grant names are checked against the runtime's whole vocabulary (its own `tools list --all`, 52 names)
while the twenty tier names are checked against the server's listing; both listings are in the module. The module is
committed (`pnpm check` needs no Python: the test checks the pin against `pins.json` and the counts), regenerated and
diffed by `pnpm package`, and a doctored module is refused (the proof's launch 6). `REQ-MCP-016` holds by inspection:
every persona carrying the server has `read_file`, `grep` and `glob` in the engine's persona table. `project-initializer`
is not a built-in role of this build, so the ONBOARDING tier is generated, checked and granted to nobody — stated.

**What the runtime fetches — IC-7.** Its language servers, at first use of a language, into the per-user home: for
TypeScript `npm install typescript@5.9.3` then `typescript-language-server@5.1.3` (needing `node` and `npm` on PATH),
for Python `uvx --from pyright==1.1.403` (needing `uv` on PATH and PyPI). Measured three ways: in the spike with
outbound blocked (TypeScript succeeded from npm's own cache in 165 s; Python failed to reach PyPI in 17 s), in the
proof's launch 4 on the development entry (the first symbol overview on a TypeScript file took 241 s while the server
was provisioned, then answered `{"Class": ["Counter"], "Function": ["greet"], "Interface": ["Greeter"]}` with
`tool.start` before `tool.finish`), and in launch 7 on the packaged binary with outbound blocked and an empty npm
cache (`tools/list` at 4,909 ms; the overview errored with the runtime's own text naming `npm install
typescript@5.9.3`). Serena can be pointed at pre-provisioned servers; the two that matter first are Node programs, so
a self-contained bundle means shipping a Node runtime too — the owner's decision, proposed as IC-7 with three ways to
discharge it. The mechanism is complete with the bundle as it is.

**IC-7 adopted — option 2, ESC-32 (the manager, 2026-09-06).** The owner read the servers as tools provisioned after
installation, the way Git and ripgrep are. The specification carries it (`REQ-STARTUP-159/058/142/064`, `REQ-MCP-116`
amended in place; `REQ-MCP-118` minted for the disclosure), and the mechanism carries it in three places, none of
them a new process or channel: **the pins** (`pins.json` `languageServers`: TypeScript's `typescript` 5.9.3 and
`typescript-language-server` 5.1.3 through `npm`, Python's `pyright` 1.1.403 through `uvx`, each with source and
licence), **the generator's check** — it imports the runtime's own defaults (`DEFAULT_TYPESCRIPT_VERSION`,
`DEFAULT_TYPESCRIPT_LANGUAGE_SERVER_VERSION`, `PYRIGHT_VERSION`) and asks the runtime where it stores servers
relative to its home (`language_servers/static`), refusing a pin the runtime would not fetch — and **the
disclosure** (`McpSetupStatus.provisioning`, on every status the run host publishes, idle included; the card's
"Language servers" block, text only). **First execution of the check:** a doctored `pyright` 1.1.402 was refused
with the runtime's 1.1.403 named; the true pins were accepted; the committed module equals a fresh generation.
`pnpm code-intel-proof` launch 5 read 3 declared packages and the store path on the card (present in the
proof's profile), and checked them against launch 4's provisioning lines (not exercised (the profile was warm)); launch 7 on the
packaged binary, outbound blocked: tried typescript@5.9.3 — a declared package at its declared version. **Found nothing** in the mechanism; the sentinel's restated
home segment is now pinned to `CODE_INTELLIGENCE_HOME_SEGMENT` by a test, which it was not before. **What stays
on IC-7:** the notices generator's section (`REQ-STARTUP-141/142/143`), not built — the condition binds the
release until it lists the servers.

**IC-7 discharged — the notices generator lists the servers (2026-09-27, `first-release-plan.md` §4.3).**
`pnpm notices` (`tools/notices/`) reads `pins.json` as the setup manifest this build carries and writes its
`languageServers` into `THIRD-PARTY-LICENSES.txt`'s `Tools provisioned after installation` section. The sub-heading
names this runtime (`serena-agent 1.7.0`), and each of the three packages appears with its language, version, source
and licence. The generator also reads the runtime itself as part of the shipped closure: the interpreter (`CPython`
3.13.15 from the bundle marker's own answer, `PSF-2.0` read from its `LICENSE.txt`) and every distribution in its
site-packages, 73 on the Linux bundle, with the identifier each declares and its licence files. **What that first
read found in this record's tree:** `dotenv` 0.9.9, which `serena-agent` requires, declares `License: UNKNOWN` (OQ-74),
and `proxy_tools` 0.1.0, which `pywebview` requires, ships no licence text at all. Both fail notices validation until
a ruling or a maintainer's review. The runtime's own `LICENSE`, the one copy this record's bundle note named, is now
one entry among those. *Corrected the same day by the generator's gate review:* two more distributions carry no
licence text. `certifi` 2026.7.22 carries only MPL-2.0's Exhibit A. `mslex` 1.3.0 carries only Apache-2.0's per-file
notice, beside an `AUTHORS.rst`. Each file only refers to the licence. The first run had counted any non-empty licence
file as the text (OQ-75). Both now wait on a maintainer's review (O-11), as `proxy_tools` does.

REQ-STARTUP-015's "exactly one copy" of the tool server's licence text meets a second copy when first-release-plan.md
§4.4 carries the notices file into the artifact. That step decides which copy stands. *Decided 2026-09-27 by §4.4: the
notices file's copy stands, because REQ-STARTUP-142 requires it there, and the copy under `serena_agent`'s dist-info is
filtered out of the artifact (`electron-builder.yml`). The runtime tree this record builds keeps it, because the
generator reads it there. `afterPack` counts the copies in the artifact (ADR-0054, "The two bundled assets"). The
runtime reads nothing from the file, so this record's mechanism is unchanged.*

**The client's owed halves, alive** (ADR-0034's note beside this one): `code_intelligence` ships **enabled** —
`REQ-CONFIG-181`'s deviation of 2026-09-05 reverted, its record kept in `defaults.ts`; the grant tiers on the built-in
personas (12 or 19 names; the proof's discovery launch: the orchestrator's 12, the block present in the section, the
child row's `granted_mcp` 12); discovery of the real server in 4,043 ms, connect 4,180 ms, the binding probe
`hook code_intelligence:ok`; the workspace binding on every launch line (`--project <root>`, two launches per run as
ADR-0034 consequence 2 says). The isolated-tree case of `REQ-MCP-034` is a gap surfaced by the binding coming alive
(ADR-0034's note): the configuration resolves per workspace, not per run's tree; owed.

**The project setup** (`REQ-MCP-099` in `packages/mcp/src/setup.ts` and `run-host/mcp.ts`; `REQ-MCP-112`'s action on
the MCP category): the derived invocation `Rotaris.exe builtin:code-intelligence --` (`REQ-MCP-036`), the contains-code
walk, the three steps as children of the branch — measured on the proof's five launches: three `succeeded` and the
marker written (creation 3.6 s, indexing 5.4 s, memories 3.6 s on a one-file workspace with the language server warm —
each step pays the runtime's ~3.5 s import; the whole launch, window and all, 91 s under the proof's fixed wait);
again → creation skipped, nothing overwritten; a workspace without code → `succeeded, skipped-no-code, skipped-no-code`;
an entry whose arguments lack the launch subcommand → the non-retryable "not a local launch" text and three
`not-attempted`; a cancel while creating → `failed` (terminated), two `not-attempted`, outcome cancelled. **Two readings,
recorded:** a creation skipped on the marker is reported `succeeded` with the detail saying so (the status vocabulary
of `REQ-MCP-099` is closed and has no "skipped-present"); and the runtime auto-creates its marker whenever a server is
started with `--project`, so after any run the creation step is the skipped case — the proof removes the marker to
exercise creation for real — and doing so found a third: **the runtime's creation subcommand is interactive by
construction** (`interactive=True` in its CLI), asking once per further language it detected beyond the main one
whether to enable that server, reading the answer from standard input, and treating end-of-file as a failure (exit 1,
the proof's first attempt on a workspace holding TypeScript beside Markdown and YAML). `REQ-MCP-099`'s "UTF-8 *input*
encoding" is read as the anticipation of a fed standard input: the runner answers every prompt with an empty line, the
runtime's own default (that language not enabled — the main language only, which is what its non-interactive
activation does), then closes the stream. The machine-setup half of `REQ-MCP-112` and the warm steps of `REQ-MCP-095/096` are not
built: they belong with the onboarding task registry (`REQ-MCP-045/098`), which does not exist, and the bundle makes
them moot for this server; the card says so.

**Two costs the enabled entry puts on every process, stated for the owner:** ADR-0034's discovery-ahead
(`McpHost.prepare`) interrogates every server any built-in persona carries and the first turn's `ready()` awaits them
all, so the first run of every application process now waits ~4–5 s for the runtime's discovery — twelve personas carry
it — whether or not the run's persona does (the MCP proof's 9 s windows found this first: its scratch configuration now
declares the entry `enabled: false`, with the reason beside it, so that proof measures its fixtures as before); and the
runtime's own INFO logging on standard error reaches the run host's log line by line through the redaction pass — about
a hundred lines per launch. Neither is a defect of a recorded mechanism; both are what an enabled third-party runtime
costs, and the second is a log-volume question for whoever next tunes the log. The MCP category's "Check status" probes
the row too (available unconditionally, `REQ-MCP-037`): **healthy, 22 tools, in 4,218 ms** on the MCP proof's settings
launch — the first time that row has read anything but `spawn … ENOENT`; the proof's second click moved from 6.5 s to
12 s to fall after the longer round.

**Found in existing code:** nothing — every finding above is the platform's (Electron's two behaviours) or the
runtime's (the dashboard, the partial-configuration refusal, the auto-created marker, the interactive creation, the
fetched language servers). The tally stands.

**Not built, said so:** the language servers beyond what the runtime provisions itself (IC-7); macOS and Linux bundles
(IC-3; `bundle.mjs` refuses off Windows); ~~the notices generator's section for the runtime (`REQ-STARTUP-142`)~~
**built 2026-09-27** (IC-7 discharged, above); the
machine-setup half of `REQ-MCP-112` and `REQ-MCP-095/096`; the ONBOARDING tier's persona; the dashboard and
project-switching tools (never granted by design); the isolated-tree binding; nested `.gitignore` files in the
contains-code walk (the root file only).

**At the merge (the manager, 2026-09-06).** Two consequences of the enabled entry surfaced only on the merged tree. The
runtime creates `.serena/project.yml` in the workspace root whenever it starts with a project (finding 5 above), so with
`enabled: true` every first run left an untracked directory in the user's repository — the Git proof's isolated launch
found the base tree dirty. The reading taken, flagged for the owner: the load's `.gitignore` amendment (REQ-CONFIG-013,
REQ-MCP-089) keeps the marker's directory ignored beside `.rotaris/`, the name taken from the generated manifest
(`keepScopeDirIgnored`, `packages/config/src/load.ts`); the proofs seed both. And the ≈4.5 s discovery at every process's
first run (finding 6) pushed five proofs' fixed windows: Part J, resilience, fetch and mission now switch the entry off
in their scratch configuration, config carries the cost in its window, and IC-6's packaged launch reads `session running`
at its 9 s capture where it read `completed`. A stray `builtin/` directory in the main checkout dated from the branch
spike: the Bash tool resets its working directory to the main checkout, so a token launch of the pre-sentinel build
there took the token for a workspace path (REQ-STARTUP-163) and Windows's stream syntax made a directory of it —
unreachable now that the sentinel precedes `workspaceFromArgv`; removed, not committed.

