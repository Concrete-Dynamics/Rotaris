# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-10)
- **Depends on:** ADR-0002, ADR-0033, ADR-0054
- ~~**Blocked by an open question (OQ-23) about what the sentinel branch must do.**~~ *OQ-23 resolved 2026-09-06 with
  the recommended reading; built and first executed the same day (Part T), see "First execution" below (corrected
  2026-10-13, fin41).*

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
`pnpm notices` (`tools/notices/`) reads `pins.json` as the setup manifest this build carries *(since 2026-09-28 it reads
the shipped `apps/desktop/resources/setup-manifest.json`, whose `languageServers` a test holds equal to `pins.json`;
`pins.json` still names the runtime; ADR-0054, "The setup manifest")* and writes its
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

*Added 2026-10-23 — the closure frozen.* "Built from committed pins" held for the interpreter, the distribution and uv
only: every dependency below `serena-agent` was resolved on the day of the build, and the release run 39948115668
(`build (windows-x64)`, `v0.1.0rc1`) refused notices validation on `certifi` 2026.10.23 — the third `certifi` the same
commit had built on three hosts — and on `clr_loader` 0.3.1, a Windows-only dependency no Linux bundle had carried
([note](../../defects/fixed/the-code-intelligence-bundle-pins-serena-agent-and-not-its-dependencies.md)). The closure is
now committed beside `pins.json`: `closure.lock`, 84 distributions resolved once for every target
(`uv pip compile --universal`), each at one version with the sha256 of every file the index offers, and
`closure-build.lock`, the setuptools that builds `proxy-tools` (the one distribution that publishes no wheel).
`bundle.mjs` installs exactly that (`--no-deps --require-hashes --only-binary :all:` but for `proxy-tools`,
`--build-constraints`), checks it with `uv pip check`, hashes both locks into the marker (recipe 5), and writes the
interpreter's own list of installed distributions into the marker's answers. `pnpm code-intel:lock` rewrites the locks
from the pins. Two fresh Linux bundles installed the same 73 distributions; a Windows-x64 tree assembled on Linux from the
pinned interpreter and the lock, 75 distributions besides `pip`, met the runner's two refusals exactly, and both trees
pass `pnpm notices` byte-identically twice after one exact review each (`reviewed-exceptions.json`: `certifi` 2026.10.23,
and `clr_loader` 0.3.1 as an identifier entry).

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
(IC-3; `bundle.mjs` refuses off Windows *(corrected 2026-10-21: since OQ-400's target work it refuses off Windows and Linux — "only Windows and Linux bundles are currently supported" — and builds a Linux x64 tree; macOS stays refused)*); ~~the notices generator's section for the runtime (`REQ-STARTUP-142`)~~
**built 2026-09-27** (IC-7 discharged, above); the
machine-setup half of `REQ-MCP-112` and `REQ-MCP-095/096`; the ONBOARDING tier's persona; the dashboard and
project-switching tools (never granted by design); the isolated-tree binding; nested `.gitignore` files in the
contains-code walk (the root file only).

**At the merge (the manager, 2026-09-06).** Two consequences of the enabled entry surfaced only on the merged tree. The
runtime creates `.serena/project.yml` in the workspace root whenever it starts with a project (finding 5 above), so with
`enabled: true` every first run left an untracked directory in the user's repository — the Git proof's isolated launch
found the base tree dirty. The reading taken, flagged for the owner: the load's `.gitignore` amendment (REQ-CONFIG-013,
REQ-MCP-089) keeps the marker's directory ignored beside `.rotaris/`, the name taken from the generated manifest
(`keepScopeDirIgnored`, `packages/config/src/load.ts`); the proofs seed both. *Replaced 2026-10-01, under
[OQ-161](../open-questions.md):* the reading was never raised as a question, and the live runs of that day measured its
cost — the load changed a file the user tracks before any agent ran, every agent that checked its work reported a
`.gitignore` change it had not made, and the duress run spent an unrequested child (319 s) finding out who had. The load
now appends `.rotaris/` alone, and writes the marker's directory to the repository-local exclude file (`info/exclude` in
the repository's common directory), which Git honours and nobody tracks, so the Git proof's base tree stays clean without
the user's `.gitignore` changing. OQ-161 holds the owner's ruling (*ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the current behaviour is accepted*); the proofs still seed both lines in their own
fixtures. *Revised 2026-10-07 under OQ-215 ([R-072](../../product/requests.md#r-072)):* the marker's directory is also a
hard-coded search and listing ignore component ([`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012), the name read from the
manifest), so the file tools no longer list the runtime's files as the user's; the exclude line and the marker's place in the
workspace root are unchanged. *Revised again 2026-10-07 under OQ-230 ([R-072](../../product/requests.md#r-072)):* the duress
run at `a68f121` found the file tools clean and the terminal carrying both directories into the user's report, answer and a
project memory, so every agent now receives a product statement naming them (`PD-TOOLS-012` revision 2,
`PRODUCT_DIRECTORIES_UNIT`); the runtime, its marker and its memories are unchanged. And the ≈4.5 s discovery at every process's
first run (finding 6) pushed five proofs' fixed windows: Part J, resilience, fetch and mission now switch the entry off
in their scratch configuration, config carries the cost in its window, and IC-6's packaged launch reads `session running`
at its 9 s capture where it read `completed`. A stray `builtin/` directory in the main checkout dated from the branch
spike: the Bash tool resets its working directory to the main checkout, so a token launch of the pre-sentinel build
there took the token for a workspace path (REQ-STARTUP-163) and Windows's stream syntax made a directory of it —
unreachable now that the sentinel precedes `workspaceFromArgv`; removed, not committed.

**As root on Linux — 2026-09-28 (R-062).** The first execution of the launch on a host that needs Chromium's
`--no-sandbox`: a cloud container, the development entry driven as root. The reserved token's launch was the executable
with the token and `--` only, so the child — a fresh Chromium — inherited nothing and died with SIGTRAP before the
sentinel ran; the project setup's `create` step failed, `index` and `memory` were not attempted
(`../../defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md`). None of REQ-MCP-033,
REQ-STARTUP-002 and REQ-STARTUP-015 says whether the launch carries the parent's switches: raised as **OQ-82**, built
as "exactly the sandbox switch the parent was started with, immediately before the token, nothing else". Measured on
the repaired build, driven as root under Xvfb against a scratch workspace holding one TypeScript file: the launch line
reads `electron out/main/index.js --no-sandbox builtin:code-intelligence --`, and `create` now exits **127** with the
sentinel's own "the bundled code-intelligence runtime is not present in this installation" — the child reached its
JavaScript. Not shown: the runtime serving as root, because `apps/desktop/resources/code-intelligence/` is absent on
this tree and `bundle.mjs` refuses off Windows (above), so `pnpm code-intel-proof` could not run. Nothing in the sentinel's
own behaviour changed; it finds the token past the one switch.
**Corrected the same day — the token stays first.** The placement above put the switch in front of the token and read
REQ-MCP-033's "first argument" as the first argument that is not the switch; the verifier found that a stated clause
reinterpreted. The launch is now the token first and the switch between it and `--`
(`electron out/main/index.js builtin:code-intelligence --no-sandbox --`; packaged `Rotaris builtin:code-intelligence
--no-sandbox --`): the sentinel reads the token at its fixed index again and drops the switch standing before the
separator, so the runtime never receives it. Measured as root on this tree: `electron out/main/index.js
builtin:code-intelligence --no-sandbox -- start-mcp-server` reaches the sentinel (exit 127, "not present"), the same line
without the switch dies with SIGTRAP (exit 133); the driven app's `create` line reads
`… builtin:code-intelligence --no-sandbox -- project create <root>` and exits 127 at the sentinel; and with a stand-in
`bin/python3` (a shell script writing its arguments, placed under the git-ignored `apps/desktop/resources/` and removed
after) the runtime received `-c <entry> start-mcp-server --transport stdio` — no switch — and its exit status 7 was
propagated. **Unmeasured on Windows (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*):** the 2026-09-06 spike's quirk is a scheme-looking positional FOLLOWED BY
another positional exiting before JavaScript; `--no-sandbox` is a switch, not a positional, and a packaged Windows
parent does not normally carry it, but `Rotaris.exe builtin:code-intelligence --no-sandbox --` has not been run.
*Reported back 2026-10-21, development half (the Windows ARM64 session's F2; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, uv 0.12.5 aarch64, built at `af692eea`):* `electron.exe out\main\index.js builtin:code-intelligence --no-sandbox -- start-mcp-server --transport stdio --context ide` with an `initialize` line on standard input answered it (preamble `0d0a`, then the JSON result) and exited 0 in 3.5 s once standard input ended — not the quirk's early exit; `-- no-such-subcommand` exited 2 from the runtime's parser; with standard input held open the runtime's `python.exe` line read `-c "from serena.cli import top_level; top_level()" start-mcp-server --transport stdio --context ide`, no `--no-sandbox` and no `--`. `Rotaris.exe` is still not run: no Windows package exists on this host.

**The proof's branch client — 2026-09-28 (R-062).** Consequence 1's observables are read by `code-intel-proof`'s launch 1
through a raw JSON-RPC client, and that client resolved a request only when its answer arrived: a branch that exited
without answering left section 1 waiting for ever (twice, 8 and 12 minutes, killed). The client is now
`apps/desktop/scripts/lib/line-rpc-client.mjs`, which rejects every pending request on the child's exit, failure or
guard kill with the exit status and standard error's tail (`line-rpc-client.test.ts`, 12 cases over a fake child;
`../../defects/fixed/code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md`). Its first execution
against the built branch, as root under Xvfb on Linux, drove the token-first launch to the sentinel's exit **127** in
192 ms with the sentinel's "not present" line in the rejection. It also found that the proof launches the token in the
order this ADR's correction retired — `--no-sandbox` ahead of the token — so as root the proof starts the application,
not the branch, and section 1 fails at the guard (`../../defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md`,
recorded, not repaired). Not shown: section 1 passing, which waits for that note and for a tree with the bundle.

**The proof on Linux as root — 2026-09-28 (R-062).** The note above was reproduced, then repaired in the proof: `branch()`
and `exitStatus()` launch the token first and the switch between it and `--`, this ADR's corrected order, and
`lib/launch-sites.test.ts` now fails any token launch that puts something other than the entry ahead of the token
(`../../defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md`). Section 1 then
**passed**: `tools/list` at 2,065–2,400 ms on the development entry across the three passing runs, 22 tools under a project (`list_memories` present,
no project switching or configuration introspection), nothing on standard output before the first `{`, exit 0 on
standard input's end, an unknown subcommand exiting the runtime's 2. The first full run went on to find a second
harness defect. Every launch rewrote the workspace file without an `initialization:` section, so ADR-0064's background
`code-intelligence-setup` started at each open. Section 5's click met it and was refused "already running", correctly
(`../../defects/fixed/code-intel-proofs-setup-launches-collide-with-the-background-initialization.md`). The proof's
workspace file now records that task as skipped. Then the whole proof passed **three runs in a row** (521 s, 522 s and 521 s, as root under Xvfb, Node 24, `--skip-build`), with
nothing else running on the host: the discovery grant of 12 and the memories block, both launch lines carrying
`--project`, `get_symbols_overview` naming `Greeter`, `greet` and `Counter` after provisioning TypeScript 5.9.3 and
typescript-language-server 5.1.3 through the host's proxy (the disclosure true to the runtime), the five setup launches,
and the drift refused. **What it could not show:** the no-window check of consequence 1 is recorded as not measured
off Windows, because its sampler is `Get-Process` and this host has no window lister. A window opened on Linux would fail
consequence 1 as surely as one on Windows; the instrument is what is missing. The packaged half of section 1 and section 7
need `win-unpacked`, and no Linux artifact may be produced (IC-3), so IC-7's contained run is untouched. Nothing on
Windows was run.
*Reported back 2026-10-21 (the Windows ARM64 session's F2):* on Windows the no-window check ran — "sampled 12", "sampled 16" and "sampled 14 time(s)" in three whole runs, the windowed list empty each time (section "The proof on Windows 11 ARM64").

**The fix round, 2026-09-29.** The whole proof was run three more times, and run 2 went red in section 5's
`setup-again`. The product was not at fault. The open's `No model provider is authenticated yet` notice, raised at
the 800 ms slot, landed at the same instant as the capture seam's fixed-time press on the `MCP Servers` category. It
moved the list two rows, so Settings opened on Instructions and Start was never on screen. The setup launches now wait
for what they press. Start is pressed once it is drawn enabled, Cancel once it is drawn, and `MCP Servers` is pressed
again at 3 s and 6 s if it is not selected
(`../../defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`). The shared seam's press stays as
it is, and its note stays open, since nine other proofs use it
(`../../defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`). *(Reported back 2026-09-30 under R-067: the seam's press is now verified — read
again and pressed again until the category carries `is-selected`, or logged as never selected at 5 s — and the note is
repaired.)* With the correction
forced (the seam pointed at Instructions), section 5 passed. The whole proof then passed three runs in a row (522 s,
521 s, 524 s), with another agent's proofs sharing the host in two of them. In one launch the banner deflected the
seam's press again, and the correction put Settings back. *(Corrected by the next section: that correction did not hold, and the
three runs in a row were not what the branch does.)*

**The second fix round, 2026-09-29.** The verifier ran the same build seven times (three whole, four `--steps=5`) and
`setup-cancel` went red three times, always the same way. Start was pressed at the instant of the notice and of the
seam's category press. The seam's press, read before the notice and delivered after it, moved Settings to a category
above, so Cancel had left the screen when it was pressed, and the press gave up. The 3 s correction came after `create`
had already succeeded (about 1.8 s), and there was nothing left to cancel. The product was again not at fault. The
setup launches now leave the shared seam alone. They open Settings with the `Ctrl+7` chord, and every press, the
category's included, waits until the notice has been drawn (`body:has([data-testid="notice"])`), so no point is read
before the launch's one layout shift. No assertion changed
(`../../defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`, reopened and repaired again; the
seam's note stays open). **Measured** as root under Xvfb, Node 24, `--skip-build`: four `--steps=5` runs in a row
passed (238 to 242 s). All 20 setup launches pressed Start 31 to 123 ms after the notice, and all four `setup-cancel`
launches pressed Cancel while `create` ran and read `Cancelled`. Then three whole runs in a row passed (529 s, 528 s, 524 s), with another agent's proofs on the host for parts of
all three: Start 41 to 128 ms after the notice in all 15 setup launches, Cancel pressed and `Cancelled` read in each
`setup-cancel`, the window check recorded not measured on linux, and the drift refused. **What it could not show:** anything on
Windows; the packaged branch and section 7 (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*), as before.
*"Not measured: Windows" reported back 2026-10-21 (the Windows ARM64 session's F2):* the development half ran there, three whole runs green, the setup launches among them (below, "The proof on Windows 11 ARM64"); the packaged branch and section 7 are still owed.

**The setup at the run host's shutdown, and what a step started (2026-10-01).** REQ-MCP-099's termination (ask, 5 s
grace, force-kill) reached only the step itself on POSIX. `child.kill` signals one process, and the step was spawned
without a process group, so a process the step had started outlived its cancellation. The run host's `shutdown` never
reached the setup at all: the host exited with the step running, and the step and what it had started were orphaned.
REQ-WORKSPACE-092 says nothing the step launched, "neither the command the step itself started nor anything descended
from it", may still run 5 s after a cancellation or after the application closes
(`../../defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).

Each step now leads a process group of its own (`processGroup`), and the ask and the force-kill go to the group. The
grace ends when no member of the group still runs; a zombie that nobody reaps does not count, because a container's pid 1
may never reap one. The run host's `shutdown` calls `McpHost.endSetup`: the step is stopped as a cancellation is, but
with a 2 s grace (`SETUP_SHUTDOWN_GRACE_MS`, the build's figure inside REQ-WORKSPACE-109's 5000 ms close), and that
grace also shortens a cancellation's grace already under way. The host exits only once the step has gone. Windows keeps
`taskkill /T`. At an orderly quit the window's close cancels the run a few milliseconds before the shutdown arrives, so
REQ-MCP-099's 5 s cancellation grace is never given at a close: the build reads REQ-WORKSPACE-109's 5000 ms and
REQ-WORKSPACE-092's 5 s as binding there, a conflict between the requirements raised as
[OQ-172](../open-questions.md) (2026-10-01, on the verifier's finding).

*Ruled 2026-10-06 ([R-071](../../product/requests.md#r-071)): the owner took OQ-172's recommendation, and
[`PD-MCP-003`](../../product/directives/pd-mcp-003.md#pd-mcp-003) gives every stop of a step the same 2 s grace — a Cancel, a
workspace switch's cancellation and an exhausted budget as well as the close. `SETUP_TERMINATE_GRACE_MS` is 2 s and
`SETUP_SHUTDOWN_GRACE_MS` equals it, so the 5 s cancellation grace this round kept outside a close is gone; it had left a
switch's step running 5.489 s and a Cancel's 5.603 s on Windows (`workspace-proof`, 2026-10-02). Pinned in
`packages/mcp/src/setup.test.ts`, red on the 5 s before it.*

**Measured** on the built app at an orderly quit (`driver.quit()`), as root under Xvfb, Node 24, with two kinds of step.

A stand-in `code_intelligence` launch held `project create` and started a descendant. On the build before, both were
still running 5 s after the application exited, which took 169 ms. With the repair:

- a step that ends on SIGTERM: both were gone, and the quit took 419 ms;
- a step and descendant that both ignore SIGTERM: both were force-killed, and the quit took 2234 ms.

The bundled runtime, quit during `index` on a 400-file Python project: its sentinel and Python process were gone 5 s
later on the build before as well. ~~The runtime ends itself when its pipes close, so the bundled runtime alone never
showed the defect.~~ With the repair the quit took 473 ms and nothing was left.

*Corrected 2026-10-15 (fin47, acceptance finding A5,
[`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](../../defects/fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md)):*
the struck sentence is falsified for an index that pyright serves. Two `settings-proof` launches at `3c03287` ended
through the capture seam's immediate exit, which kills the run host without its `shutdown`, while the runtime indexed
`apps/desktop`. The serena `python3` process and `uv` / `pyright-langserver` were still running more than 6 s after the
application's group had ended, until the harness ended them with SIGKILL. The measurement above was taken
through the orderly quit, while the step was still spawned undetached. Why nothing was left then was not measured, and
it does not show that the runtime ends itself. The orderly quit is unaffected: the run host's `shutdown` ends the setup. A run host that ends without it leaves the step,
in its own group and session, running. That is OQ-169's ruled case (PD-WORKSPACE-006).

Unit cases: two in `packages/mcp/src/setup.test.ts` (descendant ended with the step; shutdown grace shortening a
cancellation's), both red on the code before; one in `apps/desktop/src/run-host/mcp.test.ts` for `endSetup`; one in
`apps/desktop/src/run-host/dispatch.test.ts` (added on the verifier's finding) that `shutdown` ends the setup before it
closes a store or schedules the exit, red with the call replaced by `Promise.resolve()`. `workspace-proof` scenario 8f
(added on the same finding) quits the built app in order while a stand-in step and a process it started both ignore
SIGTERM, and asserts the quit ends within 5000 ms through the shutdown ending the setup, with neither process running 5 s
after the exit; on the build with the call replaced it failed (quit in 138 ms, both pids still running). `init-proof`
passed all five scenarios with the bundle present, and `workspace-proof` passed (44 passed, 0 failed, 2 skipped; with 8f,
46 passed, 0 failed, 2 skipped). **Not measured:** Windows; a run host killed by a signal, whose step's group still
survives it (OQ-169); a step that exits by itself and leaves a process it started running in its group: `endSetup`
reaches only a step still running, so at a quit nothing ends such a process (the fixed note's "Not reached").
*Windows, 2026-10-20 (the Windows ARM64 session's B8; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`): measured. Scenario 8f quit the app in 2,706 and 2,713 ms,
both processes gone 5 s after the exit, in two `workspace-proof` runs (49 passed, 0 failed, 5 skipped each); "Windows keeps
`taskkill /T`" holds as the ask, which neither stand-in answers, so `/T /F` after the 2 s grace is what ends them. The
5.489 s and 5.603 s misses read 2.441-2.604 s from request to stopped step under PD-MCP-003. Still not measured there: a run
host killed by a signal (OQ-169).*

**The manifest carries the product's own words for one tool — 2026-10-06 (fin21; `PD-MCP-001`, the owner's ruling of OQ-115
under R-071).** The manifest was the runtime's answer and nothing else; it now also carries `productDescriptions`, written by
the product and keyed by capability, which `manifest.mjs` holds beside the tier map and checks only to name a capability of
the tiers (the runtime is not asked for them, so `--check` still compares a fresh generation byte for byte). The one entry is
the usage-instruction tool's, whose own description told every agent to read the manual first, so each did and re-sent its
7,000-plus characters with every later request (live-run finding L8). `filterServerTools` puts the product's text on the
bundled server's tool, so REQ-MCP-101's section and the tool definition both read it; the tool keeps its place in the read
tier. Regenerated against the bundled runtime here (serena-agent 1.7.0, Python 3.13.15, 24 tools listed), and
`code-intel-proof`'s discovery step asserts the section carries the product's sentence and not the runtime's imperative.

**The manifest carries a warm-up the runtime did not answer — 2026-10-14 (fin43; `PD-MCP-004`, OQ-273 ruled 2026-10-13 under
R-072).** *The reading this replaces, kept beside it:* the product drove the runtime as it is — every call forwarded as the
model made it and the runtime's result taken as the call's effect (OQ-273's "what the build proceeds under"), and the manifest
"**is** the runtime's answer" (the Decision above). Both were falsified for one capability by `code-intel-proof`'s eleventh
launch (fin42): the pinned runtime (serena-agent 1.7.0) answers a symbol rename before its TypeScript language server has loaded
the project, and renamed the declaring file alone while saying it succeeded. The manifest now also carries `warmUps`, a product
choice keyed by capability (the rename warmed by the referencing-symbol search, with the two arguments they share), which
`manifest.mjs` checks against the server's listing as strictly as the tiers (`warmUpRefusals` in
`scripts/lib/code-intelligence-warm-ups.mjs`: both tools listed, both arguments in both input schemas, or no module is written),
so an upstream rename still fails a build. The run host's MCP executor sends the search before every rename to the bundled server
and discards it, inside the rename's one allowance. Regenerated here against the bundled runtime (24 tools listed, `--check`
equal); `code-intel-proof` launches 10 and 11 green at load 0.7 to 2.7 on four CPUs (launch 11: "(2 changes applied)", both files,
no search row, 37.6 s), and launch 11 red with the warm-up switched off in the same build ("(1 changes applied)", the declaring
file alone). **Revisit with every pin change:** the warm-up rests on the runtime's internals, so a later pin may make it
unnecessary or insufficient; launch 11 is its acceptance gate and is re-run whenever `pins.json` moves.
*Found insufficient 2026-10-15 (fin47), the same pin:* the warm-up helps only where a `tsconfig.json` or `jsconfig.json` covers the
files. In a workspace with none (the live run's `todo-app` fixture, a Vite React shape) the TypeScript language server holds only
the open files, the runtime opens the declaring file alone, and the search answers `{}`: the live `rename` scenario at `3c03287`
renamed one file of three. The remedy is open as [OQ-362](../open-questions/65-spikes-and-later-questions-32.md#oq-362); `code-intel-proof` launch 13
(`child-rename-cold-js`) is red on it until a ruling is built, and joins launch 11 as a gate re-run on every pin change.
*Revision 2, built 2026-10-20 (loc1, `loc1-rename`; `PD-MCP-004` revision 2, OQ-362 ruled 2026-10-20 under R-072), the same pin:*
the manifest also carries `projectFiles`, a product choice keyed by capability beside `warmUps` — the symbol rename's project file:
the runtime's `typescript` language, the twelve extensions the runtime serves with it (read from the runtime's own file-name
matcher, as the indexed extensions are), the two names that count as a project file (`tsconfig.json`, `jsconfig.json`) and the one
the product writes (`jsconfig.json`) — checked by `projectFileRefusals` beside `warmUpRefusals` (a capability of the tiers, a
language the runtime names with an extension, or no module is written; regenerated here, `--check` equal). **The run host now
writes into the person's workspace for one call:** for a rename whose declaring file that language serves and no project file
covers up to the project root, the MCP executor places a `jsconfig.json` of the product's own there (one constant of the build,
`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`, created exclusively) for the search and the rename and removes it when the call ends, only
while its bytes are still the constant — the measured remedy that leaves the pinned runtime unpatched (OQ-273 and OQ-362 rejected a
patched distribution), so "the pinned release is the tree that runs" stays true. Measured over the bundled runtime's stdio server
(the file placed inside a live server session, four cases, every importer reached) and in the built app: `code-intel-proof`
launches 13, 14 (`child-rename-opened-js`) and 15 (`child-rename-cold-ts`) green, launch 11 green with no `jsconfig.json` written,
red without the clause in the same build. **Revisit with every pin change:** the clause rests on the TypeScript language server's
project discovery and the runtime's language names, so launches 11, 13, 14 and 15 are its gates and are re-run whenever
`pins.json` moves.

## The bundle is built for the artifact's architecture — 2026-10-15 (OQ-400, ruled under R-072)

*Dated note, fin47 (`fin47-record-and-windows-reading`).* The bundle step installed the interpreter by the bare version,
so uv picked a CPython for the build host's architecture, and the marker recorded none: on a Windows ARM64 host an arm64
`python.exe` would have entered the `windows-x64` artifact and answered every packaging check, since it runs there
([`../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`](../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md)).
[OQ-400](../open-questions/64-spikes-and-later-questions-31.md#oq-400) ruled the repair: `bundle.mjs` takes `--target=<platform>-<arch>` (the host by
default, for the development tree; `package.mjs` passes `win32-x64`), installs the interpreter by its full uv key
(`cpython-3.13.15-windows-x86_64-none`, `cpython-3.13.15-linux-x86_64-gnu`; `target.mjs`), writes `target` and
`targetArch` into `bundle.json` and `targetArch` into the pins' hash (recipe 4), so a tree built for another
architecture is rebuilt and `--check` calls it stale. **No `win32-arm64` pin is added** (OQ-400 (c)): that host takes
the pinned, hash-checked `win32-x64` uv, which Windows 11 ARM64 runs under its x64 emulation; uv is a build tool, never
shipped, so this is build provenance, never acceptance evidence. The packaging guard beside it is ADR-0054's ("runtime"
rule). First run on Linux x64, recorded in [first-executions](../first-executions.md) (the row of 2026-10-15, "The
bundle's target architecture and the packaging guard"): the full key installed `cpython-3.13.15-linux-x86_64-gnu` and
the tree answered as before; the first run on an ARM64 host is owed to its first `pnpm package`.

## The proof on Windows 11 ARM64 — 2026-10-21 (the Windows ARM64 session's F2)

Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, uv 0.12.5 aarch64, built at `af692eea`. **The bundle.** `pnpm code-intel:bundle --force` from PowerShell 7.6.6 with uv 0.12.5 aarch64 first on PATH exited 0 and logged "uv 0.12.5 on PATH equals the pin; used". With no `--target` it built for `win32-x64` on the `win32-arm64` host (`cpython-3.13.15-windows-x86_64-none`), as the 2026-10-16 repair makes a Windows ARM64 development tree do: `bundle.json` reads `target` `win32-x64`, `targetArch` `x64`, Python 3.13.15, `serena-agent` 1.7.0, 20,584 ms, 167.6 MiB in 10,607 files (137.3 MiB before trimming). All 75 packages installed in 3.1 s and none was built: PyYAML, psutil, tiktoken, ruamel.yaml.clib, pillow, cryptography, pydantic_core, regex, rpds_py, jiter, markupsafe, cffi, charset_normalizer and pywin32 each came as a published `win_amd64` wheel (their `WHEEL` tags read). The interpreter's PE machine field is `0x8664` (x64) for `python.exe`, `pythonw.exe` and `python313.dll`, and under the x64 emulation it answers `platform.machine()` with **`ARM64`**: only the bytes tell the architecture, which is why the packaging guard reads them ([note](../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md)). The step also tried to put a `python3.13.exe` on the user's PATH, and failed only because one was there ([note](../../defects/the-bundle-steps-python-install-tries-to-place-an-interpreter-on-the-users-path.md)).

**The proof.** three whole runs of `pnpm code-intel-proof --skip-build`, each green (888 s, 880 s, 877 s, each on a host read idle first). Launch 1: `tools/list` at 3,967, 5,501 and 4,584 ms, 22 tools, the preamble `0d0a` and no non-JSON line, exit 0 on stdin's end, 2 for an unknown subcommand, the window check "sampled 12/16/14 time(s)" with nothing windowed. Launches 2 and 3: 22 listed, 12 granted, two launch lines carrying `--project`. Launch 4: `Greeter`, `greet` and `Counter`, with five provisioning lines in the first run (TypeScript 5.9.3 and typescript-language-server 5.1.3 fetched into the profile) and none after; the call took about 241 s each run. Launch 5: the disclosure true to the runtime, the store under the profile's `local\rotaris\data\code-intelligence`, nothing new under the person's own `%USERPROFILE%\.serena` (which a Serena of the owner's own uses; untouched since before the runs), the setup's five launches as on Linux and `setup-cancel` "Cancelled" with creation failed and the rest not attempted. Launch 6: the doctored manifest refused. Launches 8 to 15 listed exactly the files each changed. **Found nothing new about the mechanism.** **Not shown:** that `setup-cancel` leaves no `python.exe` behind — the proof does not look, and the host had another worktree's runtime running when this session looked; the packaged branch and section 7 (no Windows package on this host). With the runtime renamed aside the proof's bundle check rebuilt it before any launch, and from Git Bash that rebuild fetched the pinned x64 uv and could not extract it ([note](../../defects/the-bundle-step-extracts-the-pinned-uv-with-whatever-tar-is-first-on-path.md)); the sentinel's exit 127 was not reached.
