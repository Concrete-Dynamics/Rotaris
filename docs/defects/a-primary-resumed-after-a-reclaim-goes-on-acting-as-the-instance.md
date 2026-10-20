## A primary resumed after a reclaim goes on acting as the instance

The Windows ARM64 session's C6 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git
Bash, built at `51d85dd7`) suspended a running instance's main process (`NtSuspendProcess`, every thread) and started a second
launch of the same profile. The second launch's hand-over went unanswered for the 5 s REQ-STARTUP-164 allows, it reclaimed the
record once, and it logged `instance claimed` 5,263 ms after it started, the record now naming it. So far as ADR-0055
consequence 14 says. The primary was then resumed. Within the 8 s watched after, it logged

```
hand-over surfaced window 1 for <workspace> (REQ-STARTUP-162/163)
```

— it answered the hand-over the second launch had queued on its pipe before giving up, surfaced its window as the instance
does, answered the driver, and kept running beside the new instance, which also kept running with the record. Nothing in its log
says it re-read the record or found it naming another process. Two processes acted as the instance until the driver ended
them.

ADR-0055 consequence 14 states the rule this breaks, "It must therefore re-read the record before acting as one, and where it
finds a record naming another process it must stop behaving as the instance rather than compete", and says the rule "has no
measurement behind it". This is that measurement. Not established: whether the resumed primary would ever stand down, what it
does with a later hand-over, and whether the same happens on a wedge that ends without a suspension (a long synchronous dialog,
ADR-0055 consequence 15).

## Specs

REQ-STARTUP-164: a reclaim may leave two processes "briefly", and every path ends "with exactly one instance running". Here the
recovered primary did not stand down; it took the stale hand-over and acted on it. REQ-STARTUP-161 (one instance) and ADR-0055
consequence 14's rule.

## Relevant files

- `packages/platform/src/instance.ts` — the instance's endpoint and `passRecord`/`tryHandOver`; whether anything re-reads the record before an
  instance acts on a hand-over was not read here; the log shows none.
- `apps/desktop/src/main/index.ts` — the claim's `onHandOver`, and `apps/desktop/src/main/main-windows.ts`, which surfaces the window a
  hand-over names.
- `docs/architecture/adr/0055-startup-sequencing.md` — consequence 14.
