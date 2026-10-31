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

## Repaired at the platform's level — 2026-10-31; the Windows re-measurement is owed

Not closed over a measurement. The repair is proven by unit tests on Linux; the suspended-and-resumed primary of C6 has not
been run against it on Windows, and that run is what would close this note. Until it runs, the repair is a stated mechanism
with tests behind it, not a measured outcome.

**What the repair does.** `listen()` (`packages/platform/src/instance.ts`) now reads the record again whenever an ordinary
hand-over arrives. If the record does not name this process at this endpoint — another process, or no readable record (a
reclaim between its removal and its retried claim) — it does not call `onHandOver`, so main surfaces nothing. It answers
`{"ok":false,"reason":…}`, never `{"ok":true}`, and reports the decline through `onHandOverDeclined`. Main logs that at
`warn` as `hand-over declined … the instance record names pid <n>, not this process … (ADR-0055 consequence 14)`. That is
the line the Windows re-run should look for in the resumed primary's log in place of `hand-over surfaced window 1`. A
successor's announcement (REQ-STARTUP-121) is not on this path, and its record pass is unchanged.

**What the repair disproved in the explanation above.** The note placed the defect wholly in the resumed primary: it
"answered the hand-over" and "nothing … says it re-read the record". The first half is right: no re-read existed. But the
primary standing down was not enough, because the launch on the other side of the connection did not resolve to the
instance the record names either. A primary that only declined would have made things worse. A launch that had read the
record while it named the primary would get the decline, and then:
- clause (3)'s reclaim removed **whatever record stood there** (`rmSync` with no re-read), here the new instance's;
- its retried claim then won, making it a second instance beside the one that had reclaimed the record.

And REQ-STARTUP-164 (4)'s "attempt the hand-over once more", which ADR-0055's decision states, had never been built: a lost
retry ended `refused`. So the arriving launch's side was repaired too:
- (3) now removes the record only when a fresh read finds the same claim it failed to reach, or no readable record;
- a record naming another claim is left in place, the retry loses, and (4) hands the launch to the process that record names.

`instance.test.ts`'s "a launch that read the record while it named the primary…" holds REQ-STARTUP-164's closing property
over real endpoints: the launch ends `handed-over`, the instance's window is the one surfaced, the primary surfaced
nothing, and the record still names the instance. With only the listener half it fails on `'instance'` (the second
instance). Against the code before the repair it fails because the primary surfaced (`[{ workspace: '/w' }]`).

**What remains owed, and what this repair does not decide.**
- The Windows run of C6 against this build: suspend, second launch, resume. Does the resumed primary log the decline and
  surface nothing?
- What the stood-down process does with the windows it already has. ADR-0055 states only the stand-down, and the
  specification says nothing here. Recorded as
  [its own note](../a-stood-down-primary-keeps-its-windows-and-runs-on-with-no-end-the-specification-states.md).
- A hand-over main queued before its first window existed (`pendingHandOvers`) is decided as it arrives and acted on
  later, so a record that moves on in between is not seen. That is only reachable by a process wedged during its own
  startup, and it is not covered.
- Clause (4)'s second hand-over is bounded by the same interval as the first. Where (2)'s hand-over already waited the
  full 5 s and the new holder does not answer either, the resolution can take two intervals. Whether REQ-STARTUP-164's
  "no waiting beyond that one interval" admits that is a question for the orchestrator, not ruled here.
