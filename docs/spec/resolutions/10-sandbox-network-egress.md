---
reference: ROTARIS-CRW-001
domain: sandbox-network-egress
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 10, Command Sandboxing and Network Egress Policy

This record disposes of every open question raised in the draft of
[`../10-sandbox-network-egress.md`](../10-sandbox-network-egress.md) (domain 10, requirement prefix
`REQ-SANDBOX`). The body of that specification has been amended so that each decision below is
stated normatively in place; the numbering of the original open questions is preserved here so the
draft and the resolved specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. Requirements in this
   domain whose only observable surface was a shell invocation are **withdrawn**, and every
   capability that reached a user only through such a surface is carried by a new desktop-reachable
   requirement. See the graphical-only sweep below. Running external programs is untouched: this
   whole domain is about confining programs the product itself starts — the agent's terminal
   commands, the fetch tool's own connections, version-control invocations and the availability
   trial — and all of that remains fully in scope. What is removed is any way for a *user* to drive
   this product from a shell.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, a parseable output format, or
   a command a user is meant to copy and run).

Cross-domain vocabulary was taken from `05-tools-permissions-approvals.md` (REQ-TOOLS-053 and
REQ-TOOLS-069, an unattended run is one whose session has no registered approval presenter;
REQ-TOOLS-114, which now cites this domain's REQ-SANDBOX-048 for the sandbox mode vocabulary;
REQ-TOOLS-118, canonical on a session that requires an unavailable sandbox; REQ-TOOLS-116 and
REQ-TOOLS-132, the absolute-path rule and the `runtime.additional_read_only_roots` key) and
`12-desktop-shell-windows.md` (REQ-SHELL-125 cites REQ-SANDBOX-048 for the same vocabulary). No
other specification was consulted, and no identifier, name, or phrasing was taken from any other
implementation.

New requirements added by these resolutions: **REQ-SANDBOX-126** through **REQ-SANDBOX-129**. No
requirement identifier was renumbered, reused, or deleted. Of the 19 open questions raised in the
draft, all 19 are resolved: none omitted, none moot, and none escalated.

Three amendments fall outside the numbered questions and are recorded here for completeness.
REQ-SANDBOX-010's requirement that the rejection message contain the literal words "not supported"
is restated as required information content under decision 5, the example pattern `*.example.com`
remaining literal because it is a form the user copies. REQ-SANDBOX-050 now cites REQ-TOOLS-116 for
the shape of the absolute-path refusal, so the two domains state one rule rather than two. And
REQ-SANDBOX-053's list of adjacent settings gains `runtime.additional_read_only_roots`, with a note
that OS confinement imposes no read restriction at all (REQ-SANDBOX-060), so that key governs the
file tools' path fence and never this domain's confinement.

## Graphical-only sweep

The product has no command-line interface and no terminal user interface, so a requirement reachable
only from a shell is withdrawn and its capability re-sited on the desktop.

| Withdrawn | Why its only surface was a shell | Capability now carried by |
| --- | --- | --- |
| **REQ-SANDBOX-111** — a non-interactive run asking for confinement the host cannot deliver is refused before the event stream begins, standard output carrying a single result event with status `error` and the process exiting with code 1 | Its entire observable surface was a process's standard output and its exit status. With no shell entry point there is no process for a user to start and no exit status for anything to read | The capability is *a machine-readable, ordered record that this run was refused before it did anything, carrying the reason and the remediation*. It is carried by **REQ-SANDBOX-126** (new), which makes the refusal the first and only entry on that run's event stream and requires it to carry the same reason and remediation text the user is shown, and by REQ-SANDBOX-120, which already carries the user-facing notice |

Four further requirements named a shell venue beside one that survives. Each keeps its substance and
loses only the shell half, so nothing is withdrawn and no capability moves:

- **REQ-SANDBOX-071** — the list of surfaces that must present identical availability text drops
  "command-line errors" and now reads: the desktop settings surface, the per-session launch dialog,
  the run-refusal record of REQ-SANDBOX-126, and the application log. The point of the requirement —
  that the guidance never differs by surface — is strengthened, not weakened, by naming surfaces
  that exist. The three fields the platform confinement service must answer with are unchanged and
  are exactly the backend name, the cause sentence (`reason`) and the suggested-fix sentence
  (`remediation`).
- **REQ-SANDBOX-101** — "Command-line runs placed in the background, headless runs, and any surface
  that registers no approver are unattended" becomes the single condition of REQ-TOOLS-053 and
  REQ-TOOLS-069: a run is unattended exactly when its session has no registered approval presenter,
  whether one was never wired or the presenter was torn down. Since every run is desktop-started,
  that is the only way an unattended run arises.
- **REQ-SANDBOX-109** — "the machine-readable run-start event of a headless/streamed run" becomes
  the run-start event on the session event stream, which every run emits.
- **REQ-SANDBOX-122** — "There is no CLI launch flag for the sandbox: CLI and headless surfaces read
  `runtime.sandbox_mode` from configuration only" becomes the invariant that survives the shell's
  removal and is worth keeping: the confinement mode has exactly two sources — the layered
  configuration, and the per-session launch dialog override of REQ-SANDBOX-119 — and no third route
  of any kind exists. This agrees with REQ-TOOLS-114's "no launch-time override of any kind", which
  denies an argv override rather than the dialog.

**REQ-SANDBOX-107**'s "surfaces that hand off work to be performed without a supervisor" named no
venue that now exists; the advisory is re-sited on the per-session launch dialog of
REQ-SANDBOX-119. **Data & Formats** loses the sentence "headless run refused for an unavailable
sandbox exits 1"; the observation exit code 126 of REQ-SANDBOX-083 stays, because it is a child
process's exit status reported inside a tool observation, not this product's own.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
</content>
| 1 | RESOLVED | The rendered invocation is a means, not the contract, and a new requirement says so: a backend is conformant only by its observable effect on a live process on a real host of that platform, and a rendering matching the text word for word while producing no confinement is non-conformant. Six effects must be demonstrated on each supported platform — a write inside an effective writable root succeeds; a write outside every writable root and outside the temporary locations is refused; a write under `.git` or `.rotaris` is refused whether or not the subpath existed beforehand; a read outside every writable root succeeds; an outbound socket is refused while `sandbox_allow_network` is false and succeeds while it is true; and the working directory the command observes is unchanged. No backend may be reported `available` on the strength of a rendered string, and no substitute or emulated backend may pass this check on behalf of an absent one. Absent hardware is a scheduling problem, not a specification gap. | REQ-SANDBOX-127 (new), REQ-SANDBOX-075 to REQ-SANDBOX-079 |
| 2 | RESOLVED | Nothing remains and nothing has to be cleaned up. Every carve-out exists only inside the confined process's own mount view; once the command ends the host filesystem holds exactly what it held before with respect to that name, so a protected subpath absent under case (c) is still absent afterwards. The obligation is placed on the backend rather than on a cleanup step: a backend that cannot establish a carve-out without creating a host-visible file or directory must not create one — it refuses the command under REQ-SANDBOX-083 instead. A cleanup pass was rejected because it would have to run after a process the product may have lost track of, and a missed pass would leave a `.git` name the workspace never had. | REQ-SANDBOX-077, REQ-SANDBOX-078 |
| 3 | RESOLVED | Deliberately unspecified, and now stated as a decision rather than left as a gap. A denial inside an active confinement is the host operating system's own: the product does not interpret, translate, normalize, annotate, or retry it, the confined program sees whatever the platform gives it, and that program's output reaches the terminal observation unchanged. No requirement in this domain turns on an error number or a system-log entry, so a write refused by confinement is indistinguishable from one refused by ordinary file permissions — the alternative would oblige the product to parse platform-specific errors it cannot enumerate and would drift with every kernel release. Such a command stays an ordinary nonzero-exit command and is never labelled `sandbox_unavailable`, which REQ-SANDBOX-085's prefix test reserves for confinement that failed to *start*. | REQ-SANDBOX-128 (new), REQ-SANDBOX-085 |
| 4 | RESOLVED | Three parts. The verdict is binary — no partial or degraded availability exists, so a partly restricted host either completes the trial or does not. The 5.0 s bound is hard: a trial still running at 5.0 s is terminated, counts as a failure, is never extended and is never retried within the process, so a slow launcher reads as unavailable, which costs only stricter prompting. And a host that passes the trial but later refuses a real confinement is not a hole, because that command is refused by REQ-SANDBOX-083 or relabelled by REQ-SANDBOX-085 and never runs unconfined. The per-process cache left a real usability gap — a user who installs `bwrap` had to restart the application — so a re-check control is added to the settings runtime section: it discards the cached verdict and probes afresh, off the interface thread, with the label entering a checking state inside the 100 ms responsiveness budget, and the new verdict governs later sessions without disturbing one already running. | REQ-SANDBOX-129 (new), REQ-SANDBOX-067, REQ-SANDBOX-069 |
| 5 | RESOLVED | REQ-SANDBOX-031 is restated exhaustively. A relative location resolves as a URI reference against the URL of the hop that returned it, and the *resolved* absolute URL, not the raw header text, is what gets classified before the next connection opens. A redirect carrying no location header, or an empty or whitespace-only one, ends the chain and is the final result: `final_url` is that hop's URL, `status_code` its own status, `truncated` computed from its body as usual, and no `failure_kind` unless the status is ≥ 400 — a 3xx with no location is not by itself an error. An internationalized host in a location is canonicalized by REQ-SANDBOX-006 and REQ-SANDBOX-007 before classification, so a Unicode and an IDNA spelling of one host classify identically in both directions. A location that cannot be resolved into an absolute URL bearing a host yields the unknown host, which classifies deny, so the hop is refused `egress_redirect_denied` with no connection opened. | REQ-SANDBOX-031, REQ-SANDBOX-007, REQ-SANDBOX-008 |
| 6 | RESOLVED | The EFFECTIVE mode after tightening is canonical. Reporting the requested mode was rejected outright: it makes `permission_mode: autonomous` observable beside `sandboxed: false` on a run every decision of which resolves as `ask`, which is precisely the misreading REQ-SANDBOX-104's single-reading stamp exists to prevent, and the event's whole value is telling a reader how this run will behave. Nothing is lost, because whenever requested and effective differ the `permission_mode_downgraded` timeline event is emitted from that same reading of status and carries both modes — so the requested mode is always recoverable, and the absence of that event means the two were equal. No new field was invented for the requested mode. | REQ-SANDBOX-110, REQ-SANDBOX-104 |
| 7 | RESOLVED | One precedence chain, highest first: the call's own `timeout` parameter; then the owning run's `runtime.tool_call_timeout` (30 s by default); then the built-in 10.0 s, which is reachable only where there is no owning run to read a value from. A lower level never overrides a higher one, so a run-wired fetch with no `timeout` parameter always takes `runtime.tool_call_timeout` and never 10.0 s — the run's configured budget is the user's expressed intent and a per-tool constant must not silently undercut it. Whichever level supplied the value is reported as `timeout_seconds` on the result. This record first wrote the key as `runtime.tool_timeout`; the canonical spelling settled by REQ-CONFIG-115 is `runtime.tool_call_timeout`, and it is what appears above. | REQ-SANDBOX-021, REQ-SANDBOX-020, REQ-SANDBOX-035, REQ-CONFIG-115 |
| 8 | RESOLVED | Under the message-text decision no literal wording is fixed; the information each diagnostic must carry is. Empty pattern: which host list it came from and that a pattern may not be empty. Redirect budget: the budget that was exhausted and that no terminal response was ever reached. Timeout: the deadline that expired in seconds and which precedence level of REQ-SANDBOX-021 supplied it. Transport failure: the host being contacted and the platform's own error text, unaltered. HTTP failure: the numeric status code, which is machine-readable and also carried in `status_code`. The one literal retained anywhere in this family is the example pattern `*.example.com`, kept because it is a form the user copies rather than prose. | REQ-SANDBOX-009, REQ-SANDBOX-010, REQ-SANDBOX-024, REQ-SANDBOX-033 |
| 9 | RESOLVED | REQ-SANDBOX-095 is canonical and agrees with REQ-TOOLS-118, which was declared canonical in domain 05: a session requiring confinement the host cannot deliver **does not start**, leaves no session and no session lock, and reports the availability reason and remediation. The alternative — a session that starts and refuses every command — was rejected because it produces a run that can plan but never act, which serves the user worse than an immediate refusal carrying a reason and a fix. REQ-SANDBOX-098 is restated accordingly: no live run ever reaches mode resolution in the "selected but unavailable" state, so at resolution time confinement is inactive exactly when `sandbox_mode` is `off` and active exactly when a non-off mode was proved available. REQ-SANDBOX-105's chain becomes three cases: mode `off` on a failing host starts and is tightened to `ask` and recorded unconfined; a non-off mode on a failing host does not start and resolves no mode at all; a non-off mode on a passing host keeps `autonomous` and is recorded confined with the backend name. The `sandbox_unavailable` refusal of REQ-SANDBOX-083 is not made dead by this — it remains the outcome when wrapping fails at command time on a host that passed the start-time gate. | REQ-SANDBOX-095, REQ-SANDBOX-098, REQ-SANDBOX-105, REQ-SANDBOX-083 |
| 10 | RESOLVED | Two answers. `timeout: 0` means the call has no time limit, the same reading `runtime.approval_timeout_seconds: 0` already carries in this domain, so zero means "no deadline" everywhere here and never "a deadline already past" — one reading of zero is worth more than the marginal usefulness of an instantly-expiring fetch. And the fetch `failure_kind` vocabulary gains `invalid_request`, spelled exactly as the terminal observation's member of the same name so one word means one thing across the product. A request is malformed, and refused before any connection is opened, when `url` is absent/empty/whitespace, `timeout` is negative, `max_lines` < 1, `from_line` < 1, `to_line` < 1, or `to_line` < `from_line`; it yields `is_error` true, null `status_code`, `error_class` `InvalidFetchRequest`, and a detail naming the offending parameter, its value, and the constraint broken. A window starting past the end of the body stays legal and yields no lines with `truncated` false. | REQ-SANDBOX-020, REQ-SANDBOX-025, REQ-SANDBOX-034, fetch result shape |
| 11 | RESOLVED | Two answers, each taking the less destructive option. A blank or whitespace-only writable-root entry is **dropped** at load, exactly as a blank host pattern is under REQ-SANDBOX-004: trimming already happens first, so refusing the residue as not absolute would fail an entire configuration file over a stray blank line. A non-blank, non-absolute entry is still refused at load and at assignment, now citing REQ-TOOLS-116 so domains 05 and 10 state one rule rather than two. A configured root that does not exist when the invocation is rendered is **skipped**, not an error: the remaining roots apply, the command starts, and the skip is logged with the path. A configured root is optional convenience and must not be able to stop a session. The consequence is stated so it cannot surprise — a skipped root is not writable inside that command even if the command creates the directory, because the writable set is fixed at render time and the next command re-renders it. The workspace root is exempt from all of this: it always exists, being the directory the session runs in. | REQ-SANDBOX-050, REQ-SANDBOX-058 |
| 12 | RESOLVED | The recognized set is closed at exactly two members — the host runtime's macOS family identifier `darwin` and its Linux family identifier `linux`, which a WSL2 distribution also reports — compared by exact equality after trimming and lowercasing. Everything else, `win32` included, is unrecognized, yields `available` false with backend name `unavailable`, and takes the diagnostics of REQ-SANDBOX-073, which quote the identifier actually detected. No legacy or historical identifier is recognized and none may be added: this is a clean-room product with no earlier release to stay compatible with, and an open-ended alias list is exactly what made the mapping untestable. Closing the set makes it exhaustively testable, which was the point of the question. | REQ-SANDBOX-065, REQ-SANDBOX-073 |
| 13 | RESOLVED | The Linux trial ends in the same final tokens every rendered session invocation uses — the interpreter form `/bin/sh -c` with a program that exits 0 — never a bare `true`. The trial exists to prove the mechanism as a real command will exercise it, and a bare program leaves the interpreter step every real command depends on untested, so the trial would pass on a host where the first real command fails. The macOS trial deliberately does not follow the pattern and stays the literal line REQ-SANDBOX-070 quotes: Seatbelt's failure mode is the profile rather than the exec chain, and REQ-SANDBOX-073 hands that exact line to the user as a command to run by hand, so it must stay copyable. The asymmetry is now stated rather than left to be discovered. | REQ-SANDBOX-070, REQ-SANDBOX-079, rendered-invocation reference |
| 14 | RESOLVED | Only that command is refused; the session continues. It is refused exactly as REQ-SANDBOX-083 requires, `failure_kind` `sandbox_unavailable` and exit code 126, and the next command submitted is rendered and launched afresh. The session already passed the start-time availability gate under the open question 9 decision, the cause is per-command and may be a transient filesystem race of the kind REQ-SANDBOX-078 itself describes, and ending the session would discard the run's accumulated context over a race that may not recur. Neither reading ever runs a command unconfined, so the choice is made on cost to the user alone. A session that keeps failing this way keeps refusing commands. | REQ-SANDBOX-078, REQ-SANDBOX-083 |
| 15 | RESOLVED | Standard output and standard error together, as one set of captured lines. The test's purpose is to establish that the command produced no output of its own, and a line on standard output is exactly such evidence; restricting the test to standard error would relabel as broken confinement a command that had already written real output, destroying the distinction REQ-SANDBOX-085 exists to draw. So a command that writes an ordinary line to standard output before the launcher fails is not relabelled, and one non-empty unprefixed line on either stream prevents relabelling. | REQ-SANDBOX-085, terminal observation reference |
| 16 | RESOLVED | The pin gives way to a tightening and stands against a loosening, compared by the permissiveness ordering of REQ-SANDBOX-046 (restricted < ask < autonomous). More restrictive than the pin: the persona takes the new mode. More permissive than the pin: the pin stands, the persona keeps its pinned mode and is listed in `skipped_personas`. Equal to the pin: nothing changes for that persona and it is not listed, since nothing was skipped in effect. The asymmetry follows the domain's fail-closed posture — a user tightening mid-session must be able to tighten everything, while loosening must never happen behind a pin the user deliberately set. | REQ-SANDBOX-106, REQ-SANDBOX-046 |
| 17 | RESOLVED | Only the configuration persisted on disk governs a run; unsaved edits reach nothing. REQ-SANDBOX-038 reads the owning run's current configuration, and that configuration is what the loader read from the file, so a run started while the settings surface holds unsaved sandbox or egress edits uses the saved values. The alternative would make a run's confinement and egress policy depend on unwritten interface state that no record could later reproduce. Because the trap is easy to fall into, the surface must show it: an unsaved-changes indication while the runtime section holds unsaved changes to any of the six settings, and, on starting a session in that state, a warning conveying which settings differ from the saved configuration and that the run will use the saved ones. The warning advises and does not block. | REQ-SANDBOX-118, REQ-SANDBOX-038, REQ-SANDBOX-113 |
| 18 | RESOLVED | Yes — a bare `curl` and a bare `npx` are network-reaching. A catalogued prefix's trailing `*` stands for zero or more further tokens, so a segment consisting of the prefix's literal tokens alone matches. Requiring at least one further token would leave a trivial bypass, and this domain resolves closed everywhere else. Matching is by whole tokens, so `curl` matches the segments `curl` and `curl https://example.com` but never `curling`, and a multi-token prefix must match every one of its tokens in order. | REQ-SANDBOX-043, network-reaching command catalog |
| 19 | RESOLVED | The whole `127.0.0.0/8` range is local — any IPv4 literal whose first octet is 127, so `127.0.0.2` and `127.1.2.3` join `127.0.0.1` — because every address in that range is loopback by definition and none of it leaves the machine, so gating it would gate a genuinely local target for no gain. IPv6 loopback is local in any spelling canonicalizing to `::1`, including `0:0:0:0:0:0:0:1`, and IPv4-mapped and IPv4-compatible spellings whose embedded IPv4 address is in `127.0.0.0/8` are local too, `::ffff:127.0.0.1` and `::ffff:7f00:1` alike — otherwise one URL spelling of one address would classify two different ways. The test stays purely textual with no name resolution. The boundary is drawn explicitly on the other side as well: the unspecified addresses `0.0.0.0` and `::`, private-range addresses, and link-local addresses including cloud metadata remain remote and gated. | REQ-SANDBOX-018, REQ-SANDBOX-019 |

## Requirements added

- **REQ-SANDBOX-126** — the machine-readable record of a run refused before it began for unavailable
  confinement: the first and only entry on that run's event stream, a terminal result with status
  `error` carrying the same reason and remediation the user is shown. Carries the capability of the
  withdrawn REQ-SANDBOX-111.
- **REQ-SANDBOX-127** — conformance of a confinement backend is decided by observable effect on a
  live process, never by the text of a rendered invocation; six effects enumerated.
- **REQ-SANDBOX-128** — a denial inside an active confinement is the host's own and is passed through
  uninterpreted; no requirement turns on an error number or a system-log entry.
- **REQ-SANDBOX-129** — a re-check control on the settings runtime section that discards the cached
  availability verdict and probes afresh, off the interface thread.

## Cross-domain effects

- REQ-SANDBOX-048 is unchanged and stays the canonical sandbox-mode vocabulary for REQ-TOOLS-114 and
  REQ-SHELL-125.
- REQ-SANDBOX-095 now states the same rule as REQ-TOOLS-118 and cites it: a session requiring an
  unavailable sandbox does not start. REQ-SANDBOX-098 and REQ-SANDBOX-105 were rewritten to agree,
  and REQ-SANDBOX-126 records the refusal on the run's event stream.
- REQ-SANDBOX-071 confirms the three fields the platform confinement service answers with — backend
  name, cause sentence (`reason`), suggested-fix sentence (`remediation`).
- REQ-SANDBOX-101 defines an unattended run by REQ-TOOLS-053 and REQ-TOOLS-069 alone.
- REQ-SANDBOX-050 cites REQ-TOOLS-116 for the absolute-path rule and message shape; REQ-SANDBOX-053
  records that `runtime.additional_read_only_roots` (REQ-TOOLS-132) does not interact with
  confinement, because OS confinement restricts no reads at all (REQ-SANDBOX-060).
