# Spike — the cached launch of the Windows `onefile` portable — 12. Threats to validity

Part 12 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 12. Threats to validity

- **The machine was not quiet.** Other agents were building and launching throughout; CPU busy in the
  400 ms before each launch ranged 1.2 %–70.5 % and is recorded per run. The cached-launch margin is
  3.6 s wide and cannot be explained by scheduling noise; a quieter machine would make these numbers
  smaller, not larger, so the PASS verdicts are conservative.
- **`spawn` is not a double-click.** The clock starts at `CreateProcess` from a Node parent. A launch
  from Explorer adds shell overhead this does not capture, so every figure here is a **lower bound** on
  what a user experiences. This is the same caveat spike 17 recorded, and the comparison between the two
  spikes is unaffected by it.
- **The launcher is mine.** It was written for this measurement in a few hours. It is not the product's
  launcher, it has had no review, no fuzzing and no error-path hardening beyond what §8 exercised, and
  §8.1 shows that a straightforward reading of ADR-0054 already contained one defect that only appeared
  under test. **These numbers show the target is reachable with a conventional implementation; they do
  not certify any particular implementation.**
- **`fsync` discipline is weak and its consequence is unmeasured.** Only the marker is flushed before the
  commit rename. NTFS journals the rename but not the payload data, so a power loss between writing the
  tree and its data reaching the disk could leave a torn tree behind a valid marker — the §8 undetected
  class, arrived at by accident rather than by damage. Not measured, and flushing 507.9 MiB before the
  commit would change the first-run figures by an unknown amount.
- **The cold procedure drains the standby list, not everything.** It does not erase a Prefetcher trace.
  The single 1,319.1 ms `onedir` warm outlier in §4.1 is the same first-launch-from-a-new-path effect
  spike 17 identified, reported rather than removed.
- **One machine, one architecture, one storage class, one anti-malware configuration.** n is 3–6 per
  cell for the headline cells. §5.1 gives the only hardware sensitivity measured, and it is a thread
  sweep on one CPU, not a second machine.
- **The read-only test is an ACL deny, not a read-only volume.** See §13.

---
