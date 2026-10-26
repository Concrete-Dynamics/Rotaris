# Spike — the wedged presenter, and the single-instance claim on Windows — 2. The requirement text, read before measuring

Part 2 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

## 2. The requirement text, read before measuring

Quoted rather than paraphrased, because in every case the conditions attached to a threshold turned out
to matter more than the number.

| Id | The part that binds this spike |
|---|---|
| **T-31** (constraints, HARD) | "A session with no presenter routes every ask through a headless policy; with no resolver wired at all a built-in fail-safe denies. **Never a silent allow, never a hang.**" |
| `REQ-TOOLS-064` | A session for which no approval presenter is registered "resolves every `ask` through the headless approval policy of `REQ-TOOLS-065`: never a silent allow, never a hang." |
| `REQ-TOOLS-053` (amended) | "A session counts as interactive exactly when **an approval prompt for that session can be put in front of a person.**" — a **capability** test, not a registration test. |
| `REQ-TOOLS-069` (amended) | "A run is attended exactly when its session **can put an approval prompt in front of a person**." |
| `REQ-TOOLS-055`, `REQ-TOOLS-178`, `REQ-CONFIG-126` | One budget, `runtime.approval_timeout_seconds`, any float ≥ 0, **default 300.0**, and **"A value of 0 means the wait never expires by itself"** — released only by cancellation, shutdown or host teardown. |
| `REQ-TOOLS-063` | The desktop approval prompt is **a modal dialog** of minimum 560×380 logical px with three buttons and a monospace detail box — i.e. an application window, not a platform message box. |
| `REQ-SHELL-164` | Names the product's **platform-native** dialogs: "the folder choosers of `REQ-SHELL-011`, `REQ-SHELL-021` and `REQ-SHELL-163`, and the native message boxes of `REQ-SHELL-119`". |
| `REQ-WORKSPACE-009` | "Choosing a project folder SHALL use the operating system's **native folder chooser**" — reached from the title-bar control of `REQ-WORKSPACE-016`. |
| `REQ-SHELL-119` | Window-close guards raise dialogs, including **"Quit while run is active?"** — raised, by construction, *while a run is active*. |
| `REQ-STARTUP-161` | One instance per user account. The deciding record is one per user account, outside every workspace, not a preference key, "created by the launch that becomes the instance and released when that instance's process ends", creatable/readable/removable without elevation. |
| `REQ-STARTUP-162` | The hand-over is silent, surfaces a window, and "SHALL write nothing to the preference store … and nothing to any per-user or per-workspace state". |
| `REQ-STARTUP-163` | "A workspace directory a launch carries SHALL be honoured, whether that launch becomes the instance or is handed to one." |
| `REQ-STARTUP-164` | Claim → hand-over → **"Where the hand-over is not acknowledged within 5 seconds** … the launch SHALL reclaim the record and retry the exclusive claim exactly once." At most one reclaim, two claim attempts, no spin. "Probing whether the recorded process is running SHALL have no effect on that process." And: **"Every path therefore ends with exactly one instance running and a window on screen."** |
| `REQ-STARTUP-155` | 5 s to paint the main window; a handed-over launch "paints no window of its own, **is bounded instead by the hand-over interval of `REQ-STARTUP-164`**". |
| ADR-0055, verification obligation | (1) a record left by a process killed without cleanup must not make the application unlaunchable; (2) **"A recorded process that is running but not answering must be resolved within the stated interval, with at most one reclaim, and without spinning"**; (3) the probe must leave the probed process unaffected. |

Two readings follow directly from that text and are used throughout.

- **`REQ-TOOLS-063`'s dialog is not a platform dialog.** A minimum size in logical pixels, three
  specifically-styled buttons, a monospace detail box with an accessible description, and a
  buttons-disabled status-line state are not things a platform message box offers. `REQ-SHELL-164`
  enumerates the product's native dialogs and the approval prompt is **not** among them. So the approval
  prompt is an application window, and the native-dialog result in §4.4 is not about the approval prompt
  itself — it is about every *other* dialog the product raises on the same thread.
- **`REQ-STARTUP-155` hands the handed-over launch's budget to `REQ-STARTUP-164`.** The number to test
  the second launch against is therefore **5 seconds**, not 5 seconds of paint plus something else.

---
