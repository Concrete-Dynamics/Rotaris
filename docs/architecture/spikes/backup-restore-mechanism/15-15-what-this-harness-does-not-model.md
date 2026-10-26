# Spike — the whole-store backup and restore, run end to end — 15. What this harness does **not** model

Part 15 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 15. What this harness does **not** model

- **No product code exists and none of this is a proposal.** The schema is four tables, the transcript is a
  padded string, and no requirement's real row shape is implemented.
- **The container is `tar`.** Gate 1's cost is therefore "extract the snapshot, then check it", and step 2
  extracts the same bytes again. A container whose snapshot could be opened in place would halve that. The
  double *integrity check* is ADR-0058's own choice and would remain.
- **The close handshake is relayed through the parent**, because two Node children have no channel of their
  own. ADR-0002's real topology has main relaying too, so the shape is right, but the transport is not
  ADR-0010's channels and the 1.2–1.5 ms handshake figure is a floor, not a prediction.
- **One machine, one architecture, NTFS on local NVMe.** Nothing here was run over SMB, over a mapped drive,
  or inside a synchronisation client's tree. ADR-0058 puts the store on machine-local storage, so this is the
  configuration that matters, but a restore of an artifact *read from* a network destination is untested.
- **The Electron figures are one run per size.** No repetition, no cold/warm control, no percentile. The
  event-loop lag figure comes from a renderer that draws an `<h1>`; the product's renderer has a state store,
  a transcript and a terminal grid, and `REQ-SHELL-150` must be measured against that, not against this.
- **Nothing was packaged.** No `electron-builder` artifact, no asar, and therefore **no test of the
  asar-unpack obligation** that survives untouched from ADR-0058 consequence 1. The binding was loaded from
  `node_modules` in every run.
- **No power-loss or kill test.** The process was never killed between step 3 and step 4. What a restore
  interrupted exactly in the gap leaves behind is unmeasured, and it is the one state where a user would find
  the store directory absent with no process left to reverse anything.
- **No concurrent second restore.** Two restores of the same identifier at once were not attempted; the
  instance claim ADR-0058 describes was not modelled.
- **`quick_check`, not `integrity_check`.** ADR-0058 names `quick_check` for gate 1 and this harness uses it.
  Neither establishes completeness — consequence 15 already says so.
- **No user interface.** Every "the product must convey" clause was tested by showing that the *values* are
  available before any mutation, never by rendering anything.
- **The identifier cases were driven file-by-file**, not through the two-process harness. The identifier
  write is a `.rotaris/` operation and involves neither store connection, but the ordering against the gates
  and the swap was asserted by construction rather than raced.

---
