# EXEC slice — architecture proposals — ADR-EXEC-06 — PTY-backed persistent foreground sessions; pipe-backed background sessions; one shipped backend

Part 7 of 9 of [the exec proposal](../exec.md), which indexes every part.

### ADR-EXEC-06 — PTY-backed persistent foreground sessions; pipe-backed background sessions; one shipped backend

**Decision to be made.** How the `terminal` tool executes commands: what a "terminal session" is, how
foreground and background differ mechanically, and which of the two specified backend names ships.

**Constraints.** C-69 (fixed action schema and key vocabulary), C-70 (two bounds; hard timeout kills
the whole process tree and restarts the session; soft pause only without an explicit `timeout`), C-71
(100,000-character oldest-first cap), C-72 (shell state persists and is observably lost on hard
timeout), C-73 (one foreground command per session, waiting; cross-session concurrency; background
never occupies a session), C-74 (`backend` and `kill_status` vocabularies; pooled-recovery behaviour;
observational parity), C-75 (PowerShell on Windows; availability from presence alone), C-76 (loads
regardless of the host's own stdio and encoding), C-77 (background = own subprocess, merged pipes, own
process group), C-79 (exit-code contract), C-84 (never a partial observation), C-91 (a real PTY, with
the process's own reported size equal to the grid's), C-107 (only new command strings are wrapped),
C-112 (the confined command enters the shell as text), C-03 (nothing survives application exit).

**Alternatives.**

1. *Fresh child process per foreground call, pipes only.* Simple, exact exit codes, clean stdout/stderr
   separation, trivially correct truncation. Fatal against C-72 — working directory and exported
   variables must persist across calls and must be *observably lost* on a hard timeout — and against
   C-91, which requires a real pseudo-terminal whose reported size follows the grid.
2. *One PTY per call.* Keeps the PTY requirement and gives a clean exit status per child. Still fails
   C-72's persistence, and re-pays PTY setup on every call.
3. *One long-lived PTY-hosted interactive shell per terminal session, with an out-of-band completion
   protocol; background commands spawned separately with merged pipes.* Chosen.

**Recommendation.** Alternative 3.

*Foreground.* Each terminal session owns one pseudo-terminal running the platform's interactive shell
— `/bin/sh` or the user's login shell on POSIX, `pwsh` else `powershell` on Windows (C-75). A command
is submitted as a line; completion and exit status are recovered by an out-of-band marker protocol
(write the command, then a delimiter-emitting echo of the shell's exit-status variable, and scan the
byte stream for a nonce that cannot appear in ordinary output). This is the price of C-72: a
persistent shell has no per-command wait, so the exit status of C-79 must be manufactured from the
stream. The nonce must be per-session and per-call, and the protocol must survive a command that
itself prints something resembling the delimiter — which argues for a random nonce rather than a fixed
sentinel.

The session is a small state machine — idle, running, resetting — with a queue of one, so a second
foreground call waits (C-73). The hard timeout kills the process tree (POSIX: signal the foreground
process group of the PTY; Windows: the Job Object of ADR-EXEC-01) and then *restarts the session*,
which is exactly the observable C-70 and C-72 require and is where `kill_status: session_reset` /
`reset_failed` come from.

*Background.* A background call is a plain subprocess, shell-interpreted, stdout and stderr merged into
one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows (C-77). It
never touches a terminal session, so C-73's concurrency statement holds by construction. Termination
is SIGTERM → grace-until-exit, capped at 5 s → SIGKILL (C-77); on Windows, where signals do not exist,
this maps onto graceful-close-then-terminate and OQ-9 records that the specification supplies no
mapping.

*Library.* `node-pty` for the PTY. Checked against its current documentation: Linux/macOS/Windows
support, Windows via the ConPTY API requiring Windows 10 1809 or later, winpty support removed;
`spawn(file, args, { cols, rows, cwd, env })`, `onData`, `onExit`, `resize(cols, rows)` and
`kill(signal?)` where the signal argument is ignored on Windows. `resize` is what satisfies C-91's
"the size the process itself reports equals the columns and rows the grid last reported". The
"signal ignored on Windows" note is a direct input to OQ-9.

*Backend name.* Ship `single-session` and stamp it on every observation. `tmux-pool` is a specified
vocabulary value with specified recovery behaviour and specified `kill_status` values
(`pane_replaced`, `replace_failed`) that only a pane-based pool can produce, and the specification
never says when it is selected — OQ-1.

> **ESCALATE — does `tmux-pool` ship?** Building a second, tmux-dependent backend costs a real
> engineering effort, is POSIX-only (so it cannot exist on the Windows/PowerShell backend of C-75),
> adds an external dependency the product does not otherwise have, and must be held observationally
> identical to `single-session` under C-74. Building only `single-session` leaves REQ-TOOLS-103's
> pooled-recovery behaviour and two of REQ-TOOLS-099's four `kill_status` values unreachable, which a
> conformance suite reading the specification literally would score as a gap. The options are: (a)
> ship one backend and withdraw `tmux-pool`, `pane_replaced` and `replace_failed`, keeping the field
> for forward compatibility; (b) ship both, accepting the cost and the platform asymmetry; (c) keep
> both names but define the pooled one as a future backend, which leaves a specified behaviour with no
> implementation. This changes what the product *is* only in the sense of what a conformance claim can
> say, so it is the product owner's call, not this slice's.

**Consequences accepted.**

- The exit status of a foreground command is derived from a marker protocol rather than from
  `waitpid`. It is therefore possible for a pathological command to forge one. The nonce must be
  unguessable per call, and the protocol must be tested against a command that echoes attacker-chosen
  text.
- Under a PTY, stdout and stderr are merged and the shell echoes the submitted line. The capture
  handed to the agent must strip the echoed command and the marker frames; C-81's output-derived
  warning checks then run over the cleaned text, or they will match the command line itself
  (`FAILED ` in a command, for instance). OQ-10 records the stderr advisory that sits awkwardly with
  a merged PTY.
- `background=true` gives pipes, not a PTY, so a background session's terminal-window tab has no real
  terminal to resize; C-89 and REQ-SHELL-106 already anticipate this ("a resize always resizes the
  emulated screen — even when the backend is gone — and then the real terminal when possible").
- C-107 and C-112 mean the confinement wrapper is a *string typed into the live shell*, not an argv
  array. Nothing about the PTY design may weaken that; see ADR-EXEC-08.
- `node-pty` is a native module, so ADR-EXEC-01's rebuild-and-unpack obligation is load-bearing, and
  the ConPTY floor of Windows 10 1809 becomes a platform requirement the distribution slice must
  state.

**Revisit if.** The escalation above is decided; or a requirement arrives that needs a true per-command
exit status (which would push toward alternative 2 and force C-72 to be re-read); or `node-pty` stops
being maintained, in which case the PTY port defined here is the seam to replace.

---

### ADR-EXEC-07 — The runtime owns the authoritative emulated screen; frames carry VT bytes with an explicit final-text frame

**Decision to be made.** Where the terminal emulator lives, what a stream frame carries, and how the
transcript preview and the terminal window are kept identical.

**Constraints.** C-85 (stream naming), C-86 (frame types; the closing `screen` frame's text equals the
observation's final output), C-87 (streaming changes nothing the agent sees; no output dropped or
reordered when repaints cannot keep up), C-88 (sampling period, replay buffer, `0` disabling replay),
C-89 (control channel: send-keys, resize, interrupt, kill), C-90 (a real character grid with
alternate-screen and per-cell attributes), C-91 (real PTY; 100 ms echo; ordering and fidelity; resize
propagated to the process), C-92 (preview and window identical at the same time; no line shown twice
on attach), C-93 (retained screen state is queryable, and its absence means "show the empty state" not
"fabricate a terminal"), C-95 (off-screen surfaces do zero work yet are current on show), C-71 (the
observation's own 100,000-character cap), and OQ-2.

**Alternatives.**

1. *Emulator in each view (xterm.js per surface); the runtime ships raw PTY bytes.* Least work in the
   runtime, and xterm.js is the mature renderer. Against C-92 and C-93: two independent emulators are
   only identical if both consumed the same bytes from the same origin, so a late attach must replay,
   and the replay buffer is a *byte* buffer capped at 256 KiB (C-88) which may not contain the origin.
   Worse, C-93 asks whether "retained screen state still exists" — a question the runtime must answer
   before any view is built, and a view-side emulator cannot answer it. With `terminal_stream_buffer_kb: 0`
   replay is disabled entirely and this alternative can show nothing on attach, while C-92 still
   demands the preview and the window agree.
2. *Emulator in the runtime, frames carry rendered cells; views are dumb painters.* C-92 and C-93 fall
   out trivially — one screen, several views. Against: C-86 describes frames in terms of *text*, and a
   full cell array at 100 ms per live stream is a large, chatty payload for something the shell slice
   would rather hand to xterm.js. It also forces the runtime to own attribute and colour semantics
   that REQ-SHELL-098 maps onto theme tokens in the renderer.
3. *Emulator in the runtime as the authority for retention and identity; frames carry VT bytes;
   views run a display emulator fed those bytes.* Chosen.

**Recommendation.** Alternative 3. The runtime holds a headless emulator per stream — an xterm.js
headless instance with a serialization addon is the obvious fit, and the emulator is the *port*, not
the choice — which consumes PTY output at the C-88 sampling period and maintains: the current screen,
the retained scrollback, the running flag, the exit code, and a `truncated` flag set once retained
frames were dropped (C-89). That object answers C-93's "does retained screen state exist" and is
explicitly *not persisted*, which is why a session read back from storage produces no tabs.

Frames carry VT byte payloads. A `delta` frame is the bytes appended since the previous frame. A
`screen` frame is a serialization of the current screen, emitted on attach and on resync, so a late
attacher receives one `screen` followed by `delta`s and can never show a line twice (C-92) regardless
of the replay-buffer size — which is what makes `terminal_stream_buffer_kb: 0` survivable. Both views
run a display emulator fed the same frame sequence from the same subscription point, so C-92's
"identical cells at the same time" holds by construction rather than by luck.

Because the runtime and the views run the same emulator implementation over the same bytes, the
identity in C-92 is an equality of *inputs*, which is testable: a golden byte stream must produce the
same serialized screen in the runtime and in a view.

**On OQ-2.** C-86's closing frame is required to carry "text equal to the observation's final output
text", which is plain, 100,000-character-capped, oldest-first-truncated text (C-71) — not VT. The
proposal is to emit the closing frame as a `screen` frame whose payload is that plain text, carrying
an explicit marker that it is a literal replacement rather than a VT serialization, so a display can
reset its screen and write it verbatim. This satisfies the letter of C-86 while keeping every earlier
frame VT-faithful, and it is harmless because the process has ended by then (REQ-SHELL-091: output
stays readable and copyable). **This is a reading, not a fact**, and OQ-2 should be resolved before it
is relied on: the alternative reading is that the specification intends plain text throughout, which
would contradict C-90 and C-91.

**Consequences accepted.**

- The runtime pays for one emulator per live stream. C-95's "off-screen surfaces do zero work" applies
  to *surfaces*, not to the runtime's retention — the emulator keeps consuming while nobody watches,
  because C-87 requires the observation to be identical whether or not anyone is attached.
- The C-88 sampling period (default 100 ms, floor 20 ms) governs frame emission, but C-91's 100 ms
  echo budget is measured key-press to painted frame and includes two process hops. At the 100 ms
  default the budget is not met for echo; the sampling period must be treated as a *ceiling on
  batching* with an immediate flush after a keystroke, or the interval lowered for armed streams. This
  is a genuine tension between REQ-TOOLS-126's default and REQ-SHELL-166's budget and should be
  recorded as such.
- Control traffic (send-keys, resize, interrupt, kill) travels the opposite direction on the same
  channel and must be ordered with respect to nothing — C-91 requires only that keystrokes reach the
  *process* in order, which the runtime guarantees by writing them to the PTY in receipt order.
- Retained screen state is not persisted, so C-93's "a session read back from storage produces no
  terminal tabs" is satisfied by doing nothing, which is the correct amount of work.

**Revisit if.** OQ-2 resolves the other way; or a requirement asks for terminal scrollback to survive a
restart, which would make the emulator's state persistent and change everything above; or the shell
slice chooses a renderer whose emulator cannot be run headless, in which case alternative 2 becomes
the fallback.

---

### ADR-EXEC-08 — Confinement is a two-implementation port behind a rendering-and-quoting core, with the availability verdict owned at application lifetime

**Decision to be made.** How OS-level confinement is structured across three platforms, where the
availability verdict is computed and cached, how the rendered invocation is built safely, and what
happens on the platform that has no mechanism at all.

**Constraints.** C-97/C-98 (three modes, two sources, no third route), C-99/C-100 (closed platform
set; mechanism chosen before PATH; native Windows unavailable with fixed remediation), C-101 (probe
order, no subprocess after a failed step), C-102/C-103 (demonstrated not inferred; literal trial
invocations; no emulated backend; conformance by observable effect on a real host), C-104 (no silent
fallback, structurally), C-105 (a session that cannot get its confinement does not start, and the
refusal is the run stream's first and only entry), C-106 (a wrap failure refuses one command, exit
126, session continues), C-107 (only new command strings wrapped; both-flags case wrapped;
idempotent), C-108/C-109/C-110 (writable-root computation, the `.git`/`.rotaris` exclusion attached to
the name, the three Linux carve-out cases, nothing left on the host), C-112 (single shell argument;
quoting is a security boundary), C-113 (working directory untouched), C-114 (the agent sees its own
command), C-115 (four-condition relabelling over both streams), C-116 (in-sandbox denials passed
through uninterpreted), C-117/C-118 (status pair; resolved afresh per call, worktree-aware), C-05/C-06
(verdict cached at application lifetime; probe off the interface thread), C-119 (verification checks
go through the same enforcement point; hooks deliberately outside it).

**Alternatives.**

1. *A container or VM per run* (Docker, a microVM). Stronger and more uniform isolation, and it would
   give Windows a story. Ruled out by REQ-TOOLS-115 — "Sandboxing is per-command wrapping of the
   command string; no containers are involved" — and by C-113, since a container changes the process's
   view of the filesystem root and the working directory in ways C-113 and REQ-SANDBOX-127's
   working-directory effect forbid. Also incompatible with C-112's requirement that the wrapper be a
   string entering an existing persistent shell.
2. *One abstract "sandbox" interface with a rich API that each platform implements independently.*
   The obvious object-oriented shape. Against: C-109's parity requirement, C-110's carve-out cases and
   C-112's quoting rule are the parts most likely to diverge, and they are exactly the parts that are
   *shared logic* (which roots are writable, which names are protected, whether each protected name
   exists) rather than platform mechanism. Two independent implementations of the shared part is how
   C-109's parity gets broken.
3. *A shared core computing the confinement specification, and a thin per-platform renderer that only
   turns that specification into a command string.* Chosen.

**Recommendation.** Alternative 3, with four distinct pieces:

- **Specification computation (shared).** From the run's mode, the session's actual execution
  directory (worktree-aware, C-118), `runtime.sandbox_writable_roots` and
  `runtime.sandbox_allow_network`, compute an ordered, de-duplicated effective writable-root list
  (C-108), the two protected names per writable root with each name's existence classified into
  C-110's three cases, and the network flag. This is a pure function, tested once, identical on both
  platforms — which is how C-109's parity is obtained rather than hoped for. Missing roots are skipped
  with a log entry, never an error.
- **Rendering (per platform, thin).** Seatbelt: emit an SBPL profile with allowances first and the
  carve-out denials after them (C-110), then
  `sandbox-exec -p '<profile>' /bin/sh -c '<command>'`. Bubblewrap: emit the fixed option sequence
  with writable binds and then carve-outs (`--ro-bind-try` or `--tmpfs`+`--remount-ro`), then
  `bwrap <options…> -- /bin/sh -c '<command>'`. Neither renderer decides anything; both consume the
  specification.
- **Quoting (shared, single-purpose).** One POSIX shell-quoting function and one SBPL string-escaping
  function, each used everywhere and nowhere else, with property tests over paths containing quotes,
  backslashes, spaces, newlines and non-ASCII. C-112 makes this a security boundary because the
  wrapper is text submitted to a live shell (C-107), not an argv array — a crafted workspace path that
  escapes its literal would let a command author its own confinement rules.
- **Availability (owned at application lifetime).** The probe implements C-101's cost ordering
  exactly, runs off any interface thread, is bounded at 5.0 s with no extension and no retry, and its
  verdict is a `{ available, backend, reason, remediation }` value cached for the life of the
  application (C-05). Because ADR-EXEC-01 gives the runtime application lifetime, the cache lives
  there; the settings re-check control (REQ-SANDBOX-129) is the one operation that clears it, and it
  returns the label to a checking state inside 100 ms while the trial runs behind it (C-06).

Failure handling follows the two-level rule the specification insists on: a session whose requested
mode is unavailable **does not start** (C-105), and a wrap that fails at command time on a host that
passed the start-time gate refuses that one command with `sandbox_unavailable` / exit 126 and leaves
the session running (C-106). Those are separate code paths and neither may be reached by the other's
error handling — C-104 and REQ-SANDBOX-084 are explicit that no general retry or error handler may
absorb a confinement failure into an unconfined execution.

**On native Windows.**

> **ESCALATE — Windows users get no confinement at all.** C-99 closes the platform set at `darwin` and
> `linux` and forbids adding identifiers; C-97 forbids an opportunistic "confine where possible" mode.
> A Windows user therefore runs every agent command unconfined, and an unattended `autonomous` run on
> Windows is always downgraded to `ask` unless they set `runtime.allow_unsandboxed_autonomous: true`
> (C-45), at which point the agent runs unattended and unconfined on their machine. Technical options
> exist — AppContainer with a restricted token, a Job Object with UI and process limits, a filter
> driver, or launching commands inside WSL2 — and each would change what the product *does for a
> Windows user*. Adopting any of them contradicts C-99 and C-97 as written. The options are: (a)
> accept the specification and document plainly, on the settings surface and in the launch advisory,
> that Windows has no confinement; (b) amend REQ-SANDBOX-065 to admit a third platform with a
> genuinely enforcing mechanism, accepting that C-103's "demonstrated on a real host" obligation then
> extends to a third CI platform; (c) treat WSL2 as the supported Windows path and say so in the
> product's system requirements rather than only in a remediation string. This is a product decision.

**Consequences accepted.**

- C-103 forces real macOS and real Linux hosts into the conformance pipeline. No emulated or recorded
  backend can stand in, and the six effects of REQ-SANDBOX-127 must be exercised end to end on each.
  A Windows-only development machine can never exercise confinement, which makes this the slice most
  exposed to "works on my machine".
- `sandbox-exec` has long carried a deprecation notice on macOS. The specification names it literally
  (C-102) and hands its exact invocation to the user as a copyable remediation (REQ-SANDBOX-073), so
  it must be verified as present and functional on every macOS version the distribution slice claims,
  and the risk of its removal is a standing item rather than a discovered surprise.
- C-110's "nothing left on the host" and C-113's "documented empty `.git/`" contradict each other
  (OQ-5). The recommendation is to implement C-110 — refuse rather than create — and to raise the
  contradiction, because C-110 is the fail-closed reading and is stated as an obligation on the
  backend.
- Sandboxed foreground commands run inside a nested `/bin/sh -c`, so shell state accumulated by such a
  command does not persist (OQ-3). This is an observable behavioural difference between
  `sandbox_mode: off` and an active mode that the specification does not acknowledge, and it must be
  resolved before the terminal tool's description is written, since the description is what tells the
  agent whether `cd` persists.
- Lifecycle hooks run outside confinement and outside the policy (C-119). That boundary must be stated
  in the product documentation, not only in the specification.

**Revisit if.** The Windows escalation is decided; or macOS removes `sandbox-exec`; or a requirement
asks for read restriction inside confinement, which C-111 currently forbids and which would change the
profile and the bind set fundamentally.

---

### ADR-EXEC-09 — `fetch` is a hand-driven redirect loop over a manual-redirect HTTP client in the runtime

**Decision to be made.** How the egress policy is enforced for the one tool whose connections the
product opens itself, and which HTTP client that is.

**Constraints.** C-120 (two enforcement points, not to be conflated), C-122 (canonicalization with
required results, IDNA both ways, unknown host = deny/remote/matches-nothing), C-123 (label-wise
matching, single leading `*.`, bare name excluded, other `*` an error), C-124 (denied → allowed →
default; closed disposition vocabulary), C-125/C-126 (textual locality, no name resolution, and the
accepted consequence), C-127 (classify before any connection; never follow redirects automatically;
20-hop budget), C-128 (exhaustive redirect resolution rules), C-129 (`ask` belongs to the gate; the
named host pre-seeded; a new `ask` host mid-chain refused), C-130 (eight closed failure kinds, three
fixed error classes), C-131 (six malformed conditions before any connection; `timeout: 0` = no limit),
C-132 (three-level timeout precedence, reported), C-133 (window then cap; window alone never sets
`truncated`), C-134 (fixed rendering), C-135/C-136 (per-run saved configuration; permissive fallback
with no run), C-137 (the URL is the gated subject).

**Alternatives.**

1. *Electron's `net` module (Chromium's network stack).* Honours system proxy configuration, has a
   mature TLS stack, and exposes a `redirect` event that can cancel a hop. Against: it lives in main
   or in a session-bound context, and ADR-EXEC-01 puts tool execution in the runtime; C-127's promise
   that "a denied host observes zero connection attempts" is easier to guarantee when the code decides
   to open a socket than when it cancels a redirect a stack has already begun. Its proxy behaviour is
   also a hidden third party in a promise about which host is contacted (OQ-8).
2. *Node's built-in `fetch` (undici) with `redirect: 'manual'`, driving the chain by hand.* Chosen.
3. *A raw `http`/`https` request implementation.* Maximum control, and it would make "zero connection
   attempts" trivially auditable. Against: it re-implements TLS session handling, decompression,
   header parsing and character-set handling for no requirement that asks for it, and every one of
   those is a place to be wrong.

**Recommendation.** Alternative 2, structured as three separable pieces so that each is testable
without a network:

- **A pure classifier.** `canonicalizeHost(input) -> string`, `matchPattern(pattern, host) -> boolean`,
  `classify(policy, host) -> allow | ask | deny`, and `isLocal(host) -> boolean`. All pure, all
  table-tested against the worked examples the requirements state, which are numerous and exact
  (C-122, C-123, C-124, C-125). Canonicalization uses the WHATWG URL parser plus `url.domainToASCII`
  for IDNA; the IPv6 and IPv4-mapped canonicalization C-125(d) requires falls out of WHATWG parsing,
  which normalizes `::ffff:127.0.0.1` and `::ffff:7f00:1` to the same form. OQ-4 must be resolved
  first, because REQ-TOOLS-086 and REQ-SANDBOX-006 disagree on whether the canonical form of an IPv6
  literal is bracketed; the recommendation is REQ-SANDBOX-006's unbracketed form, which is the one
  with stated required results.
- **A hand-driven redirect loop.** Classify → open one request with redirects disabled → if 3xx,
  resolve the location per C-128's exhaustive rules, classify the *resolved absolute* URL, and loop,
  up to 20 hops. A per-request `permittedHosts` set is seeded with the named host (C-129) and grows as
  hosts classify `allow`, so a hop back onto a permitted host is not re-gated. A new host classifying
  `ask` mid-chain is refused, because there is no way to prompt in flight.
- **A validation front door.** C-131's six conditions are checked before anything else and produce
  `invalid_request` with `error_class: InvalidFetchRequest`, null `status_code` and a detail naming
  the parameter, its value and the constraint. `timeout: 0` is carried as *no deadline*, which means
  it must not be handed to a timeout helper that treats 0 as "already expired".

Shaping (C-133) is applied after the body is decoded: window first, cap second, `truncated` set only
by the cap. Rendering (C-134) is one function with a snapshot test, since the block names and the
sorted-keys/nulls-omitted rule are observable.

**Consequences accepted.**

- C-126 stands: classification is textual, so an allow-listed name resolving to a private or
  link-local address is permitted, and no DNS pinning is performed. This is the specification's choice
  and must be documented on the settings surface rather than silently strengthened — strengthening it
  would break REQ-SANDBOX-018's explicit "the test is textual and performs no name resolution".
- Proxy behaviour is unspecified (OQ-8). undici does not honour `HTTP_PROXY` by default, so choosing
  it makes "no proxy" the de facto answer. That is the fail-closed direction for C-127's zero-
  connection promise, but it will surprise corporate users and should be an explicit decision rather
  than a library default.
- C-120 and C-121 remain: this ADR gives per-host control only for `fetch`. Terminal commands get the
  heuristic of C-40 plus, inside confinement, a binary switch — and on Windows not even that. A
  loopback-proxy design that would give per-host filtering for terminal traffic on every platform was
  considered and is **rejected**, because REQ-SANDBOX-047 places destination-aware filtering of
  terminal traffic explicitly out of scope and would require TLS interception to be effective. If the
  product owner wants it, that is a scope change, not an implementation choice.
- The permissive fallback of C-136 is a real code path (a fetch with no owning run) and must be
  exercised in tests, or it will rot into the only path where an allow-everything policy is
  constructed.

**Revisit if.** OQ-4 or OQ-8 resolves; or REQ-SANDBOX-047 is reopened; or a requirement asks for
egress control over MCP servers' own network traffic, which nothing currently covers and which this
design does not reach.

---
