# IC-6 — the build rule that replaced a command's exit status is shown to catch what the command hid

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

> **DISCHARGED 2026-09-04.** Run as `../spikes/native-load-proof.md`, the first packaging of the product.
> **Under D10's condition the build fails at rule 1a** — the rebuild ran 138 s, exited 0, compiled nothing,
> and the build was refused for want of a binary newer than the rebuild marker. **With a prebuild in the
> loader's path the build fails at rule 4**, the packaged Electron's own `dlopen` naming
> `better-sqlite3/prebuilds/win32-x64.node` as the file it opened. The straight build passes both, the
> installer is produced, and the packaged application opens a store at schema v5 in a real utility process
> and settles a terminal call through the compiled bindings. Ten runs, six findings, one of them the ninth
> defect of the pattern: the first packaged window was blank. **The per-runner half is IC-3 item 3 and
> stays with the hardware.** Kept rather than deleted, because what it required is now evidence.

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first construction of ADR-0056's
build. **Discharged into:** a note on ADR-0056 and, for the per-runner half, IC-3 item 3.

**Why it exists.** D10 measured that `electron-rebuild` **exits 0, prints `✔ Rebuild Complete`, and produces
no `.node`**, and that the binding's loader prefers a shipped prebuild over anything built beside it.
ADR-0056 rule 1a therefore makes the *artifact* the evidence rather than the command, and rule 4's load is
now the entire check. **The rule has never been run.** It closed a defect on argument, and the defect it
closed was itself a check that reported success without checking anything — which is the one shape a builder
must not take on trust twice.

**What must be shown, and it can be shown on the machine this record was produced on.** Construct the
condition D10 measured — a rebuild that exits 0 and compiles nothing — and confirm the build **fails**:
that rule 1a finds no binary newer than the rebuild step, and that rule 4's load resolves and loads the file
the loader actually reaches rather than one sitting beside it. A rule that passes only when everything is
already fine has not been demonstrated.

**What would count as failing it.** The build passing under D10's measured condition. That is the original
defect with an extra step.

**What it does not cover.** Whether the rule is constructible on the macOS and Linux release runners, which
is IC-3 item 3 and is deferred to hardware by GD-5.
