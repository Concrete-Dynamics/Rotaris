# ADR-0054 — Packaging, the four artifacts, and self-update — The updater — 2026-09-28, first execution (`first-release-plan.md` §4.6; O-10, R-062)

Part 18 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The updater — 2026-09-28, first execution (`first-release-plan.md` §4.6; O-10, R-062)

*REQ-STARTUP-043, 046, 057, 105–126, 146, 150, 161–164, 167, 168; REQ-SHELL-114, 118, 121; `PD-STARTUP-001`;
`PD-MONITOR-002`. Reported in place under the standing policy; row in `../first-executions.md`.* The bespoke main-process
updater this record decided is built, in the shape the Decision fixed: `apps/desktop/src/main/updater/` — `classify.ts`
(106), `feed.ts` (105, 107–110, 112), `keys.ts` (167, 168), `download.ts` (118, 124), `install.ts` (122, 123),
`strategies.ts` (115, 125, 126), `updater.ts` (the orchestrator: 114, 116–121, 046) and `electron.ts`, the one file of
it that touches Electron (`net.fetch`, so the system proxy and certificate store apply), the disk, `reg.exe` and a
process. Everything else is pure over ports and decided by the tests beside it. The names and the order come from the
one naming authority, which gained REQ-STARTUP-109's order and the manifest format for it (`tools/release-naming`), so
the exact-string lookup the Decision requires is structural. Four things the record left open were decided here, each
stated so a reader can check the design against the requirement.

**1. Where the key set lives, and its form.** `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts`,
compiled into main's bundle: resolved from within what was installed (REQ-STARTUP-159), reachable from no configuration
value, preference, environment variable, control or download (REQ-STARTUP-167). The signature is **Ed25519** (RFC 8032)
through Node's `crypto`: `SHA256SUMS.txt.sig` holds the **raw 64-byte signature over the manifest's exact published
bytes**, and a key is an **SPKI PEM** text block — what `openssl genpkey -algorithm ed25519` and `openssl pkey -pubout`
produce, and what `openssl pkeyutl -sign -rawin` signs with. The specification leaves both forms to the implementation
(domain 11's Data & Formats: "the form of a key, the form of a signature, and how many keys a build carries are
implementation choices"); **OQ-83** asks whether the record should fix them so the pipeline (§4.7) cannot choose
differently, and the build proceeds under this reading. **What O-2 must add, and where:** one element in that array —
the public half of the release signing key as an SPKI PEM block, between `-----BEGIN PUBLIC KEY-----` and
`-----END PUBLIC KEY-----`. The private half is the pipeline's secret and never enters the repository. A rotation
appends the incoming key while the outgoing one is still carried (168 (a)); a withdrawal removes it so no later build
carries it (168 (d)); the pipeline's key record (§4.7, 168 (b)) starts with the first build that carries a key, and
this build carries none. **The set ships EMPTY on this tree.** With no key, `verifyDetachedSignature` answers `no-key`,
the install step refuses every manifest with one sentence saying the build carries no verification key, and nothing is
downloaded — measured in `install.test.ts`: the manifest and its signature fetched, no third request, no staging
directory. That is REQ-STARTUP-122/123's outcome for an unverifiable release, not a stub. *Amended 2026-10-23
([R-082](../../../product/requests.md#r-082)): O-2's public half is the set's one element, SPKI DER fingerprint
`sha256:e0f3d7e80e046a5d3aad59ecbc6feda255fc65e841be21237f500e0d117d1d07`, and the key record's row for `0.1.0rc1` names it. The empty set's outcome above
is kept as the reading of an injected empty set (every key withdrawn), which `keys.test.ts` and `install.test.ts` still
measure beside the production set's.*

**2. The launcher's variable is named.** The record decided the launcher "publishes its own declared variable" and did
not name it. It is **`ROTARIS_PORTABLE_ARTIFACT`** (`classify.ts`), the variable REQ-STARTUP-147 admits as "the variable
by which that form names the artifact file a launch started from", a file path and nothing else. Two obligations on the
portable stub (§4.5, not built), recorded here so its spike inherits them: it must publish that variable with the
artifact's absolute path, and it must **forward its own arguments to the payload**, because the successor launch below
carries a token the payload has to see.

**3. The classification's residue.** A packaged Windows build with neither a registry match nor the variable — the
payload run directly out of a preparation, or an installed tree copied elsewhere — is **not updatable** here, this
record's reading ("absent variable → not updatable … the requirement's own default"). REQ-STARTUP-106's copied-tree
sentence reads the same case as portable, with the running executable replaced by a single-file portable. The two texts
disagree; the build follows this record, the launch performs no check, and its log line names the reason. **OQ-84.**

**4. The offer notice under two requirements.** REQ-STARTUP-118 gives the download a non-persistent notice titled
`Downloading Rotaris {version}` with a fixed message; REQ-SHELL-118 keeps the offer's title and identity, updated in
place, with a message conveying two things and no more, and re-enables the action "ready to install" when the download
completes — where REQ-STARTUP-122 runs download → verify → apply without a pause. Built: the **identity is kept and the
notice updated in place** (REQ-SHELL-118, and this record's "the same notice by identity, never by replacement"), through
a new `update` on the notice store; the **title and the message are REQ-STARTUP-118's** (Distribution owns the words,
Shell the surface — `CONTEXT-MAP.md`'s relationship); **not persistent while downloading**, so no dismissal can wave off
a version whose install is in flight; the action **disabled** with `The download is in progress; the same download
cannot be started twice.` as its accessible description (the notice contract's new `action.disabled`, drawn by
`Notice.tsx`); and **the apply follows the verified download without a second click**, so REQ-SHELL-118's "ready to
install" state stands only for the length of the apply. A failure becomes the `Update not installed` error notice in
place (REQ-STARTUP-120; REQ-SHELL-118's "SHALL become"), recorded before it is rendered (REQ-NOTIFY-268). **OQ-85** asks
which requirement governs the title, the persistence and the pause.

**The restart, built on ADR-0055's decision.** `Restart now` starts the target — the updated portable — with
`builtin:update-successor -- <this instance's hand-over endpoint>` on the sentinel branch (OQ-43 covers the composition,
as ADR-0055 says it should); the successor performs no claim and no hand-over attempt, opens its own endpoint and
announces its record over the predecessor's (`inheritInstance`, `packages/platform/src/instance.ts`); the predecessor
replaces the record's contents with the successor's fields in one atomic replacement (`replaceDocument`: a sibling
renamed over), answers, and only then destroys its windows and quits through the ordinary path — its `close` at quit
leaves a record that no longer names it. A successor that cannot be started surfaces through `Update not installed` and
nothing closes; one that never signals leaves the predecessor as it was, with no timeout of its own (ADR-0055). The
successor's own wait for the predecessor's answer is bounded by the hand-over interval, because the predecessor answers
at once and a successor left unanswered must not become a rival: it ends quietly. `instance.test.ts` drives the pass in
one process: the record names the successor afterwards, the predecessor's close leaves it, a third launch is handed to
the successor, a successor with no answer is refused within the interval and changes nothing, and a successor from
another machine is not accepted.

**What was executed, and what was not.** Unit: 145 cases in 14 files — the seven updater modules, the notice store's
`update`, the instance record's pass, `MainWindows`' post-show activation, the two commands, the naming authority's
order and manifest format — under `pnpm vitest run`. Built application, on Linux under Xvfb (`pnpm updater-proof`,
7 checks, all green): the source-tree launch is classified not updatable, writes exactly one `update check:` line at
`info` for its one main window naming REQ-STARTUP-106, records no request, quits cleanly with nothing in flight, and a
proxy sink that every request of Chromium's stack would reach (`--proxy-server=127.0.0.1:<port>`) saw no connection for
`github.com`. **Not executed here, and not faked:** a check that goes out to the endpoint; an offer on screen; a
download; the installer and portable apply against a real artifact; the restart between two real processes. Every one
of them needs a packaged Windows artifact launched from its install directory or through its launcher, which IC-3
places on the Windows host (*corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*); their first execution is owed to the next `pnpm package` on Windows, with the "assets"
rule's. **The proof found one thing beside the mechanism:** the sink recorded `CONNECT redirector.gvt1.com:443` —
Chromium's own component updater reaching out from the built application, a request no requirement names and
REQ-STARTUP-160's disclosure cannot carry — filed as
`../../../defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md`, not repaired here.
*Corrected 2026-09-28 by the repair (R-062): the cause named in that sentence was wrong.* A net-log of the same launch
named the request as Electron's spellchecker downloading a Hunspell dictionary
(`https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic`), not the component updater, and
`--disable-component-update` was measured to change nothing. `apps/desktop/src/main/runtime-requests.ts` empties each
session's dictionary list and turns the spellchecker off in `session-created`, the one point measured to prevent the
download; `pnpm updater-proof` now asserts **zero** connections at the sink from launch to first paint and an orderly
quit (9 checks), beside its `github.com` check. OQ-93 asks whether any text field is spell-checked.

**Readings stated rather than left in code.** REQ-STARTUP-123's two hash outcomes follow the download as its sentences
say ("the download was discarded"), so an asset the manifest does not list is downloaded and then discarded rather than
refused before the download. A portable whose medium is gone since launch reads as "the directory holding it cannot be
reached", in REQ-STARTUP-125's shape for that case, and only an artifact missing from a directory that is there reads as
"not installed from a released artifact". The demo flavour (REQ-STARTUP-057) is a parameter of the activation, false
for every window until the demo entry (REQ-SHELL-162) is built. Every line the updater writes is `info`
(`PD-MONITOR-002`), a failed install `warning`, a successor that could not be started `error`. The installer's
auto-close and the restart's close destroy the main windows rather than asking the close guard: the user chose the
action, and after the record has passed the predecessor must not stay. That is a reading between two SHALLs —
REQ-STARTUP-119's "the window SHALL auto-close" and REQ-STARTUP-121's close against REQ-STARTUP-046's confirmation
"when a run is active" — and **OQ-86** asks which governs. **Nothing in this record's decision changes.**
*Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)), and built the same day (plan fin21): the reading
above no longer stands.* REQ-STARTUP-046's confirmation governs both closes and is asked when the action is clicked — before
the installer is spawned or the successor started, since declining after either could not keep the window — by
`UpdaterDeps.confirmClose` for `Restart now` and for `Update now` on the installer flavour alone (the portable's apply closes
nothing). Declined, nothing starts and the notice stays; accepted, the closes are made as before, without asking again.
*Falsified the same day by the build's verification:* "without asking again" let a run started during the installer's
download — minutes in which the window accepts input — be ended by the auto-close unasked. The count is now re-read
immediately before the installer is spawned or the successor started (`UpdaterDeps.activeRuns`, `runInstall`'s
`beforeApply`, `mustAskAtHandOff`): after a download, any run active then is asked about again; for `Restart now`, a run
past the count the click covered. Declined there, the verified download is discarded and the offer returns in place.
*Falsified again 2026-10-14 for the unsaved-settings guard, by [OQ-311](../../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-311) (ruled that day by the
consortium under [R-072](../../../product/requests.md#r-072), no directive), and built by fin46 (`fin46-accept1-9`): "rather than
asking the close guard" no longer stands for these clicks.* `Restart now`, and `Update now` / `Try again` on the installer
flavour, are user-initiated closes (REQ-SHELL-119 guard (1), REQ-CONFIG-287), so `UpdaterDeps.confirmUnsaved` asks
REQ-SHELL-124's Save/Discard/Cancel of every open main window, one at a time (`askUnsavedInTurn`, `main-windows.ts`: the active
window first, a window holding no unsaved settings neither surfaced nor asked, a renderer that cannot answer allowing under
PD-SHELL-010), at the click ahead of the run box and again first in the hand-off's check. A Cancel or a failed Save answers
`UPDATE_DECLINED_UNSAVED` and starts nothing; at the installer's hand-off it takes the declined path above. The portable's apply
and REQ-STARTUP-119's auto-close stay programmatic and ask nothing, and the successor-failure path is unchanged. **First
execution, 2026-10-14:** over fakes only — `updater.test.ts`'s OQ-311 block (ten cases, nine red against the unrepaired
updater), `main-windows.test.ts` (`askUnsavedInTurn`) and `apps/desktop/src/renderer/guard-question.test.ts` (an asking while
the question is open joins it); a development host's build is classified not updatable, so no launch reaches these guards, and
their run in the built app is owed to the Windows package (a Windows x64 host, deferred with the release pipeline under R-071; IC-3 binds Linux and macOS artifacts), as [`docs/proofs/updater-proof.md`](../../../proofs/updater-proof.md) records.

**Repaired at verification, 2026-09-28 (same item, R-062).** The independent verification found three defects in the
build above, and writing the third's test found a fourth; each is repaired with a test beside it, and nothing in this
record's decision moved. (1) *The classification order.* The AppImage test ran before the released-artifact test, so a
`pnpm dev` inheriting `APPIMAGE` from an AppImage-hosted terminal was the appimage flavour and contacted the feed
(reproduced in the built app), and the same variable on a packaged Windows build selected a flavour `PD-STARTUP-001`
never offers. REQ-STARTUP-106's "before any other flavour test" orders the **flavour** tests; the released-artifact
test is not one, and no variable overrides it. The packaged test now runs first and the AppImage test applies to a
packaged Linux build alone (`classify.ts`); `pnpm updater-proof` launches with `APPIMAGE` and
`ROTARIS_PORTABLE_ARTIFACT` set and still records no request. (2) *The record passed to anyone.* `passRecord` rewrote
the record for any well-formed successor on this host, whether or not a restart was waiting, so an unsolicited
`builtin:update-successor` launch became a second instance (REQ-STARTUP-161). The claim now takes `acceptSuccessor`, and
main answers true only while its restart waits; it does not match the spawned pid, because the portable's launcher
stands between that process and the one that announces itself. (3) *An installed update offered again.* A later
window's check after `Update installed` re-offered the same version, replaced the notice and made `Restart now`
unreachable; the check now stays silent while an update is applied or handed off for that version or a newer one.
(4) *The cleanup ran per window.* REQ-STARTUP-115's `<name>.old` cleanup ran at every window's check and so deleted the
backup the same process's apply had just made; it is launch-time, once per process. Also aligned: the copy port
replaces `<name>.update`, the updater's own sibling, as its contract now says. Unit: 152 cases in the same 14 files;
`pnpm updater-proof`: 8 checks, all green.

**Repaired at the second verification, 2026-09-28 (same item, R-062).** (5) *A refused pass left the restart waiting
for ever.* A successor that started and was accepted, but that the record could not be passed to — the record no
longer named this instance (a REQ-STARTUP-164 (3) reclaim meanwhile), or its atomic replacement failed (on Windows, a
scanner or indexer holding the file through the rename) — was answered not-passed and ended quietly, while main's wait
stayed armed: `Update not installed` never surfaced and every later `Update now`, `Try again`, `Restart now` and window
check answered `update.busy` for the rest of the process. REQ-STARTUP-121 puts that case on its failure branch, and it
is not ADR-0055's "successor that never signals", because the predecessor sees the refusal itself. The claim now takes
`onRecordPassFailed(successor, reason)`, fired only for an announcement `acceptSuccessor` accepted; main's wait
(`updater/successor.ts`) settles exactly once — passed, the spawn failed, or the pass failed — so the restart raises
`Update not installed` with the reason as its detail and the in-flight guard clears. The refusal's answer now carries
its reason, and the successor's `launch refused` line names the check that refused it. Pinned by `instance.test.ts`
(a failing replacement, and a record rewritten for another pid: the callback fires, the record is byte-for-byte
unchanged; an announcement never accepted does not fire it), `successor.test.ts` and `updater.test.ts`. Still not
decided here: an answer the successor no longer waits for — its 5 s bound expired while this process was blocked — is
recorded in `../../defects/` as a defect, not repaired. Unit: 162 cases in 15 files.

**Repaired — the two variables stay with the launch they describe, 2026-09-28 (same item, R-062).** (6) *A child
inherited this artifact's path.* `classify.ts` read `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT` from `process.env`, and
both stayed there for the life of main, so every child of the product inherited them — the run host and the workspace
services by `utilityProcess.fork`'s default, and from the run host every tool, terminal, hook, MCP server and
code-intelligence branch. A packaged Rotaris started from a shell inside a portable Rotaris would have classified
itself portable from the other artifact's path and aimed its rename-aside at that file; REQ-STARTUP-147 calls such a
variable "set by the artifact's own runtime rather than by a user", and an inherited copy is neither. Observed before
the repair in the built app (a scripted `terminal` call's shell carried both). **Repaired at one seam:** main's own
environment, from which every child's is derived. The first statement of main's module body takes the two names out
of `process.env` and returns what they held (`takeArtifactVariables`, `packages/platform/src/artifact-environment.ts`,
where the names now live); the classification is handed that (`classifyThisInstallation(launchArtifact)`) and never
reads `process.env`. Nothing else is removed — the AppImage runtime's `APPDIR`, `ARGV0` and `OWD` name nothing the
product reads. What this record already decided is unchanged, and it is what makes one seam enough: the portable's
successor is started from the launcher stub, which publishes its own variable (item 2 above), so no launch depends on
inheriting one. Pinned by `artifact-environment.test.ts` and `apps/desktop/src/main/launch-artifact.test.ts` (the take
precedes every fork and spawn in main's body; the classification reads what it took), and by `pnpm updater-proof`'s
second stage — the built app launched with both variables set, one scripted `terminal` call writing its shell's
environment: neither variable, the launch's other variables kept; 11 checks, all green. Not executed: a packaged build
(IC-3); the hooks' and MCP servers' environments were not read separately — they are the run host's, which the
terminal's reading measures. **Raised: OQ-90** — REQ-STARTUP-147 names the variables written for child processes and
none removed from them, and REQ-HOOKS-032 says a run "sees exactly the environment the application itself was started
with"; the build proceeds on this record's reading that a variable describing the artifact is not part of the
environment a child is handed. The note: `../../../defects/fixed/the-artifact-variables-reach-the-products-own-child-processes.md`.

**Repaired 2026-09-28 (R-062): (7) the record passed to a successor that had stopped waiting.** The defect the
paragraph above filed (`../../../defects/fixed/the-record-can-pass-to-a-successor-that-stopped-waiting.md`) is repaired
by making the pass two steps, as ADR-0055's restart section now records (*Amended 2026-09-28*). The predecessor offers
the record. It rewrites the record only once the successor has acknowledged within the hand-over interval, on the
timer port. A successor that closed first, or whose acknowledgement is late, leaves the record intact and fails the
restart through `onRecordPassFailed`, so `Update not installed` surfaces and nothing closes. The updater's side is
unchanged: `updater/successor.ts` already rejects on any pass failure. Pinned by `instance.test.ts`: the offer
before the pass; a successor that closed before answering; an acknowledgement missing past the interval on a
`FakeClock`, and a late one refused; a predecessor loop blocked past the successor's bound, red against the one-step
pass; the successor's unbounded wait once it has acknowledged; its reading of the record when the predecessor ends
without a last word; and the ordinary hand-over unchanged.
