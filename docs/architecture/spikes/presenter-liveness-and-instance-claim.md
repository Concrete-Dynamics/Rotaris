# Spike — the wedged presenter, and the single-instance claim on Windows

- **Date:** 2026-09-02
- **Questions:** two, deliberately kept in one record because one measurement turned out to answer both.
  1. **The wedged presenter.** Constraint **T-31** states as HARD, citing `REQ-TOOLS-064` – `REQ-TOOLS-066`,
     that a session with no presenter routes every `ask` through a headless policy and that there is
     **never a silent allow and never a hang**. ADR-0019 conceded that a run started while main is
     *wedged* rather than crashed sees a live registration and posts requests that never resolve, with
     `runtime.approval_timeout_seconds` the only backstop — and `REQ-TOOLS-055` / `REQ-TOOLS-178` make
     `0` (wait without limit) a supported, user-writable value. ADR-0019 added a channel-level liveness
     heartbeat to close this, and states three obligations on it, the third being that **the poll must
     be answerable while a dialog is open.** An earlier measurement was judged not to discharge this
     because it established a floor with main **idle** and never showed a dialog.
  2. **The single-instance claim.** SR-1 / `REQ-STARTUP-161` make a second launch surface the running
     instance. ADR-0055 chose Electron's `app.requestSingleInstanceLock()` and recorded a **verification
     obligation**: three observations that must hold on all three platform keys, and the explicit rule
     that *"if any of the three does not hold, alternative I is adopted for the claim and the platform
     primitive is dropped, not wrapped in a timeout."*
- **Scope:** measurement only. No product code was written and none is authorised. Every harness is
  throwaway and lives in the session scratchpad; nothing was added to this repository except this file.

---

## Parts

Since 2026-10-26 the rest of this document is in [`presenter-liveness-and-instance-claim/`](presenter-liveness-and-instance-claim/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](presenter-liveness-and-instance-claim/01-1-environment.md) | 1. Environment |
| [02](presenter-liveness-and-instance-claim/02-2-the-requirement-text-read-before-measuring.md) | 2. The requirement text, read before measuring |
| [03](presenter-liveness-and-instance-claim/03-3-method.md) | 3. Method; 3.1 Harness A — presenter liveness (`s14/`); 3.2 Harness B — the instance claim (`s16/`) |
| [04](presenter-liveness-and-instance-claim/04-4-raw-results-presenter-liveness.md) | 4. Raw results — presenter liveness; 4.1 The floor: what an unblocked main costs; 4.2 Does the channel look alive while main is blocked?; 4.3 Detection latency; 4.4 The decisive measurement — which main-process callbacks survive a native modal; 4.5 A crashed main: the channel never closes, because the run host does not outlive main; 4.6 What signal Electron itself gives, and whether a utility process can use it |
| [05](presenter-liveness-and-instance-claim/05-5-raw-results-the-single-instance-claim-on.md) | 5. Raw results — the single-instance claim on Windows; 5.1 Second launch refused, hand-over delivered, workspace carried; 5.2 The claim is released when the holder is killed without cleanup; 5.3 A primary that is running but not answering — this is where it breaks; 5.4 The probe leaves the probed process unaffected; 5.5 macOS and Linux — a platform blocker, stated as one |
| [06](presenter-liveness-and-instance-claim/06-6-verdicts.md) | 6. Verdicts |
| [07](presenter-liveness-and-instance-claim/07-7-what-this-harness-does-not-model.md) | 7. What this harness does **not** model |
| [08](presenter-liveness-and-instance-claim/08-8-impact-on-adrs-reported-not-applied.md) | 8. Impact on ADRs — reported, not applied |
| [09](presenter-liveness-and-instance-claim/09-9-files-and-reproduction.md) | 9. Files and reproduction |
