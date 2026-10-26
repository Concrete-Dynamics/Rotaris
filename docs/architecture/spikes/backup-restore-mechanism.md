# Spike — the whole-store backup and restore, run end to end

- **Date:** 2026-09-02
- **Assigned as:** spike 22. The restore half of `REQ-SESSION-201` had never been run in any part. The
  backup half was measured on 2026-09-02 in `remote-and-synchronised-storage.md` (`VACUUM INTO`: 8 valid
  snapshots of 8 under a live writer; naive file copy: 625 unopenable of 627) and is not re-litigated here.
- **Question, as given:** does ADR-0058's restore work as written — the two renames, the reversal, the
  two-process close handshake, the three refusal gates, ADR-0005's lock-row correction, ESC-26's three
  identifier cases, the timing, and all of it under a build whose native store binding was produced against
  the Electron ABI.
- **Scope:** measurement only. No product code was written and none is authorised. Nothing was written into
  the repository except this file.

**Headline. The restore as ADR-0058 writes it fails on this platform in 30 of 30 attempts, at step 4, and
the record contains the sentence that explains why but does not apply it.** Step 2 opens the expanded
staging store read-write and no step closes it; step 4 renames that directory; Windows refuses to rename a
directory that holds an open handle — `EPERM`, 30 of 30. Closing the staging connection before the renames
makes it succeed 30 of 30. That is one line of the mechanism, and without it the feature does not work at
all.

Four further defects were found and are set out in section 14. The two that matter most: **the liveness
gate is evaluated before the run host is told to refuse runs, and a run launched in that window is
destroyed by the swap** — measured, with the run host mid-write; and **the workspace service waits for the
run host's acknowledgement with no bound, so a run host that does not answer, or that has already exited,
hangs the restore for ever** — measured, no result in 15,000 ms, twice, while a window is showing.

Everything else the record specifies held. The reversal restores the previous state when step 4 fails for a
reason that leaves the target name free; the failure names both directory paths when the reversal also
fails; the three gates refuse what they are meant to refuse and admit an older schema version; ADR-0005
consequence 11's lock-row correction is vindicated against its own counterfactual; ESC-26's three
identifier cases behave as ruled; and the whole thing runs under Electron 44.1.0 in real `utilityProcess`
children with a window painting throughout, at a main-process event-loop lag of 6 ms p50 / 13 ms max.

---

## Parts

Since 2026-10-26 the rest of this document is in [`backup-restore-mechanism/`](backup-restore-mechanism/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](backup-restore-mechanism/01-1-environment.md) | 1. Environment |
| [02](backup-restore-mechanism/02-2-what-was-built-and-what-it-is-not.md) | 2. What was built, and what it is not |
| [03](backup-restore-mechanism/03-3-method.md) | 3. Method |
| [04](backup-restore-mechanism/04-4-raw-results-windows-directory-rename.md) | 4. Raw results — Windows directory-rename semantics (`A-rename.js`, 30 trials each) — §4.1, §4.2, §4.3, §4.4 |
| [05](backup-restore-mechanism/05-5-raw-results-the-two-renames-the-reversal-and.md) | 5. Raw results — the two renames, the reversal, and what is observable between them; 5.1 ADR-0058 step 2 as written: 0 of 30 (`H-reps.js`, `B-restore.js literal-step2`); 5.2 The reversal (`B-restore.js step4-fail-handle`, `step4-fail`, `reversal-fail`); 5.3 What a reader observes between the renames (`I-gap.js`, separate observer process); 5.4 The `.displaced-<UTC timestamp>` name has no stated granularity; 5.5 A file manager holding the store's own directory blocks step 3: 0 of 30 |
| [06](backup-restore-mechanism/06-6-raw-results-closing-both-connections-across.md) | 6. Raw results — closing both connections across two processes — §6.1, §6.2, §6.3, §6.4 |
| [07](backup-restore-mechanism/07-7-raw-results-the-three-refusal-gates-k-gatesjs.md) | 7. Raw results — the three refusal gates (`K-gates.js`, `B-restore.js gate*`); 7.1 The gates are not read-only at the filesystem level; 7.2 A lock row naming another machine makes the target unrestorable, permanently; 7.3 The pre-restore summary can be assembled before any mutation |
| [08](backup-restore-mechanism/08-8-raw-results-adr-0005-consequence-11s-lock.md) | 8. Raw results — ADR-0005 consequence 11's lock rows (`J-short.js`, `B-restore.js lockrows-*`) |
| [09](backup-restore-mechanism/09-9-raw-results-esc-26s-three-identifier-cases-e.md) | 9. Raw results — ESC-26's three identifier cases (`E-identifier.js`) |
| [10](backup-restore-mechanism/10-10-raw-results-timing-f-timingjs-10-repetitions.md) | 10. Raw results — timing (`F-timing.js`, 10 repetitions per size, min / p50 / max in ms) — §10.1, §10.2, §10.3, §1.45, §10.4 |
| [11](backup-restore-mechanism/11-11-raw-results-the-electron-abi-confirmation.md) | 11. Raw results — the Electron-ABI confirmation, which ADR-0056 is owed; 11.1 There is no ABI mismatch to rebuild for, on this version of this binding; 11.2 What the rebuild actually took, and what `electron-rebuild` reports when it does nothing; 11.3 The restore under a packaged-shape Electron build (`e/main.js`) |
| [12](backup-restore-mechanism/12-12-raw-results-path-length-which-consequence-13.md) | 12. Raw results — path length, which consequence 13 predicts and points at the wrong file |
| [13](backup-restore-mechanism/13-13-verdicts.md) | 13. Verdicts |
| [14](backup-restore-mechanism/14-14-defects-found.md) | 14. Defects found |
| [15](backup-restore-mechanism/15-15-what-this-harness-does-not-model.md) | 15. What this harness does **not** model |
| [16](backup-restore-mechanism/16-16-files.md) | 16. Files |
| [17](backup-restore-mechanism/17-17-impact-on-the-record.md) | 17. Impact on the record; ADR-0058 — the workspace store; ADR-0005 — the session lock; ADR-0002 — process topology; ADR-0056 — the build toolchain |
