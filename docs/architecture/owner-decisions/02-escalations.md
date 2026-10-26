# Product-owner decisions on the architecture record — Escalations

Part 2 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Escalations

### ESC-1 — the shared save path between Settings and the composer's permission-mode control

**Decided: the composer control writes only its own key**, through the scoped per-field writer that already
exists for this shape of write. Pending Settings edits stay pending.

`REQ-CONFIG-288` states the current coupling and then explicitly hands the decision over. The coupling is
preserved nowhere: choosing a permission mode must not commit unrelated pending edits, because the surprise
lands in a security-relevant control. The decision must not break `REQ-CONFIG-423` or `REQ-CONFIG-418`.

### ESC-2 — configuration write-back and comments

**Decided: preserve comments.**

`REQ-CONFIG-252` states that comments and formatting are lost. A spike run for the DATA proposal showed the
document API recommended for the tri-state model keeps comments, layout and key order through a targeted
edit, and that only parse-then-re-emit loses them — so preserving them is *less* work than deliberately
discarding them, and it saves the user the comment header the bootstrap itself wrote (`REQ-CONFIG-025`).

This departs from a stated observable, which the compatibility ruling recorded in the Specification Gate
permits: the target is behavioural inspiration, not conformance to the reference. `REQ-CONFIG-252` is
amended. Key order preserved and never alphabetised (`REQ-CONFIG-248`) is unaffected.

### ESC-3 — silent loss of a review decision under last-writer-wins

**Decided: match the specification.** Silent loss on the ordinary write path; the stated report on the undo
path (`REQ-LIBRARY-116`) and where an action's target is no longer present (`REQ-LIBRARY-173`).

`REQ-LIBRARY-042` fixes the semantics and accepts the consequence deliberately. Adding a refusal to every
write where the specification has none is a larger change than the defect warrants.

### ESC-4 — a workspace with no version-control repository has no undo

**Decided: accept the gap as specified.**

`REQ-GIT-044` resolves an unmanageable tree to disabled and `REQ-LIBRARY-163` requires such a workspace to
lose only the rollback capability. A content-addressed snapshot store of our own was assessed and rejected
in ADR-0039 because `REQ-GIT-029` requires checkpoints to be ordinary commit objects and `REQ-GIT-060`
requires overwritten content to be retrievable from the safety checkpoint's commit. A second snapshot
mechanism with its own restore semantics is not worth the divergence.

### ESC-5 — the pooled terminal backend

**Decided: ship one backend.** The pooled name and its two `kill_status` values are withdrawn; the backend
field is kept for forward compatibility.

The vocabulary is closed at two values and pooled-recovery behaviour is specified in detail, but nothing
states when a pooled backend is used, whether it must exist, or what selects it. It would also be POSIX-only
while Windows mandates a different shell, and the two backends are required to be observationally identical
apart from the name. `REQ-TOOLS-099`, `REQ-TOOLS-100`, `REQ-TOOLS-103` and `REQ-TOOLS-187` are amended.

### ESC-6 — Windows users get no confinement

**Decided: accept the specification for the first release**, and document it plainly on the settings surface
and in the launch advisory rather than only in a remediation string.

`REQ-SANDBOX-065` closes the platform set at two identifiers and forbids adding one; `REQ-SANDBOX-048`
forbids an opportunistic mode. A Windows user therefore runs every agent command unconfined, and an
unattended permissive run on Windows is always downgraded unless the opt-out key is set.

**This ruling is provisionally revisited** under the structural-soundness review (see below): running an
autonomous agent unconfined on the product's most common desktop platform is exactly the kind of inherited
constraint that review exists to challenge. Admitting a third platform identifier extends
`REQ-SANDBOX-127`'s real-host conformance obligation to a third continuous-integration platform, which is
the real cost.

### ESC-7 — the plugin language

**Decided: change the plugin language** to modules the host can genuinely import in-process. `REQ-TOOLS-165`
and the workspace layout are amended; the `*.py` extension is withdrawn.

`REQ-TOOLS-163` requires plugins to execute "inside the host process with exactly that process's OS
privileges", and ADR-0001 chose TypeScript on Node. Changing the language is the **only** option that
satisfies `REQ-TOOLS-163` as written, and it costs nothing in bundle size or supply chain. Bundling an
interpreter in a sidecar would cost tens of megabytes, a second signing and update surface, and a fifth
process kind, in exchange for preserving a file extension.

### ESC-8 — what the update path establishes

**Decided: sign the checksums manifest with a key shipped in the application.**

`REQ-STARTUP-021`, `REQ-STARTUP-023` and `REQ-STARTUP-123` leave binaries deliberately unsigned, so the
update path establishes *what* was downloaded and nothing about *who* published it, over the same connection
the download came from. Signing the manifest gives publisher authenticity for updates, is materially cheaper
than full code signing and notarization, and does not change first-launch platform warnings. The signing key
and its rotation story are an architecture obligation, recorded against ADR-0054.

### ESC-9 — session retention

**Decided: leave retention unbounded and add the derived read index** ADR-0003 keeps as a named escape
hatch, outside the sessions tree and never on a correctness path.

Nothing is ever deleted, so no user loses history; the session browser and history surface stay inside
`REQ-SHELL-150`'s 100 ms gesture budget. This is purely an architecture decision and forecloses neither an
unbounded-and-slow product nor a later user-visible retention preference.

### ESC-10 — controlling a run owned by a second application instance

**Decided: refuse the control, with a reason naming the owning process.**

Consistent with `REQ-MONITOR-005`'s "a `false` outcome states the operation did not happen" and with
`REQ-SESSION-183`'s existing pid and host vocabulary, and it requires no new mechanism. A filesystem control
mailbox is rejected outright: the session-directory root is closed by `REQ-SESSION-001`, and a command
channel over the filesystem is a pattern this product does not adopt.

**Superseded in part** — see below. Under the single-instance ruling, a second application instance holding
a session ceases to exist as a normal case, and this refusal becomes a defence against a state that should
not arise rather than a routine user-visible behaviour.

---
