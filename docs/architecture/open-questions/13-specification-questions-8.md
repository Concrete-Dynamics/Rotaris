# Open questions — Specification questions (8 of 27)

Part 13 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-72 – OQ-75; OQ-71, OQ-76, OQ-77 archived in [the archive](../../archive/architecture/open-questions/13-specification-questions-8.md).

- OQ-71 — With no version metadata, does the running desktop report `dev` or `0+unknown`?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/13-specification-questions-8.md#oq-71)

**OQ-72 — What is one entry of the notices file: a package, or everything compiled into one?** *(REQ-STARTUP-142, REQ-STARTUP-143. Raised 2026-09-27 by building the notices generator, `first-release-plan.md` §4.3; raised as OQ-66 and renumbered OQ-72 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

REQ-STARTUP-142 wants "one entry for every dependency present in the shipped artifact", each naming "the component,
its version, its license identifier, and its full license text", and REQ-STARTUP-143 fails the release on a
dependency that "declares no license identifier". Three kinds of thing are present in the artifact and are not
packages a package manager lists, and none of them can meet all four fields:

- **What is compiled into Electron.** The runtime's binaries carry 779 components — Chromium's third-party code,
  Node.js, V8 and ffmpeg, which is under the LGPL, among them. Electron's own credits file, `LICENSES.chromium.html`, gives each a
  title, a homepage and a licence text, and **no version and no identifier**. Read as 779 entries, the release could
  not pass REQ-STARTUP-143 until someone supplied 779 identifiers the credits do not carry, and the reviewed table
  has no route for a missing identifier (OQ-74).
- **What this build compiles into its own native modules.** SQLite into `better-sqlite3`, and winpty into
  `node-pty` on Windows, from sources the host packages vendor. `electron-builder.yml` strips those sources and their
  licence files from the archive (ADR-0056 rule 1).
- **What the bundled interpreter links.** The code-intelligence runtime's CPython (python-build-standalone, install-only)
  carries OpenSSL, SQLite and zlib linked in (the interpreter answers OpenSSL 3.5.7, SQLite 3.53.1, zlib 1.3.2) and
  Tcl/Tk beside it. Its `LICENSE.txt` names only the software incorporated into CPython itself, and never mentions
  OpenSSL. The install-only tree has no record of the rest that could be read offline.

**What the build proceeds under.** The entry is what a package manager enumerates — an npm package, a Python
distribution, the interpreter, a font — and what is compiled into one is that component's own disclosure:

- Electron is one entry (MIT, its `LICENSE`), and its credits are reproduced whole, in plain text, as the file's last
  section, each under its title and homepage, stated as "as compiled into Electron 44.1.1". That section is 19.8 MB
  of the file's 20.4 MB.
- SQLite and winpty are listed as entries of their own, read from the installed host package: the version from the
  sources, the identifier from the text (`blessing`, `MIT`), and "Contained in" naming the host. This is because the
  packager removes the only other place their notices would be.
- The interpreter's linked libraries are **not listed**. That is a known gap, not a reading, and it is stated here so
  it is not mistaken for coverage. The file says so too, at the head of its runtime section, and its header claims
  "the third-party components" of the build rather than every one.
- *Added 2026-09-27 by the gate review.* Two consequences of reading the closure from production edges:
  - The icon set appears twice: as `@phosphor-icons/web` 2.1.1, a production dependency of the application, and as
    "Phosphor Icons", which REQ-STARTUP-142 names on its own.
  - Two type-only packages are listed that no artifact carries: `json-schema` 0.4.0 and `@standard-schema/spec`
    1.1.0, production dependencies of `@ai-sdk/provider` and `@ai-sdk/provider-utils`. The review read a scratch
    build's sourcemaps and found that the bundler inlines neither.

  Both errors list more than ships, never less.

**What a ruling decides.** Whether the credits of a component the build takes whole (Electron's, and any other
bundled distribution's) satisfy REQ-STARTUP-142 when they are reproduced beneath it, or whether each credited
component must be an entry with a version and an identifier. And whether the interpreter's linked libraries must be
enumerated, which would mean building the runtime from a python-build-standalone archive that carries its licence
records (the full archive, not the install-only one) or declaring them by hand in a reviewed table.

**OQ-73 — REQ-STARTUP-142 names two things the first release does not carry: Manrope, and Git and ripgrep.** *(REQ-STARTUP-142 with REQ-STARTUP-040, REQ-STARTUP-058, `PD-STARTUP-001`. Raised 2026-09-27 by building the notices generator; raised as OQ-67 and renumbered OQ-73 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

REQ-STARTUP-142 states the file "SHALL further contain the license texts of the bundled fonts JetBrains Mono,
Manrope and Space Grotesk", and that its tools section is "generated from the setup manifest of that same build,
listing for Git and for ripgrep the name, provisioned version, source URL and license identifier the manifest
pins". Both clauses assume something about the build that is not true of this one.

- **Manrope is not bundled.** The design import carried no Manrope file, so `packages/ui/src/fonts.css` declares two
  faces and the body text falls back to the system face (the file says so). REQ-STARTUP-040's "register bundled font
  families so branded fonts render from first paint" is short one family for the same reason.
- **No setup manifest in this build pins a machine tool.** Machine setup — REQ-STARTUP-058's first list, REQ-STARTUP-060
  onward — is not built, and it is not in the first-release plan. The only manifest the build carries is the
  code-intelligence pins (`apps/desktop/scripts/code-intelligence/pins.json`), whose `languageServers` is the second
  list of REQ-STARTUP-058. Nothing in this build downloads Git or ripgrep.

**What the build proceeds under.** The file tells the truth about the artifact and keeps each clause's text where
it can:

- Manrope's OFL-1.1 text is reproduced, as the requirement names it. Its entry's version reads "not contained in this
  build", so no reader takes the licence for a file that is not there. When the design material supplies the face and
  `fonts.css` declares it, the table beside the generator gains the file and nothing else changes.
- The tools section reads the manifest the build has. Under "Machine tools" it says the setup manifest of this build
  pins none, so this build downloads neither Git nor ripgrep. It then lists the language servers with their four
  fields, as IC-7 requires. When machine setup is built its manifest carries `machineTools`, and the section lists them
  as downloaded and not contained. The generator already renders that shape, and it is tested with ripgrep.
  *Added 2026-09-27 by the gate review:* that shape is the generator's own assumption: one `{name, version, source,
  license}` object per tool, under a `machineTools` key. REQ-STARTUP-058 describes the machine-tool manifest per
  platform, with archives, digests and layouts. Neither the key nor its shape is decided anywhere yet. Machine setup
  decides both, and the generator's reader follows.
  *Added 2026-09-28 (R-062), a report and not a ruling:* the setup manifest now exists
  (`apps/desktop/resources/setup-manifest.json`, `SetupManifestSchema`), so the shape is decided and the reader has
  followed it: `machineTools[]` with `provisionedVersion` as the version. The section lists Git 2.55.0 and ripgrep 15.2.0
  with their four fields. Machine setup is still not built, so the file does not say "downloaded after installation" as
  a fact: it says the tools are to be downloaded after installation by machine setup, which this build does not yet
  carry, so this build downloads none of them. What the file says once machine setup ships, or is ruled out of the
  first release, is still this question's ruling. The "pins no machine tools" sentence stays for a manifest that pins
  none (`../../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`).

**What a ruling decides.** Whether the first release ships without Manrope, and if so whether REQ-STARTUP-142's
font clause is narrowed to the faces the build carries; and whether machine setup belongs in the first release —
without it REQ-STARTUP-058's first list is unmet, which is a larger question than the notices file.

*Added 2026-10-14 ([OQ-261](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-261), ruled 2026-10-13 under [R-072](../../product/requests.md#r-072)):* the About page's setup
statement now names only the moment this build carries, a tool's first use ([`PD-STARTUP-006`](../../product/directives/pd-startup-006.md#pd-startup-006)).
Whichever change builds machine setup (REQ-STARTUP-060 onward) or REQ-STARTUP-064's cache warm-up restores the matching
moment — first-launch machine setup, cache warm-up, the pinned tool-archive hosts — in that disclosure, together with the
notices file's machine-tools sentence, in the same commit.

**OQ-74 — May the reviewed-exceptions table supply a licence identifier a dependency does not declare?** *(REQ-STARTUP-143. Raised 2026-09-27 by the notices generator's first run against the bundled runtime; raised as OQ-68 and renumbered OQ-74 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

REQ-STARTUP-143 fails the release on "a dependency in the shipped closure declares no license identifier", and
separately on "a dependency carries no license text and is not covered by the ... maintainer-review table". The
table's entries each carry "the license identifier claimed for it", but the requirement gives the table only the
second failure to excuse.

The first run found the case the requirement does not route: `dotenv` 0.9.9, a shim `serena-agent` 1.7.0 requires in
the code-intelligence runtime. It declares `License: UNKNOWN` and no classifier, and it ships an MIT `LICENSE`. It has
text and no identifier. No change a maintainer can make lets it pass, short of removing it from the runtime, which
would break the tool server.

**What the build proceeds under.** The requirement as worded: a missing identifier fails validation, and an
exception in the table does not excuse it (tested). The generator reads an identifier from what a component
declares, most specific first: `License-Expression`, a one-line `License`, the licence classifiers, the first line of
a `License` field that holds a whole text. `UNKNOWN` declares nothing. It never infers an identifier from a licence
text a dependency ships. The one place it reads a text for an identifier is a component that states its licence by
name inside it: the interpreter, SQLite and winpty.

**What a ruling decides.** Whether a table entry, being a reviewed and expiring claim of an identifier, may also
cover a dependency that declares none. That ruling would change REQ-STARTUP-143's wording and one condition in
`collectNotices`. Until then the first release is blocked on `dotenv` as surely as on O-3.

*Added 2026-09-27 by the generator's gate review:* an identifier is copied as the component declares it and is never
normalised. The runtime's distributions declare `BSD License` (`itsdangerous`, `Jinja2`, `pywebview`), `MIT License`,
`Apache Software License 2.0`, `LGPLv2+` and `BSD 3-Clause`. REQ-STARTUP-142 does not ask for an SPDX identifier, but
`BSD License` names a family rather than one licence. Whether an identifier must be an SPDX expression, and who
supplies one where the component does not, belongs to the same ruling.

*Decided 2026-10-23 by the owner's delegate, as a binding decision of the brief for the licence lane — not by the
consortium of [R-072](../../product/requests.md#r-072):* a table entry may supply the identifier of a dependency that declares
none, for `dotenv` 0.9.9 as MIT, and the rule is implemented in the generator, not only written as an entry. **What was
built** (`tools/notices/notices.mjs`, `notices.test.ts`, 3 cases): a second kind of entry, `"covers": "identifier"`,
carrying `whyNoIdentifier` and `licenseFile` in place of `whyNoText`. It stands only for a dependency (never Electron,
the interpreter or a compiled-in library), only while the version is in range and the expiry has not passed, and only
while the component ships `licenseFile` as licence text (OQ-75's `text` kind) that `LICENSE_TEXT_CHECKS` reads as the
claimed licence's — so it cannot be claimed for an identifier the generator holds no check for (Apache-2.0, MPL-2.0,
MIT, BSD-2-Clause and ISC today). A text entry still never excuses a missing identifier, and an identifier entry never
excuses missing text. The file prints `License: MIT (none declared; identified by a maintainer-reviewed exception, …)`,
the reason, and the shipped text. The evidence for `dotenv`: `dotenv-0.9.9.dist-info/LICENSE`, 1,069 bytes, the full MIT
text, "Copyright (c) 2018 Pedro Burón"; `METADATA` says `License: UNKNOWN` beside `License-File: LICENSE`; PyPI's
`license` is null. **Owed, and not this lane's to write:** the ruling departs from REQ-STARTUP-143 as worded ("a
dependency in the shipped closure declares no license identifier" fails), so the directive that governs over it, the
requirement's back-pointer and the request row in `docs/product/requests.md` are the orchestrator's. The SPDX half of
this question is not decided: identifiers are still copied as declared. *Written down 2026-10-23 on the orchestrator's brief:*
the directive is [`PD-STARTUP-007`](../../product/directives/pd-startup-007.md#pd-startup-007), which narrows REQ-STARTUP-143 and carries
its back-pointer there, logged as [R-083](../../product/requests.md#r-083).

**OQ-75 — When does a component carry "its full license text"?** *(REQ-STARTUP-142, REQ-STARTUP-143. Raised 2026-09-27 by the notices generator's gate review; raised as OQ-69 and renumbered OQ-75 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

REQ-STARTUP-142 wants each entry to carry the component's "full license text", and REQ-STARTUP-143 fails a release on
a dependency that "carries no license text" unless a reviewed exception covers it. Neither says what a licence file
that does not carry the licence counts as. The first build counted any non-empty licence-named file as the text. The
gate review found `@workflow/serde` 4.1.0, which the main bundle inlines. Its only licence file reads, in full, "Apache
License 2.0" and "See the LICENSE file in the root of this repository.", and the package ships no such file.
Reading the rest of the closure found three more kinds:

- **A licence's per-file notice, and nothing else.** The notice is what a licence asks to be applied to each file
  with. Apache-2.0's reads "You may obtain a copy of the License at …". Five npm packages carry only that: `ai` 7.0.92,
  `@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and `@ai-sdk/provider`. So does `mslex` 1.3.0 in
  the runtime. `certifi` 2026.7.22 carries only MPL-2.0's Exhibit A.
- **An attribution declared as a licence file:** `mslex`'s `AUTHORS.rst`, beside its notice.
- **A short file that sends the reader to its siblings:** "the licenses found in LICENSE.APACHE or LICENSE.BSD"
  (`cryptography`, `sniffio`, and pip's vendored `packaging`). Their siblings carry the texts.

**What the build proceeds under.** A licence file is one of three things (`licenseTextKind` in
`tools/notices/notices.mjs`), and only the first is the component's licence text:

- **text**: it carries a licence;
- **a reference**: it only names a licence on one line. Or it is at most 2,000 characters, it sends the reader
  elsewhere, and it carries no grant of its own. "Sends elsewhere" is one of: "see the LICENSE" (a markdown link,
  "see the `[LICENSE](LICENSE)`", included), "found in LICENSE", "obtain a copy of the License", "can obtain one at",
  "should have received a copy of the". The grants checked are those of the licences short enough to sit beside such
  words: MIT and Boost, ISC and 0BSD, the BSD family, zlib, the Unlicense and SQLite's blessing. Every full text
  that quotes its own notice in an appendix (Apache-2.0, the GPL family, MPL-2.0) is far longer than the bound;
- **an attribution**: a file named NOTICE, AUTHORS, CONTRIBUTORS or CREDITS.

References and attributions are still reproduced with the component, because they carry its copyright and
attribution notices; Apache-2.0's NOTICE must travel with the work. A component that carries no text fails
validation, and the message names each file and what it does instead. Only a reviewed exception lets it pass, as for
a component that ships no file at all.

Electron, the interpreter, a compiled-in library and a bundled asset each have one named licence file. If that file
is only a reference, validation fails and no reviewed exception can cover it. REQ-STARTUP-143 gives the table to "a
dependency" in general, so this is stricter than the requirement. It is recorded here as a reading. No such case
exists in the first release.

Over this tree the rule leaves 12 shipped components without licence text. The first run counted 4.

*Added 2026-10-23 by the licence lane, on the owner's delegation (O-11; OQ-74):* the twelve are reviewed, and
for each the declared licence's text is reproduced beside the entry rather than left out. A text entry may carry
`licenseText` — a file under `tools/notices/licenses/`, kept as its source published it, and that source's https URL
— which the generator holds to the claimed identifier (`LICENSE_TEXT_CHECKS`) and prints under its own heading, "not
shipped with this component". The sources: Apache-2.0 from apache.org for the six `vercel/ai` packages, `@workflow/serde`
and `mslex`; MPL-2.0 from mozilla.org for `certifi`; the xterm.js repository's root `LICENSE` at the release commit
`f447274f` for the two `@xterm` packages; `proxy_tools`' own `LICENSE.txt` at `db43f1e3`, a two-clause BSD text, where
its metadata says MIT — the identifier follows the file. A text entry may also carry `embedded`, the licence of a work
the component vendors under another licence, read from the installed package and printed after the component's texts
under an "Embedded work" heading: `@ai-sdk/provider-utils` 5.0.36 ships the ISC licence of its vendored
`zod3-to-json-schema` (777 bytes, "Stefan Terdell 2020 / Vercel Inc. 2025"), whose code its `dist/index.js` carries.
Neither part counts as the component's own text, so a reviewed exception is still what lets each pass. Whether the
generator should instead supply a declared licence's standard text by itself, without a review, is not decided here.

Three limits are stated here, so that none is read as coverage:

- The classifier reads words, so a pointer worded differently from the phrases above passes as text.
- A file that carries one licence's text and refers elsewhere for another counts as text. `tqdm` 4.67.1 declares
  `MPL-2.0 AND MIT` and carries the MIT text in full beside MPL-2.0's Exhibit A, so its entry has no MPL-2.0 text.
  The generator does not match the texts a component carries against the expression it declares.
- The pass is per component, and a component's vendored libraries are not components of their own (OQ-72). pip
  26.2.1 passes on its own MIT text. Its vendored `certifi` ships only MPL-2.0's Exhibit A, so pip's entry carries no
  MPL-2.0 text. Its vendored `cachecontrol` and `msgpack` ship only Apache-2.0's per-file notice. The Apache-2.0 text
  is in pip's entry only because its vendored `packaging` happens to ship it as `LICENSE.APACHE`. This is `tqdm`'s gap
  one level down. The ruling below would close it only together with OQ-72's granularity. *Added 2026-09-27 by the
  gate review's second round, checked against the bundled runtime.*

**What a ruling decides.** Whether a component that ships only a licence's notice should instead get the canonical
text of the identifier it declares, reproduced by the generator from a version-controlled copy beside it (as
`bundled-assets.json` does for the fonts). The reviewed table asks "why no license text is obtainable". For
Apache-2.0 or MPL-2.0 the honest answer is that the text is obtainable and the package left it out. That ruling
would change REQ-STARTUP-143's route for such a component, and it would close `tqdm`'s gap as well. Until then,
eight of O-11's twelve reviews are for a notice or a pointer.


**Historical question.** *(ADR-0021 "The cap is load-bearing", obligation 2; REQ-TOOLS-108; REQ-CONFIG-116. Raised by Part AL, 2026-09-09, on wiring the key into the terminal manager — defect fifty-two found it registered, validated and read by nothing.)*

The key is registered with default 20 and minimum 1. Each background session publishes its own `bg:<id>` stream at up to 50 frames/s (the 20 ms floor), so the produced aggregate is `(agents + background sessions) × 50 frames/s`, and only one of those two factors — agents, REQ-MONITOR-285's 20 — has a ceiling. Part AL reads the key into the manager and caps the *delivered* rate per window at 1,000 frames/s by merging (REQ-MONITOR-306, REQ-SHELL-103), so a user who configures 400 background sessions saturates the run-host → main pipe, not a renderer. A stated maximum on the key would let the produced rate be computed rather than absorbed. The owner's call; recorded, not resolved.

- OQ-76 — Which timeline word records that a run's user went away, and came back?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/13-specification-questions-8.md#oq-76)
- OQ-77 — Does the away state resolve the approval an `ask_questions` call itself needs under the `ask` preset?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/13-specification-questions-8.md#oq-77)
