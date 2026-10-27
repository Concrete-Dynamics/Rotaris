# Resolution Record — Domain 11, Application Startup, Distribution, and Updates — Cross-domain reconciliations recorded here

Part 5 of 5 of [domain 11's resolutions](../11-startup-distribution-updates.md), which indexes every part.

## Cross-domain reconciliations recorded here

- **REQ-CONFIG-397** fixes three field names in `setup/state.json`. REQ-STARTUP-071, which owns the
  record, now names `outcome`, `completed_at` and `versions` as fixed and declares the rest of its
  fields this domain's own — precisely the "unknown keys" that requirement tells its reader to
  ignore rather than reject. REQ-STARTUP-102 now reads the file on the terms REQ-CONFIG-397 fixes,
  including that an unreadable or malformed file reads as no record at all and is not an error.
- **REQ-NOTIFY-265** places a per-step, re-runnable setup surface in Settings that reads and updates
  the resumable state this domain owns. REQ-STARTUP-153 is the answering requirement and states what
  that surface lists, what a single-step run does, how it takes the setup lock, and how the record is
  updated afterwards.
- **REQ-SHELL-163** owns the diagnostics preference keys `diagnostics/level` and
  `diagnostics/outputDir` and points at REQ-STARTUP-131 for the default location. REQ-STARTUP-129 now
  reads exactly those two keys and no environment variable; REQ-STARTUP-146 and REQ-STARTUP-147 were
  updated to match, and the diagnostics environment variables were removed from Data & Formats.
- **REQ-SHELL-021 / REQ-SHELL-119** fixed the three-gate order for workspace switching and window
  close. REQ-STARTUP-053 adopts that order rather than stating a second one.
- **REQ-MCP-033** fixes the reserved bundled-runtime token and the self-launch mechanism.
  REQ-STARTUP-002 and REQ-STARTUP-015 defer to it instead of naming a third-party server and
  inventing a flag of their own.
- **REQ-CONFIG-181 / REQ-MCP-010 / REQ-CONFIG-465** leave third-party package identities to the
  implementation and give a tool-server entry an `enabled` field. REQ-STARTUP-059 drops the draft's
  literal package name and version and keeps only the agreement rule; REQ-STARTUP-064 excludes
  disabled entries from warm-up planning.
- **REQ-UIBENCH-110 / REQ-UIBENCH-111** already carry the benchmark as a built-in desktop
  capability, which is why REQ-STARTUP-002 could drop the benchmark console script without needing a
  rescue of its own.
- **REQ-CONFIG-269 / REQ-CONFIG-396** place the machine-setup card in the `project` settings
  category; REQ-STARTUP-101 and REQ-STARTUP-153 cite that category rather than naming a new one.


> ## Corrective amendment, 2026-09-02 — domain 11's side of ESC-24
>
> *Made by the sweep pass as a correction of a contradiction between two amended domains, and recorded
> separately from the `REQ-STARTUP-145` amendment above.*
>
> `REQ-SHELL-169` (ESC-24) requires a launch arriving while this instance is shutting down to be refused,
> answered, and honoured once the shutdown has finished. Three requirements of this domain contradicted
> it as written, and one of the three would have defeated it outright.
>
> **`REQ-STARTUP-164`, and this is the one that mattered.** Clause (3) reclaimed the instance record
> where the hand-over went unacknowledged for 5 seconds, listing "a process that is running does not
> answer" among its triggers. A refusal **is** an answer, but it is not an acknowledgement of the
> hand-over, so on the literal reading a launch refused one second into a thirty-second force-exit
> allowance would reclaim the record at second five and become the second simultaneous instance ESC-24
> was ruled to prevent. Neither requirement was individually unsatisfiable, and no test in either domain
> would have caught it. The clause now states that an instance which answers is not an instance that does
> not answer, that the 5 seconds are not applied to a refusal, that the record is not reclaimed, that the
> launch waits instead, that the wait is bounded by the force-exit allowance `REQ-MONITOR-131` carries
> and of which this domain holds no copy, and that the deferred launch re-enters the resolution order at
> clause (1) with its full complement of attempts once the record is released — resolving a record the
> shutdown left behind exactly as the clause already resolves one naming a process that is no longer
> running.
>
> **`REQ-STARTUP-162`, twice.** Its clause requiring an instance that holds the record but has no window
> open to **build and show** a main window is precisely what ESC-24 identified as wrong, and
> `REQ-SHELL-169` forbids it from its side only; that clause now carries its single exception. Its
> silence rule — "no surface anywhere in the product reports that a launch was refused" — is scoped to a
> launch that has been handed over and has **ended**, which is what it was always about, and a new
> paragraph fixes what a refused-and-waiting launch shows. `REQ-SHELL-169` states in terms that this
> surface is domain 11's to fix and deliberately does not fix it, so until this amendment the obligation
> to tell the user existed and the thing that tells them did not.
>
> **`REQ-STARTUP-161`.** Its closure — "every launch resolves to exactly one of two outcomes and to no
> third" — is still true, because a refused launch eventually becomes the instance or is handed to a
> successor. Read literally it nonetheless reads as forbidding the wait. It now states that the set of
> outcomes is closed while *when* a launch reaches one is not fixed there, and that waiting is not a
> third outcome. The Data & Formats constant for the hand-over wait is qualified in the same way: the 5 s
> bounds an **unanswered** hand-over, not a refused one.
>
> **What was deliberately not done.** `REQ-STARTUP-121`'s update restart needed no amendment.
> `REQ-SHELL-169` relies on it — the record **passes** to a successor rather than being released, so a
> refused launch is handed to the successor rather than becoming the instance — and its own "SHALL never
> start a third process" holds unchanged. A reciprocal cross-citation from the update-restart side would
> make the interaction visible from there and is a nicety rather than a contradiction; it is reported
> rather than made.
