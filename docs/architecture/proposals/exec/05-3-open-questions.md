# EXEC slice — architecture proposals — 3. Open questions

Part 5 of 9 of [the exec proposal](../exec.md), which indexes every part.

## 3. Open questions

These are places where the specification is silent, under-determined, or internally inconsistent
across the two domains I own. Each is raised rather than invented around.

- **OQ-1 — Backend selection for the terminal is unspecified.** REQ-TOOLS-100 fixes the closed
  `backend` vocabulary {`single-session`, `tmux-pool`}, REQ-TOOLS-099 fixes `kill_status` values that
  only a pane-based pool can produce (`pane_replaced`, `replace_failed`), and REQ-TOOLS-103 specifies
  pooled-recovery behaviour in detail. Nothing states when a pooled backend is used, whether it is
  required to exist, or what selects it. If both must ship, a POSIX-only pooled backend cannot exist
  on Windows, where REQ-TOOLS-104 mandates PowerShell. See ADR-EXEC-06 (ESCALATE).
- **OQ-2 — The payload of a stream frame is under-determined.** REQ-TOOLS-127 describes `delta` and
  `screen` frames in terms of *text*, and requires the closing `screen` frame's text to equal the
  observation's final plain output. REQ-SHELL-095, REQ-SHELL-098 and REQ-SHELL-166 require a full VT
  character grid with alternate-screen fidelity, per-cell attributes and 16 ANSI colours. Plain text
  cannot carry the second; VT bytes are not "the observation's final output text". A rule is needed
  for what a frame carries and how the terminal `screen` frame relates to the observation text.
  See ADR-EXEC-07.
- **OQ-3 — Shell state under confinement.** Foreground calls accumulate working directory, exported
  variables and aliases in a persistent shell (REQ-TOOLS-097), but a confined command is rendered as
  `<launcher> … /bin/sh -c '<command>'` submitted into that shell (REQ-SANDBOX-079), so a `cd` or an
  `export` inside a confined command lives in the inner `sh` and dies with it. Does shell state
  persist across sandboxed foreground calls? The two requirements describe different behaviour for
  `sandbox_mode: off` and `workspace-write` and neither says so.
- **OQ-4 — Host canonicalization contradicts itself across the two domains.** REQ-TOOLS-086 says the
  normalizer strips IPv6 brackets and then **re-brackets bare IPv6 literals**; REQ-SANDBOX-006
  requires `http://[::1]:9000/` → `::1`, unbracketed, as a stated required result. One of the two must
  give way. Recommended reading: REQ-SANDBOX-006, which owns egress classification and states
  concrete required results.
- **OQ-5 — "Leaves nothing behind" versus the documented empty `.git/`.** REQ-SANDBOX-077 requires
  every carve-out to exist only inside the confined mount view, with the host filesystem holding
  exactly what it held before, and forbids a backend that cannot do so from creating anything.
  REQ-TOOLS-123 records as a "documented, deliberate artifact" that an empty `.git/` may appear inside
  a writable root on Linux. These cannot both hold.
- **OQ-6 — `error_class` is language-shaped.** REQ-TOOLS-101 fixes `ValueError` as an observable
  value, and REQ-SANDBOX-083 defines the sandbox case as "the type name of the failure" — an
  implementation-language-dependent string on an otherwise machine-readable field. Either
  `error_class` is a closed product vocabulary (in which case the sandbox and terminal values need
  enumerating) or it is free text (in which case `ValueError` is not a contract).
- **OQ-7 — REQ-TOOLS-049 implies configurable rule lists that no key defines.** "Rule lists replace
  rather than deep-merge across layers" reads as though a user may author permission rules, but no
  configuration key anywhere in domains 05, 10 or 15 defines one, and the presets of REQ-TOOLS-042 to
  REQ-TOOLS-045 are fixed. Either user rule authoring is in scope and needs a key and a settings
  surface, or the sentence covers only the host lists and should say so.
- **OQ-8 — Proxy behaviour for `fetch` is unstated.** Nothing says whether `fetch` honours system or
  environment proxy settings. It matters: a proxy changes which host a connection is actually opened
  to, and REQ-SANDBOX-022 promises a denied host observes zero connection attempts.
- **OQ-9 — Signals on Windows.** REQ-TOOLS-096 and REQ-TOOLS-110 fix a signal vocabulary
  (`SIGTERM`/`SIGINT`/`SIGKILL`/`SIGHUP`) and REQ-TOOLS-109 fixes SIGTERM → 5 s grace → SIGKILL for
  background termination. Windows has no signals; a `send_signal` call there has no faithful mapping,
  and the specification neither maps them nor refuses them.
- **OQ-10 — Stderr in foreground capture.** REQ-TOOLS-098 requires the soft-pause detail to tell the
  agent the process "may be writing to stderr" and to suggest re-running with `2>&1`, which only makes
  sense if stderr is *not* captured; a PTY-backed persistent shell (required by C-91) necessarily
  merges it. The advisory text is required content either way, but the underlying capture semantics
  should be stated.

---
