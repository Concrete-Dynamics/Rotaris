# IC-7 — the bundled code-intelligence runtime fetches its language servers; the release is bound until the owner decides (ADOPTED 2026-09-06, option 2 — DISCHARGED 2026-09-27, the pipeline's evidence owed)

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

> *Note 2026-10-15 ([OQ-400](../open-questions.md#oq-400), ruled under R-072), not a change to this condition: Windows ARM64 is
> an **unpinned development host**. `pins.json` pins uv for `win32-x64` and `linux-x64` only, and no `win32-arm64` asset is
> added; on that host `bundle.mjs` takes the pinned, hash-checked `win32-x64` uv, which runs under the operating system's x64
> emulation, and builds the bundle for the artifact's architecture (`--target`), so the pins this condition's record names are
> unchanged by it.*

> **DISCHARGED 2026-09-27 — the second half, by the notices generator's first execution** (`first-release-plan.md`
> §4.3; `tools/notices/`, `pnpm notices`). The criterion option 2 set — "the specification carries the amendment and
> the notices generator lists them" — is met. The generator writes the `Tools provisioned after installation` section
> from the setup manifest this build carries (`apps/desktop/scripts/code-intelligence/pins.json`). Under a sub-heading
> naming the runtime (`serena-agent 1.7.0`), it lists `typescript` 5.9.3 (Apache-2.0,
> https://registry.npmjs.org/typescript), `typescript-language-server` 5.1.3 (MIT,
> https://registry.npmjs.org/typescript-language-server) and `pyright` 1.1.403 (MIT, https://pypi.org/project/pyright/),
> each with its language. It states that the runtime downloads each at the first use of that language, that none is
> contained in the artifact, and that a further language obtains its server by the same route and is not declared.
> Rendered over this tree and asserted by `tools/notices/notices.test.ts`, both over a fixture and over the real
> manifest. A manifest that cannot be read or parsed, or a package missing any of the four fields, fails validation.
> *Corrected the same day by the gate review's second round: that sentence was false for one input.* A manifest
> holding only `null`, `false`, `0` or `""` parsed without complaint. Over an otherwise valid fixture the step exited
> 0 and printed "0 language servers", and this section's list was empty. Every input the generator reads must now be
> a JSON object, or it fails as unparsable. A package field that is only whitespace also counts as missing.
> `notices.test.ts` covers each case.
> **What this does not show, stated so it is not read as shown:** a notices file frozen into a release. The first run
> wrote none, because REQ-STARTUP-143's validation failed on six things IC-7 does not own: the LGPL address (O-3),
> `dotenv` 0.9.9's missing identifier (OQ-74), and three npm packages and one Python distribution that carry no
> licence text and await a maintainer's review (O-11). *Corrected the same day by the gate review: fourteen things.*
> Eight more components carry only a file that refers to their licence without carrying its text: six npm packages
> (`@workflow/serde`, `ai` and four `@ai-sdk` packages) and two Python distributions (`certifi`, `mslex`). The first
> run had counted such a file as the text (OQ-75). O-11 is now twelve reviews. That binds every release by itself, so
> IC-7 no longer binds anything REQ-STARTUP-143 does not. The machine tools this section also names in
> REQ-STARTUP-142 are OQ-73's, not IC-7's. Of the three records this entry is "discharged into", the notes on
> ADR-0035 and ADR-0054 are written in place. **The third, the release pipeline's evidence, is owed**: no pipeline
> exists yet (first-release-plan.md §4.2). Its first run must show this section in a frozen file.
> *Pointer added 2026-09-27 (first-release-plan.md §4.4): `electron-builder.yml`'s `extraResources` now carries the
> file into the artifact, and `afterPack`'s "assets" rule compares it byte for byte with the one in the source tree. No
> Windows package has run since, so the first one to pass validation freezes this section for the first time and runs
> that rule for the first time too (ADR-0054, "The two bundled assets").*
> *2026-10-21 (the Windows ARM64 session's F2): `code-intel-proof` ran three times on a Windows ARM64 development tree, launch 4 provisioning TypeScript 5.9.3 and typescript-language-server 5.1.3 into the profile on the first run — a declared package at its declared version, as on Linux. This changes nothing in the condition: the release pipeline's evidence is still owed, and launch 7 (the packaged, outbound-blocked run) did not run.*

> **ADOPTED 2026-09-06 by the owner — option 2, ESC-32 (`owner-decisions.md`).** The language servers are tools
> provisioned after installation, like Git and ripgrep. **Shown so far, the same day:** `REQ-STARTUP-159`, `058`,
> `142`, `064` and `REQ-MCP-116` amended in place with the prior wording quoted, `REQ-MCP-118` minted (the
> disclosure); the binding manifest declares TypeScript's two packages and Python's one with name, version, source
> and licence, **checked against the runtime's own defaults at generation** — the check's first execution refused a
> doctored pin (`pyright` 1.1.402 against the runtime's 1.1.403) and accepted the true ones; the MCP category's
> code-intelligence card carries the disclosure on every status, idle included, with the store path under the
> per-user data directory; `pnpm code-intel-proof` launch 5 read 3 declared packages on the card and the store
> present, true to the runtime's own provisioning lines (not exercised (the profile was warm)); launch 7 on the packaged binary with
> outbound blocked: tried typescript@5.9.3 — a declared package at its declared version. **Not yet shown, and the reason the condition stays:** the notices generator's
> "Tools provisioned after installation" section listing them (`REQ-STARTUP-141/142/143`) — the generator is not
> built (ADR-0054). That half is owed with it; until then a Windows release carrying the runtime is bound by this
> entry exactly as before. Nothing here is a downgrade by the person doing the work: the owner set the option, and
> the entry records what was shown and what was not.

> **PROPOSED 2026-09-06 by Part T (ADR-0035's first execution), for the owner to set or refuse.** Nothing below is
> a downgrade of REQ-STARTUP-159; it is the measured gap between that requirement and the runtime the owner chose.

**Set by:** proposed under ADR-0035's spike (`spikes/code-intelligence-bundle.md` §3), 2026-09-06; binds only once the
owner adopts it. **Binds:** any Windows release artifact (`pnpm package`'s installer, ADR-0054) that carries the bundled
code-intelligence runtime — not the mechanism, which is built and proven with the bundle as it is. **Discharged into:** a
note on ADR-0035 and ADR-0054, and the release pipeline's evidence.

**Why it exists.** `REQ-STARTUP-159` requires that what the user installs is self-contained — nothing fetched at run
time beyond the machine tools of `REQ-STARTUP-058` and the package caches of `REQ-STARTUP-064` — and `REQ-STARTUP-015`
requires the bundled tool server to run "from what the user installed". The bundle (Python 3.13.15 with
`serena-agent==1.7.0`, 175 MB under `resources/code-intelligence/`) satisfies that for the **runtime**: it answers
`tools/list` and the protocol with nothing else installed. It does not satisfy it for the **language servers** the
runtime's symbol tools need: measured with outbound blocked and a fresh home, the TypeScript server is obtained by
`npm install typescript@5.9.3` and `typescript-language-server@5.1.3` (requiring `node` and `npm` on PATH), the Python
server by `uvx --from pyright==1.1.403` (requiring `uv` on PATH and PyPI, and `pyright` itself downloads a Node runtime
on first run), and every other language's server by its own download at first use — into the product's per-user data
directory. Without them the symbol-level tools error ("The language server manager is not initialized") while the
pattern search and the memory tools keep working.

**What must be shown, and what would count.** One of:

1. **Bundle the servers for the languages the release claims.** Serena accepts pre-provisioned servers (a present
   `<home>/language_servers/static/<Server>/` is used without installing; `ls_specific_settings.<language>.ls_base_cmd`
   overrides the launch outright). For TypeScript and Python that means shipping a Node runtime and two npm packages
   beside the Python tree (an estimated 60–100 MB more, a second interpreter to pin and license under
   `REQ-STARTUP-142`), and stating which languages the release supports offline. Counts as shown when the proof's
   launch 7 (`pnpm code-intel-proof` under `ROTARIS_CODE_INTEL_PACKAGED=1`) answers a symbol overview on a TypeScript
   file and a Python file from the packaged artifact with outbound blocked and an empty npm cache.
2. **Amend the requirement.** Read `REQ-STARTUP-159`'s "machine tools of REQ-STARTUP-058 … the only things fetched
   after installation" to include the code-intelligence language servers as tools provisioned after installation
   (the way Git and ripgrep are), declared in the setup manifest with name, version, source and licence
   (`REQ-STARTUP-142`'s "Tools provisioned after installation" section), and surfaced to the user before the first
   fetch. Counts as shown when the specification carries the amendment and the notices generator lists them.
3. **Ship without symbol-level tools for languages whose server is absent**, the pattern-search and memory tools
   still offered, and say so on the MCP category. Counts as shown when the category's text names the languages the
   installed runtime can serve without a fetch (today: none) and the proof asserts the wording.

Until one of the three is adopted and shown, a release carrying the runtime does not meet `REQ-STARTUP-159` as
written, and this entry says so where the next reader will look. The interim reading taken by Part T, recorded in
ADR-0035's note: the mechanism is complete; the fetch happens only when a run first uses a symbol tool for a
language, from the runtime's own dependency providers, into the per-user data directory, and the failure with the
network blocked is the server's own error result, not a host failure (`REQ-MCP-113`).

**After ESC-32 (2026-09-06).** The three ways above are kept as written because the owner chose between
them; the second is in force. What remains to discharge the entry is one artifact — the notices file's
section — and it is named in ADR-0054 beside the generator that will produce it.
