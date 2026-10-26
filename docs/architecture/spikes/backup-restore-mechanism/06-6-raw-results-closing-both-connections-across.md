# Spike — the whole-store backup and restore, run end to end — 6. Raw results — closing both connections across two processes

Part 6 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 6. Raw results — closing both connections across two processes

The run host was given four behaviours. `SVC_CLOSE_TIMEOUT` unset is ADR-0058 and ADR-0002 as written:
"both closes are acknowledged before anything moves", with no bound stated anywhere.

| Run host | Bound on the wait | Terminated | Wall | Outcome |
|---|---|---|---|---|
| answers immediately | none (as written) | yes | 131 ms | restore completes |
| answers after 3,000 ms | none (as written) | yes | 3,146 ms | restore completes; `handshake_ms` = **3,012.9** |
| **never answers** | none (as written) | **NO** | watchdog at **15,003 ms** | no result, no error, no timeout; the store is still open and healthy; the run host is still writing |
| **exits without answering** | none (as written) | **NO** | watchdog at **15,006 ms** | no result; the run host is **dead** and holds nothing; the workspace service waits for an acknowledgement that cannot arrive |
| never answers | 2,000 ms (harness-added) | yes | 2,143 ms | proceeds, **step 3 fails `EPERM`** because the run host still holds the store; the store is left exactly as it was; the staging directory is left behind |

**6.1 There is no bound and the mechanism needs one.** ADR-0002 consequence 11 states the capability the
run host must have and states no deadline; ADR-0058 step 1 says the acknowledgements come before anything
moves and says nothing about their not coming. Measured, the workspace service waits indefinitely. The
application keeps running and a window keeps painting throughout, so what a user sees is a restore that
never finishes and never fails.

**6.2 A bound alone is not the fix.** With a 2,000 ms bound the service proceeds and step 3 fails, because
the run host's connection is still open. Proceeding on a timeout converts a hang into a clean refusal —
which is better — but the acknowledgement is not advice, it is the precondition that makes the rename
possible, so the timeout path must refuse rather than continue.

**6.3 Is there a state in which both believe the other holds the store?** Not that one. Two asymmetric
states were produced, and both are worse than a symmetric standoff because neither party is wrong about
itself.

- **The run host is dead; the workspace service believes it still holds the store.** Nothing holds the
  store; the swap would succeed; it is never attempted. Measured above.
- **The workspace service dies after the run host has given up the store** (`B-restore.js
  svc-dies-after-ask`). Measured: the run host reports `open=false, refusing=true`, refuses every
  subsequent launch (`run-refused`), the store directory is renameable by anybody because nobody holds it,
  and nothing in the sequence will ever tell the run host to re-open. The instance keeps running with a
  window showing and no session in that workspace can start again.

**6.4 The failure path does not re-open the run host.** ADR-0058 step 5 — "Both processes re-open" — is a
step of the successful sequence. The failure text says only that step 3 is reversed and the failure
reported. In every one of the 30 literal-reading failures the run host was left closed and refusing. This is
a silence in the record rather than a specified behaviour that misbehaves, but the silence has the same
effect.

---
