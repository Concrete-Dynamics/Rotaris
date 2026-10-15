# ADR-0022 — OS-level confinement: a shared specification core with thin per-platform renderers

- **Status:** accepted — first executed 2026-09-15 (Part AR); see the execution note at the end
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-08)
- **Depends on:** ADR-0002, ADR-0017, ADR-0020
- **Contains an escalation.**

## Context

`REQ-SANDBOX-048`, `REQ-SANDBOX-049`, `REQ-SANDBOX-055` and `REQ-TOOLS-114`: confinement is opt-in per
session over exactly `off` (default), `workspace-write`, `read-only`, case-insensitive, with a YAML
boolean false coerced to `"off"`, unrecognised values rejected at load **and** at assignment, and the
three spellings stable persisted values. An opportunistic fourth mode meaning "confine where possible"
is **explicitly forbidden**. `REQ-SANDBOX-122` gives the mode exactly two sources — the layered
configuration key `runtime.sandbox_mode` and the per-session launch-dialog override. No environment
variable, no launch argument, no other route.

`REQ-SANDBOX-065` and `REQ-TOOLS-115` close the platform-to-mechanism map at exactly two identifiers:
`darwin` to Seatbelt (`sandbox-exec`) and `linux` (WSL2 included) to bubblewrap (`bwrap`), compared by
exact equality after trim and lower-case. Everything else including `win32` is unrecognised —
`available` false, backend name `unavailable`. The mechanism is chosen **before** PATH is consulted, so
macOS without `sandbox-exec` still names Seatbelt. **No alias may be added.**

`REQ-SANDBOX-066`: probing proceeds in increasing cost — platform check, launcher lookup on PATH, then
a trial launch — and **no subprocess is spawned once an earlier step has failed**. `REQ-SANDBOX-067`,
`REQ-SANDBOX-068` and `REQ-TOOLS-119`: availability is **demonstrated, never inferred**; the trial runs
the real mechanism, at most once per process, cached; the verdict is binary; a timeout, an error or an
unreadable result is unavailable. `REQ-SANDBOX-070` fixes the trial invocations literally, including
that the Linux trial ends in `-- /bin/sh -c 'true'` and never a bare `-- true`. `REQ-TOOLS-119` and
`REQ-SANDBOX-127`: **no simulated, stubbed, recorded or emulated backend ever yields "available"**, and
conformance is demonstrated by running the trial *and a subsequent sandboxed command* end to end on
each supported platform, judged by six named observable effects on a live process on a real host.

`REQ-SANDBOX-074`, `REQ-SANDBOX-088` and `REQ-TOOLS-118`: there is **no silent fallback,
structurally** — preparing a command for confinement yields either a new confined command string or an
availability error, never the original command. Mode `off` is the single exception and does no probing
at all.

`REQ-SANDBOX-094` to `REQ-SANDBOX-097` and `REQ-SANDBOX-126`: a session requiring confinement the host
cannot deliver **does not start** — no session, no session lock, no snapshot left behind; the run's
event stream carries that refusal as its first and only entry, with no run-start event and no agent
activity before or after. `REQ-SANDBOX-083`, `REQ-SANDBOX-078` and `REQ-SANDBOX-084`: a wrap failure at
command time refuses only that command — `sandbox_unavailable`, exit 126, error severity — and **must
never be absorbed by general error or retry handling**.

`REQ-TOOLS-120` and `REQ-SANDBOX-080` to `REQ-SANDBOX-082`: only a *new command string* is wrapped;
keystroke input, empty-command polls, `list`, and control calls carrying only a session id are
excluded; `background=true` spawns **are** wrapped; a request carrying both a background flag and a
session id counts as a new spawn and is wrapped, so the documented-invalid combination cannot become a
single-field bypass; wrapping is idempotent per issuance and wrappers never nest.

`REQ-SANDBOX-058` and `REQ-SANDBOX-091`: `read-only` grants no writable root; `workspace-write` grants
the session's *actual* execution directory — the worktree when worktree isolation is in use, otherwise
the workspace — first, then each configured additional root, duplicates removed keeping the first; a
configured root missing at render time is **skipped with a log entry**, not an error. `REQ-SANDBOX-056`,
`REQ-SANDBOX-057` and `REQ-TOOLS-116`: `.git` and `.rotaris` are always read-only inside confinement,
with no setting able to remove the exclusion, and the exclusion attaches to the **name** a command
would use rather than to what it points at. `REQ-SANDBOX-077` fixes the Linux carve-out rendering by
case and requires that **no carve-out leave anything on the host filesystem**; a backend that cannot
establish one without creating a host-visible file must refuse the command instead.
`REQ-SANDBOX-075`: the macOS profile places its denials **after** every allowance, because position
decides effect. `REQ-SANDBOX-060` and `REQ-SANDBOX-053`: read access inside confinement is deliberately
**unrestricted**.

`REQ-SANDBOX-063`, `REQ-SANDBOX-064` and `REQ-SANDBOX-079`: the submitted command travels into
confinement as a **single shell argument** and is never split apart again; every embedded path and
rendered argument is quoted so that no crafted workspace path can end its enclosing literal and
introduce rules of its own. **Quoting is a security boundary here, not a formatting nicety**, because
the wrapper is a string submitted to a live shell rather than an argv array.

`REQ-SANDBOX-093`, `REQ-TOOLS-124` and `REQ-TOOLS-125`: confinement status is a pair (active, backend
name) where active requires selected **and** available; selected-but-unavailable reports
`(false, "")`; and the pair is reported identically by the session snapshot, the workspace badge and
the `session.start` event. The specification is resolved **afresh for each call**, from the issuing
run's configuration and the conversation's actual working directory, worktree-aware.

`REQ-SANDBOX-123`: verification checks and probes run through the same terminal enforcement point as
everything else. `REQ-SANDBOX-124`: lifecycle hooks sit deliberately **outside** both confinement and
the permission policy (ADR-0015).

## Alternatives considered

**A — A container or microVM per run.** Stronger and more uniform isolation, and it would give Windows
a story. Ruled out by `REQ-TOOLS-115` — "sandboxing is per-command wrapping of the command string; no
containers are involved" — and by `REQ-SANDBOX-062` and `REQ-TOOLS-123`, since a container changes the
process's view of the filesystem root and the working directory in ways the working-directory rule
forbids. Also incompatible with the requirement that the wrapper be a string entering an existing
persistent shell.

**B — One abstract sandbox interface with a rich API implemented per platform.** The obvious
object-oriented shape. Against: the parity requirement, the three carve-out cases and the quoting rule
are the parts most likely to diverge, and they are exactly the parts that are *shared logic* — which
roots are writable, which names are protected, whether each protected name exists — rather than
platform mechanism. Two independent implementations of the shared part is how parity gets broken.

**C — A shared core computing the confinement specification, and a thin per-platform renderer that
only turns that specification into a command string.** Chosen.

## Decision

Four distinct pieces:

- **Specification computation (shared).** From the run's mode, the session's actual execution
  directory, `runtime.sandbox_writable_roots` and `runtime.sandbox_allow_network`, compute an ordered,
  de-duplicated effective writable-root list, the two protected names per writable root with each
  name's existence classified into the three carve-out cases, and the network flag. A **pure
  function**, tested once, identical on both platforms — which is how parity is obtained rather than
  hoped for.
- **Rendering (per platform, thin).** Seatbelt: emit a profile with allowances first and the carve-out
  denials after them, then `sandbox-exec -p '<profile>' /bin/sh -c '<command>'`. Bubblewrap: emit the
  fixed option sequence with writable binds and then carve-outs, then
  `bwrap <options> -- /bin/sh -c '<command>'`. **Neither renderer decides anything**; both consume the
  specification.
- **Quoting (shared, single-purpose).** One POSIX shell-quoting function and one profile-string
  escaping function, each used everywhere and nowhere else, with property tests over paths containing
  quotes, backslashes, spaces, newlines and non-ASCII.
- **Availability (owned at application lifetime).** The probe implements the cost ordering exactly,
  runs off any interface thread, is bounded at 5.0 s with no extension and no retry, and its verdict
  is a `{ available, backend, reason, remediation }` value cached for the life of the application.
  Because ADR-0002 gives the run host application lifetime, **the cache lives there**; the settings
  re-check control (`REQ-SANDBOX-129`) is the one operation that clears it, returning the label to a
  checking state inside 100 ms while the trial runs behind it.

Failure handling follows the two-level rule the specification insists on, and **the two paths are
separate code and neither may be reached by the other's error handling**: a session whose requested
mode is unavailable does not start; a wrap that fails at command time on a host that passed the
start-time gate refuses that one command and leaves the session running.

## Escalation — Windows users get no confinement at all

`REQ-SANDBOX-065` closes the platform set at `darwin` and `linux` and forbids adding identifiers;
`REQ-SANDBOX-048` forbids an opportunistic mode. A Windows user therefore runs every agent command
unconfined, and an unattended `autonomous` run on Windows is always downgraded to `ask` unless they set
`runtime.allow_unsandboxed_autonomous: true` — at which point the agent runs unattended and unconfined
on their machine. Technical options exist (AppContainer with a restricted token, a Job Object with UI
and process limits, a filter driver, or launching commands inside WSL2) and each would change what the
product **does for a Windows user**; adopting any of them contradicts `REQ-SANDBOX-065` and
`REQ-SANDBOX-048` as written. Options: **(a)** accept the specification and document plainly, on the
settings surface and in the launch advisory, that Windows has no confinement; **(b)** amend
`REQ-SANDBOX-065` to admit a third platform with a genuinely enforcing mechanism, accepting that
`REQ-SANDBOX-127`'s real-host conformance obligation extends to a third CI platform; **(c)** treat WSL2
as the supported Windows path and say so in the product's system requirements rather than only in a
remediation string. **This is a product decision.**

## Consequences accepted

1. `REQ-SANDBOX-127` forces real macOS and real Linux hosts into the conformance pipeline. No emulated
   or recorded backend can stand in. A Windows-only development machine can never exercise
   confinement, which makes this the part of the product most exposed to "works on my machine".
2. `sandbox-exec` has long carried a deprecation notice on macOS. The specification names it literally
   and hands its exact invocation to the user as a copyable remediation, so it must be verified as
   present and functional on every macOS version ADR-0054 claims, and the risk of its removal is a
   standing item rather than a discovered surprise.
3. **`REQ-SANDBOX-077` and `REQ-TOOLS-123` contradict each other.** One requires every carve-out to
   leave the host filesystem holding exactly what it held before and forbids a backend that cannot do
   so from creating anything; the other records as a "documented, deliberate artifact" that an empty
   `.git/` may appear inside a writable root on Linux. **Implement `REQ-SANDBOX-077` — refuse rather
   than create — and raise the contradiction** (OQ-7), because it is the fail-closed reading and is
   stated as an obligation on the backend.
4. **Sandboxed foreground commands run inside a nested `/bin/sh -c`,** so shell state accumulated by
   such a command does not persist. That is an observable behavioural difference between
   `sandbox_mode: off` and an active mode that no requirement acknowledges, and it must be resolved
   before the `terminal` tool's description is written, since the description is what tells the agent
   whether `cd` persists (OQ-35).
5. A denial *inside* active confinement is the host's own and is passed through uninterpreted,
   un-normalised, un-annotated and un-retried (`REQ-SANDBOX-128`); such a command is an ordinary
   non-zero-exit command and is never labelled `sandbox_unavailable`.
6. Launch-failure relabelling requires **all four** of `REQ-TOOLS-122`'s conditions, evaluated over
   stdout and stderr **together** — one unprefixed non-empty line on either stream prevents it, as does
   no output at all.

## Revisit if

The Windows escalation is decided; or macOS removes `sandbox-exec`; or a requirement asks for read
restriction inside confinement, which `REQ-SANDBOX-060` currently forbids and which would change the
profile and the bind set fundamentally.


## First execution — 2026-09-15 (Part AR)

Built as decided: option **C**, a shared core that computes the specification and two thin renderers
that turn it into a command string and decide nothing. The four pieces landed where the decision put
them, in `packages/agent-tools/src/confinement/` — `spec.ts`, `render-seatbelt.ts`, `render-bwrap.ts`,
`quote.ts`, `availability.ts` — with the enforcement point in `terminal/index.ts`, the start-time gate
in `run-host/configuration.ts`, and the two surfaces in `packages/ui`. `pnpm sandbox-proof` drives the
built application through five scenarios; all five passed. `pnpm check` is green.

**Three findings. Two were correct-and-buildable; the third only the proof could reach.**

**1 — the shared core was not platform-independent, because `node:path` is not.** `computeConfinement`
joined each protected name onto its root with `join` from `node:path`. On the build host that returns
`\ws\.git` for `/ws` + `.git` — a path meaningless to Seatbelt and to bubblewrap alike, and precisely
the "separator rewriting" `REQ-SANDBOX-050` forbids by name. The decision above says the shared part
is shared *because* it is the part most likely to diverge; the host's own path module is exactly such a
divergence, hidden inside a function whose whole purpose was to be identical on both platforms.
Latent in production, since the renderers only ever run where `join` is already POSIX — and not latent
in the corpus: `REQ-SANDBOX-061`'s parity would have been broken by the host that *rendered* rather
than the host that ran, which is a defect no conformance test on either supported platform could see.
The falsified reason is kept beside its replacement in `spec.ts`.

**2 — `await` on an absent optional dependency is not free.** The start-time gate needs the verdict
settled first (`REQ-SANDBOX-097`), written as `await deps.settleConfinement?.()` at the top of
`launchSession`. Optional chaining short-circuits the *call*; the `await` still yields a microtask, and
the credential lease moved across a turn — enough to break the overlapping-launch test's synchronous
expectation, for a suspension that buys nothing when no service is wired. Guarded with an `if`.

**3 — the verdict reached every surface except the one that records it.** `REQ-SANDBOX-071` names the
application log alongside the settings label, the launch dialog and the run-refusal record: all four
present the same text. The log line was written from the launch path, on the reasoning that "the launch
is where the verdict first matters". It is where it first *gates* something; it is not where it is
first *taken*. On this platform the user who reads `REQ-SANDBOX-130`'s disclosure and leaves
confinement alone never starts a run at all, so on the one platform where the answer is always "this
host cannot", the log said nothing about why. Every path that settles the verdict now goes through one
function that writes the line once. **No unit test could have found this**: each surface was correct in
isolation, and what was missing was a surface nothing asserted on.

**Found nothing** in the platform map and its closure at two members, the probe's cost ladder and its
refusal to spawn after an earlier failure, the four readings of `REQ-SANDBOX-068`, the writable-root
computation for either mode, the three bubblewrap carve-out cases, the Seatbelt denial ordering, the
quoting property tests, or the wrap-exclusion set of `REQ-SANDBOX-081`.

**Two readings settled while building.**

- **`REQ-SANDBOX-119` and `REQ-SANDBOX-120` are not in conflict; they are two cases of one control.**
  119 says the control is "disabled and cleared" on an unavailable host; 120 says it "remains CHECKED
  and disabled" where the configuration itself demands confinement. The dialog offers the three-value
  selector `REQ-SANDBOX-048` fixes rather than a checkbox, and preselecting the configured value and
  disabling satisfies both: configured `off` shows `off` disabled (cleared), configured non-`off`
  shows that mode disabled (the host never appears to switch the setting off).
- **`REQ-SANDBOX-073`'s "Seatbelt selected on a host that is not macOS" branch is unreachable**, the
  way ADR-0058's case (b) was. The mechanism follows from the platform alone (`REQ-SANDBOX-065`), so
  Seatbelt is selected only on `darwin`. The launcher-not-found text covers what remains of the case
  and quotes what that requirement fixes; no separate branch was written for a state that cannot arise.

**What this execution did NOT establish, and may not be read as establishing.** `REQ-SANDBOX-127` binds
conformance to the observable effect of an active confinement on a live process on a real host of the
platform concerned, and says in advance that a rendering matching `REQ-SANDBOX-075` to
`REQ-SANDBOX-079` word for word is non-conformant if it does not produce that effect. This host is
`win32`. **The six effects have not been demonstrated on either supported platform**, the renderers'
unit tests do not discharge that check, and this note is not a claim that they do. Raised as **IC-8**
in `../implementation-conditions.md`, whose shape is IC-3's: both wait on hosts this project does not
have, and ESC-6 option 2 already priced that extension.

**Reported back 2026-09-28 (R-062): the Linux half of the check IC-8 names has run once, and it did not all
pass.** `pnpm sandbox-proof` now reads the verdict of the host it runs on instead of the Windows verdict. On a Linux
host with bubblewrap 0.9.0 it runs the six effects of `REQ-SANDBOX-127` through the product's terminal enforcement
point, in the built application. All six held. The absent-subpath case of `REQ-SANDBOX-077` did **not** hold: the
`--tmpfs`/`--remount-ro` pair leaves an empty `.git` on the host, because bubblewrap creates the mountpoint through
the writable bind. The renderer's reason "leave nothing on the host" is falsified by that measurement and stays
beside its replacement when one is written. The table, the host, and what the run could not show are in IC-8's
section of `../implementation-conditions.md`. The defect is
[`the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`](../../defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md).
macOS remains unmeasured, and IC-8 is not discharged.

**Reported back 2026-09-29 (R-067): consequence 3's reading is now what the Linux renderer does.** "Implement
`REQ-SANDBOX-077` — refuse rather than create" was chosen on paper and never reached. The renderer rendered case (c)
as a tmpfs, on the belief that the tmpfs left nothing on the host, and the measurement above falsified that belief. No
mount hides an absent name without a mountpoint at that name. So the bubblewrap renderer now throws
`SandboxUnavailableError` for any absent carve-out, and the terminal enforcement point refuses that one command under
`REQ-SANDBOX-083`. The shared specification and the Seatbelt renderer are unchanged. That makes "neither renderer
decides anything" slightly less true: one renderer can now refuse what the other renders. The refusal is a property of
the mechanism, not a policy, so it belongs with the mechanism. `pnpm sandbox-proof` is green on Linux with `bwrap`,
with a third confined launch for the absent case (IC-8, "Linux again — 2026-09-29"). What this costs a Linux user is
raised as OQ-140 in `../open-questions.md`.

**Reported back 2026-09-29 (R-067): the two surfaces that carry `REQ-SANDBOX-130`'s disclosure now read one
predicate.** The settings card drew it for the `unavailable` backend alone. The launch dialog drew it whenever
confinement was not available, which includes a Linux host without `bwrap`, where installing the launcher changes the
answer the disclosure says nothing changes. Both now call `owesNoConfinementDisclosure` in `@rotaris/contracts`,
beside the disclosure's text. `pnpm sandbox-proof` reads the dialog in the built app (scenario 2b). The build before
this repair failed that check on Linux without `bwrap`; the build after it passes with and without `bwrap`
([the note](../../defects/fixed/the-launch-dialog-draws-the-no-mechanism-disclosure-where-a-mechanism-exists.md)).

**Noted 2026-10-15 (fin47, `fin47-accept1-4`): the start-time gate is a run start's, and a retrospective no longer meets it.** The
gate sits in `prepareRun`, which the retrospective (ADR-0065) also used to prepare its setup, so a requested mode refused a pass
that opens no shell wherever the verdict was unsettled or unavailable. `prepareRun` now leaves the gate out of a retrospective's
setup; a run start and a continuation are unchanged
([`../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md)).
A continuation still reads the cached verdict without settling it first — `ConfigureDeps.confinement`'s "a continuation reads what
that launch settled" assumes a launch came first in the run host's life; recorded, not repaired, in
[`../../defects/a-continuation-before-the-confinement-verdict-settles-is-refused-as-confinement-unavailable.md`](../../defects/a-continuation-before-the-confinement-verdict-settles-is-refused-as-confinement-unavailable.md).
