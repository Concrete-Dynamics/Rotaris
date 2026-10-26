# The first release — Windows only, skills and workspace-context injection — 4. The Windows release pipeline

Part 4 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 4. The Windows release pipeline

Everything here is ADR-0054's decided architecture, narrowed by `PD-STARTUP-001`. The decisions it builds on:

- `electron-builder` with publishing off;
- the pipeline writes the manifest;
- the portable is assembled from `win-unpacked` plus a project-owned launcher stub (SR-7, P4);
- names come from `tools/release-naming`;
- a bespoke main-process updater;
- the ESC-8 ruling: the manifest is signed, the key is a pipeline secret, and a record of keys per shipped
  release is kept from the first release.

The binaries themselves stay unsigned by design (REQ-STARTUP-021/023). Nothing in this plan buys an Authenticode
certificate, and "signing" below always means the manifest signature.

**4.1 One version.** REQ-STARTUP-158 and REQ-STARTUP-028 require one release version. Today the declared
versions disagree: `package.json` is `0.0.0`, `apps/desktop/package.json` is `0.1.0`, and
`tools/release-naming/package.json` is `0.0.0`. The work:

- choose which places declare the version;
- bring them to one value;
- write the guard. It fails with exit 1, naming the tag version, each place that differs, and where each
  place is. It also checks REQ-STARTUP-059's package-pin agreement in the same stage.

The guard is a script under `tools/` and is unit-tested beside itself.

*Built 2026-09-27; the first execution is reported in ADR-0054 ("One version and the pre-build guard") and in
`first-executions.md`.* `pnpm release:guard <tag>` (`tools/release-guard`) is the guard. The tag grammar it parses
lives in `tools/release-naming`. What the build decided and found:

- **One place declares the version: `apps/desktop/package.json`, at `0.1.0`.** Everything the running product reports
  as its version reads that file back through one reader (`@rotaris/platform`, `installedProductVersion`): the About
  row, which used to report Electron's own `44.1.1` from the unpacked entry, and the MCP client's `clientInfo.version`,
  which the gate round found hard-coded as a second product version, `0.1.0`, that the guard could not see (both
  repaired). The workspace root's `version` is removed. `tools/release-naming` and the other `@rotaris/*` packages keep
  `0.0.0`: they are never packed as packages, so their `0.0.0` is not a product version. A prerelease tag needs the
  declaration to match its text exactly, for example `0.1.0rc1` for step 5's `v0.1.0rc1`. With no manifest the app
  reports `dev`, **OQ-71**'s reading of a conflict between REQ-STARTUP-004 and REQ-STARTUP-007, ruled 2026-10-06 by R-071 and stated by `PD-STARTUP-003`.
- ~~**The setup manifest (`REQ-STARTUP-058`) does not exist, and no step of this plan builds it.**~~ The pin half reads it,
  so on the 2026-09-27 tree `pnpm release:guard v0.1.0` exited 1 on that half alone, naming `@playwright/mcp` `0.0.80`, both files
  and the missing manifest. §5's first check therefore could not pass until the manifest was built. §4.3 needs the same
  file, because `REQ-STARTUP-142`'s "Tools provisioned after installation" section is generated from it and
  `REQ-STARTUP-143` fails a platform whose manifest cannot be read. The guard reads it at
  `apps/desktop/resources/setup-manifest.json` and needs only `schemaVersion: 1` and `toolServerPackages`; that field
  name is the guard's reading, and that directory is not packed, so whoever writes the manifest also adds it to
  `extraResources` (ADR-0054's note). ~~**Owed; see §7.**~~ **Built 2026-09-28** (first execution reported in ADR-0054,
  "The setup manifest", and in `first-executions.md`): `apps/desktop/resources/setup-manifest.json`, committed, schema
  version 1 — Git and ripgrep as `REQ-STARTUP-058` pins them, each archive's URL real and its SHA-256 taken by downloading
  the archive (the four digests and the commands are in the commit and the ADR note); `toolServerPackages` with
  `@playwright/mcp` 0.0.80 (OQ-69's reading, confirmed 2026-10-06 by R-071); the language servers character for character as `pins.json` declares them.
  Its shape is `SetupManifestSchema` in `packages/config/src/setup-manifest.ts` (zod, strict), where both the guard and the
  product's reader may import it; `setup-manifest.test.ts` validates the shipped file, refuses each malformed shape and
  holds the language-server list equal to `pins.json` and to `CODE_INTELLIGENCE_LANGUAGE_SERVERS`, so the two files cannot
  drift. `electron-builder.yml` carries it to the root of the artifact's resources, tested through electron-builder's own
  `copyFiles`. **`pnpm release:guard v0.1.0` passes both halves, exit 0.** OQ-87 raised (what "archive layout" comprises), and OQ-88 (whether a manifest may key an archive under REQ-STARTUP-060's fallback) — raised as OQ-76 and OQ-77 on the branch, renumbered at the merge.
  **Still owed, and not by this step:** the flow that reads the manifest — machine setup, `REQ-STARTUP-060` onward and
  `REQ-MCP-112`'s setup half, with `REQ-STARTUP-061`'s fingerprint — is not built and not in this plan; the notices
  generator ~~still reads `pins.json` and its file says the manifest pins no machine tools, which is now false of the tree
  (OQ-73 decides whose reader follows)~~ reads the shipped manifest since 2026-09-28 (R-062;
  `../../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`) — Git and ripgrep listed with
  their four fields and stated not yet downloaded by this build (OQ-73's reading), `@playwright/mcp` under a third
  sub-heading (REQ-STARTUP-152, OQ-92);
  `afterPack` does not yet assert the manifest inside `win-unpacked` (the next Windows package, IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*).
- **electron-builder hyphenates a prerelease version** (`0.1.0rc1` → `0.1.0-rc1`), so step 5's prerelease would be named
  `Rotaris-0.1.0-rc1-…` unless §4.2/§4.5 render the name from the tag through `tools/release-naming`
  (`../../defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`). *Repaired 2026-09-28 (R-062; ADR-0054,
  "The prerelease naming repair"): `pnpm package` renders the name from the declared text through `tools/release-naming`
  and writes it as a literal into the configuration electron-builder runs with (`release/electron-builder.package.yml`);
  `electron-builder.yml` carries no `artifactName`; `afterPack` refuses any other configured name and a new
  `artifactBuildCompleted` hook any other produced file. The installer's own Windows metadata (`DisplayVersion`,
  `ProductVersion`) still carries the normalised value — **OQ-80**. Unmeasured on a Windows package (IC-3 — corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under
  R-071; IC-3 binds Linux and macOS artifacts): the next one must show the lines ADR-0054 names.*
- Two readings were raised rather than taken silently: **OQ-69**, whether the switched-off `browser` default counts
  (built: it does), and **OQ-70**, whether tag numbers are canonical decimals (built: they are).

*2026-10-21 ([R-079](../../product/requests.md#r-079)): `.github/workflows/ci.yml` exists — `pnpm check` and a development
`pnpm package` (`ROTARIS_PACKAGE_WITHOUT_NOTICES=1`) on every branch push and pull request, on `windows-latest` x64, the
installer uploaded as a workflow artifact. It is not this section's workflow: it never runs on a tag, runs no guard,
writes no manifest and creates no release, and holds a read-only token. Everything below stays owed as written.*

**4.2 The tag workflow.** `.github/workflows/release.yml` does not exist yet. It is triggered only by tags
matching REQ-STARTUP-027's grammar. Channel classification follows REQ-STARTUP-029. The stages, each failing
the release on its own:

1. guards — after `pnpm symbols`, which the version guard needs (it reads `@rotaris/config`, whose kernel re-exports
   the generated symbols; without them it fails closed), and as `pnpm release:guard <tag>`;
2. the notices step;
3. `pnpm package` on a `windows-latest` x64 runner — it renders the installer's name from the declared version itself
   (§4.1's repair of 2026-09-28), so the workflow passes it nothing about names; the tag must equal the declared text
   exactly, which stage 1 has already decided;
4. portable assembly;
5. manifest and signature;
6. the release body.

The workflow creates the GitHub release as a **draft**. It becomes public only when §5's gate passes. Where the
release is published is the owner's choice (§6).

> **First execution, 2026-10-22 — built under [R-080](../../product/requests.md#r-080); not yet run on a tag.** Reported here,
> in ADR-0054 ("The tag workflow, the manifest, the signature and the key record") and in `first-executions.md`.
>
> **What landed.** `.github/workflows/release.yml`, triggered by a tag push alone, its filter admitting REQ-STARTUP-027's
> shape and the guard parsing it exactly. Five jobs, each failing the release on its own:
>
> 1. `guard` — `pnpm symbols`, `pnpm release:guard <tag>`, then `pnpm release:pipeline preflight <tag>`, which this plan did
>    not name and the build added: **a build carrying no verification key is refused before anything is built**, because
>    every installation of it could never verify an update (§4.6: "the release still compiles the key in"), and the key
>    record's row for the version must be exactly the set the build carries (§4.7);
> 2. `build`, a matrix of one entry, `windows-x64` on `windows-latest` (`PD-STARTUP-001`), `fail-fast: false` for
>    REQ-STARTUP-030 — the symbols, the code-intelligence runtime, `pnpm package` with no development flag (the notices
>    step inside it is REQ-STARTUP-037's), the installer copied by its authority name into a release directory, then the
>    portable's stage, which **refuses until §4.5's stub exists** and so stops the release there;
> 3. `sign`, in the `release` environment — `SHA256SUMS.txt`, `SHA256SUMS.txt.sig` from the environment's secret, and §5's
>    four pipeline rows (§4.7 below). It installs no dependency: `tools/release-pipeline` runs on bare Node, so no
>    package's install script runs beside the key;
> 4. `draft` — the body and the name (§4.8), `gh release create --draft --verify-tag`, flagged prerelease by the channel.
>    The only job with a write token, and it holds no secret. Nothing here publishes; the draft is made public by the
>    owner once §5's gate passes;
>    *2026-10-24 ([R-086](../../product/requests.md#r-086)): the flag is passed both ways, `--prerelease=true` for an
>    `a`/`b`/`rc` tag and `--prerelease=false` for a plain one, from `release:pipeline draft-args` rather than a shell
>    branch, and the draft is read back (`gh release view --json tagName,name,isDraft,isPrerelease`) and refused by
>    `release:pipeline release-state … draft` when the release host's record disagrees with REQ-STARTUP-034. Why:
>    v0.1.0rc1's draft was created flagged prerelease (run 39962292417) and the published release reads
>    `prerelease=false` — the flag was lost at publication. Publishing with `gh release edit <tag> --draft=false` changes
>    nothing else, and `release-state … published` over the same view checks it afterwards;*
> 5. `status` — REQ-STARTUP-030's separate overall status, red when any job was not green.
>
> **What was executed.** The stages' code, not the workflow: 64 unit cases in `tools/release-pipeline/` (the manifest
> against `sha256sum -c`, the signature against `openssl pkeyutl -sign -rawin` byte for byte, the key record, the body
> element by element, the CLI's exit codes, the bare-Node launch the signing job depends on, and a release the pipeline
> wrote and signed installed by the updater's own `runInstall`); `actionlint` 1.7.7 over both workflows, clean; and the CLI
> by hand over a stand-in installer. **Not executed:** the workflow itself. No tag was pushed — R-080 forbids publishing,
> and on `main` it would stop at `guard` anyway. **On today's tree a tag stops at `guard`** (no key, no row: O-2); past it,
> `build` stops at the notices step (O-3, O-11, OQ-74) and at the portable (§4.5), and `sign` stops on the absent secret
> (O-2). Its first run is owed to the first prerelease tag after O-2 (§7 step 5).
>
> **Readings taken, stated rather than left in code.** The key record's row is committed **before** the tag, so the
> pipeline holds what ships against what is recorded rather than writing the record after the fact. electron-builder
> writes `<installer>.blockmap` beside the installer even with publishing off (the naming hook admits it); the release
> directory takes the installer by its authority name alone, so the block map is never published, and a directory holding
> any file the naming scheme does not name is refused (REQ-STARTUP-152). Element (4)'s `<platform labels>` are written as
> REQ-STARTUP-030's platform keys.

**4.3 The notices generator.** REQ-STARTUP-141..143 and IC-7 cover it:

- It writes `THIRD-PARTY-LICENSES.txt`, including the "Tools provisioned after installation" section that IC-7's
  second half waits on, taken from the code-intelligence manifest.
- It writes the LGPL relink statement and the owner's contact address (§6).
- It fails the platform's job on each condition REQ-STARTUP-143 lists.

While this is built, the About page's lowercase lookup has to be repaired
(`../../defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`). Otherwise the first
release carries the file and the About page still says it does not.

*Built 2026-09-27, with the About repair; first execution reported into ADR-0035, ADR-0054 and IC-7.* `pnpm notices`
(`tools/notices/`) writes `apps/desktop/resources/THIRD-PARTY-LICENSES.txt` only when validation passes, and exits 1
naming each problem otherwise (REQ-STARTUP-149). It builds under four readings, each an open question:

- OQ-72, what one entry is;
- OQ-73, Manrope and the machine tools;
- OQ-74, an identifier a dependency does not declare;
- OQ-75, when a licence file carries the licence's text. It was added by the gate review the same day.

*2026-09-28 (R-062): the section is generated from the setup manifest the build ships.* The generator reads
`apps/desktop/resources/setup-manifest.json` in `SetupManifestSchema`'s shape and lists Git 2.55.0 and ripgrep 15.2.0
with their four fields, saying machine setup is not yet in the build (OQ-73's reading); the language servers follow
from the same file; `@playwright/mcp` 0.0.80 sits under a third sub-heading for REQ-STARTUP-152, a place OQ-92 asks
about. Validation still refuses on the same eleven problems (O-3, O-11's components, the runtime absent from the tree).

**Where the owner writes the O-3 address.** In `tools/notices/release-inputs.json`, as the value of
`lgplCorrespondingSourcesAddress`. That file is the one place the generator reads it. The value must be one literal
address in one of two shapes:

- one e-mail address, alone or after a display name, as in `Rotaris Maintainers <sources@example.org>` with the
  owner's own domain in place of `example.org`. The example as written is refused, because `example.org` is reserved
  for examples, so a copied example cannot pass;
- a postal address of more than one part, separated by commas or lines, with a number and words in it.

Validation refuses each of these, naming what it found:

- a web page;
- more than one e-mail address, since REQ-STARTUP-142 asks for a single address;
- a no-reply route, which no maintainer monitors;
- a placeholder word (`N/A`, `none`, `TBA`, `TODO`, `REPLACE_ME` and the like), or a template's field name standing
  where the value goes (`Name <…>`, `Street 1, 12345 City, Country`);
- a stock template address: "Address line 1", "123 Main Street", Anytown, Nowhere, "Fake Street", Musterstadt, or a
  number made only of zeros;
- a domain reserved for examples and tests;
- a top-level label no mail reaches (`.tld`, `.domain`, `.local`, `.lan`, `.internal` and the like);
- a template's domain (`domain.com`, `host.com`, `test.com`) or local part (`test@`, `foo@`, `user@`, `john.doe@`).

Until an address that passes is written, validation fails and names the key.

**The check is a word-and-shape heuristic, and nothing more.** It refuses the placeholders it knows. It cannot tell
whether an address is the owner's, so an invented address that looks real still passes. In the other direction, a
real address that contains one of its words is refused, for example a street named "Sample Lane", a company named
"Unknown Pleasures", or a domain such as `sample-labs.com`. REQ-STARTUP-142 makes a truthful address the owner's
act. The check only catches a template left in place.

*Corrected 2026-09-27 by the gate review's second round.* The check as the first round left it still accepted
`Name <sources@domain.tld>`, which was the example this paragraph then gave. It also accepted `test@test.com`,
`noreply@…`, two addresses in one value, and the stock postal templates. The second round also found that an input
file holding only `null`, `false`, `0` or `""` was read as having nothing to report. With `release-inputs.json` set to
`null` over an otherwise valid fixture, the step exited 0 and the header read "(no address)". Every input that is not
a JSON object now fails as unparsable.

**What the first run refused, besides O-3.** Twelve shipped components carry no licence text. Four ship no licence
file at all:

- `@ai-sdk/provider-utils` 5.0.36;
- `@xterm/addon-serialize` 0.14.0;
- `@xterm/headless` 6.0.0;
- `proxy_tools` 0.1.0, in the code-intelligence runtime.

Eight ship a file that only refers to their licence (OQ-75):

- `@workflow/serde` 4.1.0, whose `LICENSE.md` points to a file it does not ship;
- `ai` 7.0.92, `@ai-sdk/gateway` 4.0.74, `@ai-sdk/openai` 4.0.58, `@ai-sdk/openai-compatible` 3.0.43 and
  `@ai-sdk/provider` 4.0.10, each with Apache-2.0's per-file notice only;
- `certifi` 2026.7.22, in the runtime, with MPL-2.0's Exhibit A only;
- `mslex` 1.3.0, in the runtime, with the Apache-2.0 notice and an authors list.

*Corrected 2026-09-27 by the gate review. This paragraph first said "Four shipped components carry no licence text",
listing only the first four. The generator had then counted any non-empty licence file as the text, so the eight
files that only refer to their licence passed.*

Each of the twelve passes only with a maintainer's reviewed exception in `tools/notices/reviewed-exceptions.json`
(O-11), and the file states why each is there. `dotenv` 0.9.9, in the runtime, declares no licence identifier.
REQ-STARTUP-143 as worded gives that no route, which is OQ-74.

*Added 2026-10-23: the first run that passes.* With O-3's address given, O-11's twelve reviews and OQ-74's identifier
entry for `dotenv`, `pnpm notices` exits 0 over this tree (Linux x64, the runtime bundled the same day) and writes
20,495,295 bytes: 44 application, 74 runtime and 4 font and icon components, 3 language servers, 779 components
compiled into Electron. A second run writes the same bytes. The table's two new parts and the identifier entry are
recorded under OQ-74 and OQ-75 in `open-questions.md`.

**4.4 The two bundled assets.** The About page already has both "absent" branches (ADR-0054, 2026-09-08). The
build must now produce two files under `process.resourcesPath`:

- `build-id.txt` for REQ-SHELL-140;
- the notices file for REQ-SHELL-142.

`settings-proof` gains the present branch for each.

Two facts from §4.3 bear on this step:

- `pnpm notices` writes no file until O-3, O-11 and OQ-74 are answered. The notices file's present branch therefore
  needs a file the proof supplies itself. Once `pnpm notices` succeeds in a worktree, the built app finds its output
  through `about.ts`'s source-tree fallback, and the proof's absent-caption check turns red.
- REQ-STARTUP-015 asks for "exactly one copy" of the bundled tool server's licence text inside the bundle, citing
  REQ-STARTUP-142. ADR-0054 recorded the dist-info `LICENSE` as that copy. The notices file reproduces the same text
  again, so carrying the file makes two copies. This step decides which copy stands, or raises the question.

*Built 2026-09-27; first execution reported into ADR-0054 ("The two bundled assets") and ADR-0035.* What landed:

- **The build identifier.** `pnpm build-id` (`tools/build-id/`) writes `apps/desktop/resources/build-id.txt` (git-ignored)
  as one line: the full commit name of HEAD, with `-dirty` when the working tree differs from it. It is deterministic
  per commit and uses no network. ADR-0054 records why neither an abbreviation nor a tag is used.
- **The packaging.** `pnpm package` runs `pnpm notices` and then `pnpm build-id` before `electron-vite build`.
  `electron-builder.yml` carries both files to the root of `process.resourcesPath`, and `afterPack`'s "assets" rule
  checks them in the artifact.
- **While O-3 is owed, a local `pnpm package` fails** at the notices step (REQ-STARTUP-143). `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
  makes a development package without the notices file instead, removing any earlier one; any other value is a usage
  error (exit 2). Its About page shows the absent caption, the package says it is not releasable, and a build for a
  tag refuses the flag, in `package.mjs` and in `afterPack` alike. Its installer still carries a release artifact's
  name (ADR-0054 records this).
- **The licence copy.** The notices file's copy stands, because REQ-STARTUP-142 requires it there. The dist-info copy
  is filtered out of the artifact and kept in the source tree for the generator. The requirements decide this between
  them, so no question is raised.
- **The proof.** `settings-proof` launch 1′ measures the present branch of each asset. The notices file there is a
  fixture, as the first fact above says it must be. The proof puts back whatever `apps/desktop/resources/` held, byte
  for byte, so a successful `pnpm notices` no longer turns the absent check red. A real file written between a killed
  run and the next is kept, not taken for the proof's (the gate review's correction, ADR-0054); so is a real writer's
  removal of the proof's file, which leaves the name empty (its second round's).

**Owed:** the "assets" rule's first run against a real `win-unpacked`, at the next Windows `pnpm package`. No package
was run here (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*).

**4.5 The portable and its launcher stub.** REQ-STARTUP-031 names two Windows artifacts, so the portable is part of
the first release. Its name is `artifactName(declared, 'portable')` from the same declared text `pnpm package` reads
(`scripts/lib/artifact-names.mjs`, `declaredProductVersion`), never a version electron-builder has normalised (2026-09-28). The stub is ADR-0054's second build technology and has never been built. It is the largest
unknown in this plan, so its spike is taken as the first act of building it (CLAUDE.md), and the result goes
back into ADR-0054. Dropping the portable would need a further directive. This plan does not propose one.

> **First execution, 2026-10-23 — built under the owner's packaging brief of that day; executed on Linux, the Windows
> artifact owed to the CI run.** Reported in ADR-0054 ("The portable, the assisted installer and the icon") and in
> `first-executions.md`. The stub is `apps/desktop/launcher/` (Rust, no crate); `pnpm package` builds it with Cargo,
> assembles `release/portable/Rotaris-{v}-windows-x64-portable.exe` around `win-unpacked` (`scripts/lib/portable.mjs`), and
> launches it twice (step 3′); the pipeline's `portable` stage reads it back and copies it into the release directory
> instead of refusing. `pnpm portable-proof` drives every preparation outcome on a POSIX host. Both obligations §4.6 left
> the stub are met: it publishes `ROTARIS_PORTABLE_ARTIFACT` and forwards its arguments. **Owed:** the application's
> notice for a run that could make no preparation (REQ-STARTUP-165 (c); a defect note); OQ-452, OQ-453, OQ-454; the
> gate's two runs on O-6's machine. The packaging host now needs a Rust toolchain (`cargo`), which the hosted Windows
> runner carries.

**4.6 The updater.** The updater is the one part of this plan the owner did not name. A release that carries no
updater can never update itself: each of its users would have to download every later release by hand. The key
record of REQ-STARTUP-168 (b) starts with whichever build first carries a key. *Recommended: build it into the
first release*, following REQ-STARTUP-122's strict sequence. *Ruled 2026-09-27 as recommended (O-10,
[R-052](../../product/requests.md#r-052)).* The sequence:

1. fetch the manifest and the signature;
2. verify the signature against the compiled-in key set;
3. parse the manifest;
4. stream the download to staging;
5. verify the digest;
6. apply, using the installer and portable strategies only. The dmg and AppImage strategies wait for the
   directive's withdrawal.
