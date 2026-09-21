# Process Handles and Incremental Output Cursors

Expose long-running commands as resources with explicit lifecycle, bounded polling, and loss-aware output continuation.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Replace `execute(command) -> entire output` with a process handle and a stream of immutable output records. The model can inspect only new output, wait for completion, or cancel without restarting the command.

This is a proposed process protocol, not a wrapper tied to a shell or language runtime. Platform adapters implement spawning, stream draining, process-tree cancellation, and exit observation. Pipe draining is essential: runtime documentation explicitly warns that waiting on a process with full, undrained output pipes can deadlock [1].

A process identifier is an opaque harness handle, not a raw operating-system PID. Output sequence numbers describe the harness's ingestion order; they do not prove a total causal ordering between stdout and stderr.

## 2. Design contract and invariants

Each execution MUST have a distinct handle, supervisor epoch, and lifecycle. A retry carrying the same explicit launch request identifier MUST either return the same execution or report uncertainty; it must not silently spawn another process.

Captured output records are immutable and monotonically sequenced. Reading is non-destructive. Two readers can use independent cursors without consuming each other's output. Replaying a cursor may repeat records, but advancing to the returned cursor must not skip retained records.

`process_exited`, `capture_closed`, and `output_complete` are separate facts. A child can exit while unread bytes remain in its pipes. Reaching the current end of a running stream is not final EOF.

## 3. Data model and tool interface

```text
start_process(program, args[], cwd, environment_profile,
              request_id, timeout_ms?, stdin_mode="closed")
read_process(process_id, after_seq=0, max_bytes, wait_ms=0)
inspect_process(process_id)
write_process_stdin(process_id, bytes, request_id)
close_process_stdin(process_id)
cancel_process(process_id, grace_ms)
```

```json
{
  "process_id": "proc_19",
  "supervisor_epoch": "epoch_3",
  "state": "running",
  "records": [
    {"seq": 38, "stream": "stdout", "text": "test A passed\n"},
    {"seq": 39, "stream": "stderr", "text": "warning: fixture missing\n"}
  ],
  "next_after_seq": 39,
  "high_water_seq": 57,
  "has_more": true,
  "capture_closed": false,
  "output_complete": true
}
```

Sequence `0` is the initial cursor; the first record has sequence `1`. A cursor is interpreted only with its process handle, whose registry entry binds the supervisor epoch. Reject negative cursors and cursors beyond that process's current high-water mark. `next_after_seq` is the last returned record, not the latest captured record. `high_water_seq` is only informational.

Lifecycle states are `starting`, `running`, `cancelling`, `exited`, and `lost`. Exit information distinguishes normal exit code, signal/termination reason, and timeout. `exited` does not imply success. A lost supervisor must not manufacture an exit code.

Records store exact byte payloads or artifact ranges. Text is a view with a declared decoding policy. Define a maximum record size and reject read budgets smaller than that size, or use a cursor that additionally tracks intra-record byte position.

## 4. Implementation workflow

Persist launch intent and allocate the handle before spawning. Record command arguments separately from display formatting. Spawn once through the platform adapter, attach drainers for both output streams immediately, and track child exit independently.

Split captured bytes into bounded immutable records. Store stream identity and ingestion sequence. Preserve raw bytes even when display decoding replaces invalid sequences. Stateful decoding is per stream; split UTF-8 sequences and terminal carriage returns must not corrupt storage.

Poll under a bounded output budget. Long polling may wait until a record arrives, capture closes, or the caller's wait limit expires. Empty output from a running process returns its current state and cursor, not an error or completion signal.

Apply quotas deliberately. Spool to disk where possible. If retention drops old records, return the earliest available sequence and an explicit gap. Never silently advance an obsolete cursor past discarded data. Distinguish retention eviction from bytes that were never captured.

On cancellation, request graceful termination, then escalate after the configured grace period. Handle descendants through platform-appropriate supervision, not just the initial PID. Mark the process exited only after confirmed termination; mark capture closed after streams are drained or an explicit drain timeout records capture loss.

Finalize retained output into an observation when capture closes. Interactive PTY sessions require a separate advertised profile because terminal echo, resizing, and stream behavior differ from ordinary pipes.

## 5. Reference pseudocode

```text
function start(request):
    existing = launch_registry.lookup(request.request_id)
    if existing:
        require existing.arguments_digest == digest(request.arguments)
        return existing.status
    intent = launch_registry.reserve(request)
    process = supervisor.spawn(intent)
    start_independent_drainers(process.stdout, process.stderr)
    start_exit_watcher(process)
    return process.handle

function poll(handle, after_seq, budget, wait_limit):
    process = registry.resolve(handle)
    require supervisor.recognizes_instance(process.id, process.epoch) else PROCESS_LOST
    require 0 <= after_seq <= process.high_water_seq else BAD_CURSOR
    require after_seq >= process.first_retained_seq - 1 else OUTPUT_GAP
    wait_until_output_or_closed_or_deadline(process, after_seq, wait_limit)
    records = log.read_after(after_seq, budget)
    next_seq = records.last.seq if records else after_seq
    return records, next_seq, process.state, process.capture_closed
```

Durable launch intent narrows crash ambiguity but cannot make arbitrary process spawning transactional. A crash between spawn and handle persistence requires supervisor reconciliation. Do not claim exactly-once launch without that mechanism [2].

## 6. Worked example

The agent starts a build and receives `proc_19`. A first poll returns records 1-37. It then polls with `after_seq=37`, receives 38-39, and continues with 39. If the response is lost, repeating 37 returns the same retained records; the consumer deduplicates by sequence.

The child exits with code 1 while the final diagnostic is still in a pipe. The process metadata says `exited`, but `capture_closed=false`. A later poll delivers the final diagnostic and closes capture. Only then can the final observation claim complete captured output.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `BAD_CURSOR` | Negative cursor or cursor beyond captured history. | Inspect the process and use a returned cursor. |
| `PROCESS_LOST` | Supervisor state cannot be recovered. | Reconcile effects before considering restart. |
| `OUTPUT_GAP` | Requested records were evicted. | Read archived output or explicitly acknowledge the gap. |
| `LAUNCH_OUTCOME_UNKNOWN` | Process may have spawned. | Query launch intent; do not create a new request ID automatically. |
| `STDIN_CLOSED` | Process no longer accepts input. | Inspect state. |
| `WAIT_LIMIT_REACHED` | Bounded wait ended without new data. | Poll later using the unchanged cursor. |
| `CANCEL_PENDING` | Termination requested but unconfirmed. | Continue inspection; do not report it stopped. |
| `CAPTURE_INCOMPLETE` | Bytes were lost or draining was cut short. | Preserve the limitation in the final observation. |

## 8. Integration and lifecycle

[Observations](02-addressable-observations.md) provide finalized output access; [artifacts](12-content-addressed-artifacts.md) can store chunks. A [checkpoint](11-execution-checkpoints.md) retains process handles and cursors, but resume must ask the supervisor whether they still exist.

Use [structured errors](09-structured-errors-and-recovery.md) for uncertain launch and cancellation outcomes. Do not cache process-start calls as pure operations. A launch request ledger is idempotency machinery, not ordinary result memoization.

Define whether processes survive an agent turn, a session, and a harness restart. Expiring a display handle MUST NOT silently orphan a running child. Apply a documented detach, retain, or cancel policy.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| stdout and stderr exceed pipe capacity | Neither stream deadlocks the child. |
| Repeated identical cursor | Retained records replay without mutation. |
| Two readers | Their cursors advance independently. |
| Output exceeds one response budget | Cursor points to the last returned record. |
| UTF-8 character spans chunks | Raw bytes survive; decoding remains explicit. |
| Child exits before final drain | Final output is not omitted. |
| Ring-buffer eviction | Gap is reported, not hidden. |
| Supervisor restart/PID reuse | Old handle does not attach to an unrelated process. |
| Duplicate launch request | Same arguments return same execution or uncertainty. |
| Cancellation with descendants | Outcome reflects actual termination scope. |

## 10. Metrics and rollout

Track repeated bytes delivered, poll count, time to decisive output, capture loss, orphan processes, and cancellation latency. Output deduplication should not increase agent busy-waiting.

Begin with non-interactive builds and tests. Use bounded long polling and deterministic cursor fixtures. Add interactive sessions only after pipe-based behavior is stable. Measure user-visible task latency, not merely command spawn latency.

## 11. Implementation checklist

- [ ] Allocate opaque process handles and launch request identities.
- [ ] Drain both streams independently and preserve raw bytes.
- [ ] Implement bounded, non-destructive cursor reads.
- [ ] Separate exit, capture closure, and output completeness.
- [ ] Define restart, quota, cancellation, and descendant behavior.
- [ ] Test replay, gaps, crash windows, and exit-before-drain races.

## 12. References and further reading

[1] [Python subprocess documentation](https://docs.python.org/3/library/subprocess.html) - concrete documentation of pipe deadlocks and process/stream lifecycle. Python is a reference example, not a required implementation language.

[2] [AWS Builders' Library, Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) - request identity and retry semantics. It does not make operating-system process creation transactional.
