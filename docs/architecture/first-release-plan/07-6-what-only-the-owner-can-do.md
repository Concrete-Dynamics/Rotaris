# The first release — Windows only, skills and workspace-context injection — 6. What only the owner can do

Part 7 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 6. What only the owner can do

| # | What | Needed by |
|---|---|---|
| O-1 | ~~Rule ESC-37, ESC-38, ESC-39 and OQ-64~~ **ruled 2026-09-27** as recommended (R-052) | §2.2, §3.3 |
| O-2 | Generate the manifest signing key pair and store the private half as a repository secret. The public half is committed. **Where and how (2026-09-28, §4.6's first execution):** the pair is Ed25519 (`openssl genpkey -algorithm ed25519 -out release-signing.pem`); the public half (`openssl pkey -in release-signing.pem -pubout`) is written as one element of `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts`, the SPKI PEM block verbatim, `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----`; the pipeline signs `SHA256SUMS.txt`'s exact bytes with `openssl pkeyutl -sign -inkey release-signing.pem -rawin -in SHA256SUMS.txt -out SHA256SUMS.txt.sig` (a raw 64-byte signature). Until the element exists every install refuses at the signature step and downloads nothing. **Step by step since the pipeline exists (2026-10-22, [R-080](../../product/requests.md#r-080)): §6.1** — the pipeline now signs the manifest itself from a secret of the `release` environment, so the `openssl pkeyutl` line above describes the bytes it makes rather than a command the owner runs | §4.6, §4.7 |
| O-3 | Give the literal contact address for the LGPL source request (REQ-STARTUP-142). It must be a single address, reachable without an account and monitored by the maintainers. **Written in `tools/notices/release-inputs.json`, key `lgplCorrespondingSourcesAddress`**, in one of the two shapes §4.3 states; validation fails naming that key until it is. *Given 2026-10-23 on the owner's delegation: `davidvfischer+rotaris-lgpl@gmail.com`; the check passes it (`notices.test.ts`)* | §4.3 |
| O-4 | Supply an icon, with the `.ico` sizes `electron-builder` asks for | §4.9 |
| O-3 | Give the literal contact address for the LGPL source request (REQ-STARTUP-142). It must be a single address, reachable without an account and monitored by the maintainers. **Written in `tools/notices/release-inputs.json`, key `lgplCorrespondingSourcesAddress`**, in one of the two shapes §4.3 states; validation fails naming that key until it is | §4.3 |
| O-4 | ~~Supply an icon, with the `.ico` sizes `electron-builder` asks for~~ **supplied 2026-10-23**: `apps/desktop/resources/icon.ico`, seven sizes 16–256 px (§4.9) | §4.9 |
| O-5 | ~~Choose where releases are published~~ **ruled 2026-09-27** (R-053): GitHub releases of `theUpsider/Rotaris-crw`, the product repository REQ-STARTUP-038 names. **Re-ruled 2026-10-21** ([R-078](../../product/requests.md#r-078)): GitHub releases of `Concrete-Dynamics/Rotaris`, which is this repository from that day, transferred and renamed and public on `main`. R-078 supersedes R-053's choice, which is kept above as what was ruled; `FEED_REPOSITORY` names the new repository | §4.2 |
| O-6 | Provide the gate machine of §5. **Form ruled 2026-09-27** (R-053): a snapshot-restored Windows x64 virtual machine, restored between releases. The owner still provides it | §5 |
| O-7 | IC-4 half 2: rename the machine and reboot (`ROTARIS_IC4_PHASE=prepare`, then `verify`) | the restore's sign-off |
| O-8 | The power-loss test's fault half: a forced power-off during a save (`spikes/power-loss.md` §4) | the store's sign-off |
| O-9 | ~~Approve the §2.3 and §3.4 live runs~~ **approved 2026-09-27** (R-053). The agent still states the scenario and its spending bound immediately before each run (AGENTS.md) | §2.3, §3.4 |
| O-10 | ~~Decide §4.6~~ **ruled 2026-09-27**: the updater ships in the first release (R-052) | §4.6 |
| O-11 | As a maintainer, review each shipped component that carries no licence text, and record the review in `tools/notices/reviewed-exceptions.json`: the component, the version range, the identifier claimed, why no text is obtainable, the reviewer, the date and an expiry at most 365 days later (REQ-STARTUP-143). The first run named twelve (§4.3). Four ship no licence file: `@ai-sdk/provider-utils` 5.0.36, `@xterm/addon-serialize` 0.14.0, `@xterm/headless` 6.0.0 and `proxy_tools` 0.1.0. Eight ship a file that only refers to the licence (OQ-75): `@workflow/serde` 4.1.0, `ai` 7.0.92, `@ai-sdk/gateway` 4.0.74, `@ai-sdk/openai` 4.0.58, `@ai-sdk/openai-compatible` 3.0.43, `@ai-sdk/provider` 4.0.10, `certifi` 2026.7.22 and `mslex` 1.3.0. For those eight, OQ-75 asks whether the generator should reproduce the declared licence's standard text instead. *Added 2026-09-27 by §4.3's first execution. It first named only the four without a licence file; the gate review corrected it the same day.* *Reviewed 2026-10-23 by an agent on the owner's delegation, as each entry's reviewer field says, expiring 2027-10-23; `certifi` has two exact entries, 2026.7.22 and 2026.10.19, because the bundle installs whichever release its unpinned dependencies resolve to ([the note](../../defects/fixed/the-code-intelligence-bundle-pins-serena-agent-and-not-its-dependencies.md)). Each entry carries the declared licence's text from the source it names (OQ-75's note of that day), and `dotenv` 0.9.9 an identifier entry (OQ-74)* *Since 2026-10-23 the closure is locked (`closure.lock`); the lock pins `certifi` 2026.10.23, which has its own exact entry, and the Windows-only `clr_loader` 0.3.1 has an identifier entry; the two earlier `certifi` entries no longer match a bundle.* | §4.3 |
| O-12 | **Make the release feed reachable** (recorded 2026-10-13, deferred under R-071 with the release pipeline). O-5 chose GitHub releases of `theUpsider/Rotaris-crw`, and `apps/desktop/src/main/updater/feed.ts` asks `https://api.github.com/repos/theUpsider/Rotaris-crw/releases/latest` without credentials; the repository is **private** (checked 2026-10-13: `private: true`, 0 releases, and that request answers HTTP 404). An installed build's check would fail silently, as REQ-STARTUP-110 says a 404 must (an internal log line, never an offer), and REQ-STARTUP-038's artifacts could not be downloaded from it. The owner's choice: **(a)** make this repository public before the first release, after an audit of its history and branches for anything not meant to be public; or **(b)** publish releases to a separate public repository, which needs a new request, a revision of O-5 and a change of `FEED_REPOSITORY`, the one place REQ-STARTUP-111 lets it be written. Either way the product states itself GPL-3.0-only (REQ-SHELL-140, REQ-SHELL-142), so whoever receives a published binary is owed its corresponding source; (a) offers it by the same act, (b) has to offer it beside the release. Nothing works on this path before O-2 either: with no signing key every install refuses at the signature step. **Chosen 2026-10-21** ([R-078](../../product/requests.md#r-078)): **(a)** — this repository is transferred to `Concrete-Dynamics` and renamed `Rotaris`, public on `main`, and `FEED_REPOSITORY` names `Concrete-Dynamics/Rotaris` (O-5 re-ruled). The 2026-10-13 facts above were read against `theUpsider/Rotaris-crw` and are kept as they were read. R-078 cuts no release: until one is published the latest-release request still answers 404, and O-2 still binds. The audit of history and branches that (a) names is not recorded by R-078 | §4.2, §4.6, the first release |

O-2, O-3, O-4, O-7 and O-8 carry no recommendation to take: each is a value or an act only the owner can
supply, and each stays owed (R-053). *(O-4 was supplied on 2026-10-23, §4.9.)* O-11 is the same kind of item: a review only a maintainer may sign. O-12 is a
choice only the owner can make about their own repository, and it un-defers with the first release.

### 6.1 O-2, step by step

*Written 2026-10-22 under [R-080](../../product/requests.md#r-080), when §4.2 and §4.7 were built. No key existed and
none was made by the build: every step below was the owner's. Steps 1 to 4 happen once; step 5 with every release.*

*State on 2026-10-24: steps 1 to 4 are done. The public half is the element of `RELEASE_SIGNING_KEYS` in
`apps/desktop/src/main/updater/keys.ts`; `tools/release-pipeline/key-record.json` carries the `0.1.0rc1`
row; the `ROTARIS_RELEASE_SIGNING_KEY` secret exists in the `release` environment; and the pipeline signed and
published `0.1.0rc1` on 2026-10-23. The steps stay written as the record of what was asked.*

1. **Make the key pair, on a machine you trust, never in CI.**
   `openssl genpkey -algorithm ed25519 -out release-signing.pem`. The file is the private half (PKCS#8 PEM). Keep it
   out of every repository and keep an offline backup. A lost key cannot be recovered: installations that carry only
   its public half can then never verify another release and stop updating themselves (REQ-STARTUP-168 (c)); they
   keep working otherwise.
2. **Put the public half into the build.** `openssl pkey -in release-signing.pem -pubout` prints a block from
   `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----`. Paste it, verbatim, as the one element of
   `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts`. Two test cases pin the empty set on purpose and
   must change in the same commit: `keys.test.ts`'s "ships EMPTY on this tree" and `install.test.ts`'s "with the
   compiled-in set EMPTY" (both in `apps/desktop/src/main/updater/`). `pnpm vitest run apps/desktop/src/main/updater
   tools/release-pipeline` is the narrow check, `pnpm check` the gate.
3. **Make the secret available to the signing job, and to nothing else.** In the repository's settings, *Environments →
   New environment* named exactly `release`. Under its deployment protection, add yourself as a required reviewer, and
   restrict its deployment branches and tags to the tag rule `v*`. Add the environment secret
   `ROTARIS_RELEASE_SIGNING_KEY` holding the whole of `release-signing.pem`, both marker lines included:
   `gh secret set ROTARIS_RELEASE_SIGNING_KEY --env release --repo Concrete-Dynamics/Rotaris < release-signing.pem`.
   Only `release.yml`'s `sign` job names that environment. It installs no dependency and holds a read-only token.
   If an organisation policy caps workflow tokens at read, allow the `draft` job's `contents: write`, or the draft
   cannot be created.
4. **Check before the first tag.** `pnpm release:pipeline keys` prints the row the next step commits. Its `sha256:`
   fingerprint is the SHA-256 of the key's SPKI DER, so `openssl pkey -in release-signing.pem -pubout -outform DER |
   sha256sum` must print the same hexadecimal digits.
   *Steps 2 and 4 taken 2026-10-23 ([R-082](../../product/requests.md#r-082)): the owner supplied the public half; its SPKI
   DER fingerprint is `sha256:e0f3d7e80e046a5d3aad59ecbc6feda255fc65e841be21237f500e0d117d1d07`, and `pnpm release:pipeline keys` printed the same.*
5. **With every release, before its tag.** Set the version in `apps/desktop/package.json` to the tag's text (for example
   `0.1.0rc1` for `v0.1.0rc1`). Append the row `pnpm release:pipeline keys` prints to `releases` in
   `tools/release-pipeline/key-record.json`. Land both on `main`, then push the tag. `preflight` refuses a build whose
   row is missing or differs from what it carries. `verify` refuses a signing key that any older recorded release does
   not carry (REQ-STARTUP-168 (b)).
   *Taken for `0.1.0rc1` on 2026-10-23 ([R-082](../../product/requests.md#r-082)): version and row on a branch, put up as a
   pull request; landing it and pushing the tag stay the owner's acts.*

**Rotating and withdrawing** follow REQ-STARTUP-168 and change nothing above. To rotate, add the incoming public key
beside the outgoing one in `RELEASE_SIGNING_KEYS` and keep signing with the outgoing key until every recorded release
that may still be offered an update carries the incoming one. `verify` names each build the incoming key would strand.
To withdraw a compromised key, remove it from the set and from the secret, so that no later build or release carries it.
