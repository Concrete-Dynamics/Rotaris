# Open-Question Resolutions — Settings and Configuration — Dispositions (continued)

Part 4 of 4 of [domain 15's resolutions](../15-settings-configuration.md), which indexes every part. The table continues from the part before; its header is repeated here.

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 59 | RESOLVED (half superseded) | As decided here: `worktree_storage_subpath` governs, and it is the only key naming that directory. `requirements.execution.worktree_subpath` should not exist: requirement runs use the same isolated-checkout service as every other session and therefore the same directory, and a second key that could name a different one is a contradiction with no reading worth keeping. It is removed from the `requirements.execution` field set, and writing it is rejected as an unknown key under `requirements:` like any other. **The requirement-run half was superseded by cross-domain reconciliation.** Requirement-unit checkouts do *not* share the session directory: REQ-GIT-137 fixes them under `<workspace>/.rotaris/requirements/worktrees/` and that location is not configurable. Domain 06 owns where requirement-unit checkouts live; this domain owns only the key that names the storage subpath, and `worktree_storage_subpath` names the per-session one (REQ-CONFIG-068, REQ-CONFIG-010). What survives unchanged is the rejection: no key of this domain names a requirement-unit checkout directory, and a `worktree_subpath` written under `requirements.execution` is an unknown key (REQ-CONFIG-194, on which REQ-GIT-138 relies). | REQ-CONFIG-010, REQ-CONFIG-068, REQ-CONFIG-194; superseded half now REQ-GIT-137 |
| 60 | RESOLVED | Yes, identically, and with the same starter content — the starter document is scope-independent, nothing in it being specific to a workspace. The global-scoped edit gets the same parent-directory creation, the same refusal to clobber, the same atomic write and the same file mode, so a user's first global model preference is never lost for want of a file. Bootstrap stays scoped to the file being written: a workspace edit never creates the global file and a global edit never creates the workspace one. | REQ-CONFIG-025, REQ-CONFIG-030, REQ-CONFIG-248 |
| 61 | RESOLVED | No, and it cannot. Skill policies are written into the workspace file only and carry no per-field scope of their own, but `skills` is section-class and its two override maps overlay per skill name, so a workspace save overlays exactly the skills it names and never discards the global scope's policy for any other. The one hole this leaves is closed: the sparse-write rule is qualified so that a baseline policy **is** written explicitly where a lower layer states a policy for that skill, otherwise returning one skill to the baseline from the screen would be impossible. | REQ-CONFIG-042, REQ-CONFIG-169, REQ-CONFIG-256, REQ-CONFIG-258 |
| 62 | RESOLVED | With no configuration service the guard offers two buttons only — Discard and Cancel, with **Cancel as the default** — and its text additionally conveys that settings are read-only in the current mode so the pending changes cannot be saved. A Save that cannot succeed is never offered as a button and never as the default, and the user is always left a way to leave the screen. | REQ-CONFIG-281, REQ-CONFIG-286 |
| 63 | RESOLVED | An actor is a person exactly when the action arrives through an interactive surface, attached to a terminal or a window, in direct answer to a prompt raised for that specific action. An action from an agent, a hook, the non-interactive command surface, a scheduled or headless run, or a replay is never a person whatever it claims, and a confirmation reaching such a host is refused and recorded as unanswered rather than assumed. The audit record names the operating-system account the interactive session ran under and the surface the answer came from; the product maintains no identity of its own and asks for none. | REQ-CONFIG-198 |

> ## Amendment, 2026-09-02 (requirement-shape sweep)
>
> **`REQ-CONFIG-028` wrote the starter configuration on a determination it had not made.** The requirement
> named two conditions that cause a write — the target is absent, or its text is empty after trimming — and
> two that cause a decline and are never written over: a path that is a directory, and a file whose bytes
> cannot be decoded as UTF-8. **A target that exists and cannot be read at all falls into neither set**:
> refused by the operating system, held by another process, or failing for any other reason. Nothing in the
> requirement said what becomes of it.
>
> **Why this one matters more than its size suggests.** The residue is not a rare shape, and the obvious
> implementation gets it wrong in the dangerous direction: a bootstrap that asks "can I read a file here?"
> and treats *no* as *nothing is here* writes the starter file over a user's existing configuration. The
> two conditions that trigger a write are both determinations that nothing is there; a failed read is the
> absence of a determination, and the two are not the same.
>
> Added: such a target declines as the other two do, reporting the path and what prevented the read. And the
> rule the three now share is stated in terms, so it survives a later edit to any of the lists — **the
> starter file is written only where the product has established that nothing is there, and never where it
> has failed to establish anything. Not being able to read a file is not evidence that the file is empty.**

> ## Amendment, 2026-09-11 — REQ-CONFIG-116 gains a maximum and REQ-CONFIG-117 states what its period means
>
> **No disposition below is reversed.** Two keys this domain owns were ruled on by the product owner after the
> terminal was built against them, and both rulings are stated where the key is registered rather than where it is
> consumed, because a key's value space is this domain's.
>
> **REQ-CONFIG-116 — `shell_max_background_sessions` is `int 1–64` (OQ-55).** It had a default and a minimum and
> **no maximum**, which ESC-22 had already noticed from the other side in 2026-09-02's amendment to domain 02. The
> count is a multiplier on live terminal streams, whose delivery REQ-MONITOR-306 bounds in aggregate, so without a
> ceiling the worst-case staleness of a live surface cannot be computed from a configuration at all — only observed
> afterwards. The figure is REQ-TRACE-481's, taken with the reason that requirement gives rather than invented here.
> A value outside the range is rejected at load and on assignment (REQ-CONFIG-111) and never clamped, which is the
> treatment REQ-CONFIG-473 and REQ-CONFIG-476 already state for keys whose silent coercion would remove something
> the user asked for.
>
> **REQ-CONFIG-117 — `terminal_stream_interval_ms` is a ceiling on batching, not a fixed cadence (OQ-38).** A
> stream may frame sooner than the period and must do so when input the user has directed at a stream whose control
> they have taken arms the next frame, so REQ-SHELL-166's echo criterion holds at every value the range permits.
> Two bounds hold that licence and neither is configurable: the 20 ms floor between two frames of one stream, and
> REQ-MONITOR-306's aggregate. **Output alone never arms a frame, and neither does input an agent sends to its own
> terminal session.** That last clause is the narrow part of the ruling and it changed shipped behaviour: the first
> implementation armed on an agent's keystroke as well, which spent a licence of 50 frames per second per stream on
> streams no person was watching, and at the shipped defaults that was the whole of REQ-MONITOR-306's aggregate.
>
> **What is deliberately not changed.** Neither key moves its default, and neither amendment touches what a
> configured value means for the command itself — REQ-TOOLS-126's statement that disabling streaming costs the live
> view and never the command still governs, and the two keys remain ordinary `runtime:` keys layered per field.
