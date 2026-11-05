# Research — what is in `research/`, and what each corpus is for

Material that informed a decision: measurements, probes and research-derived guidance. **None of it is authority.**
What the product must do is `docs/spec/`; what the owner decided is `docs/product/`; what was built is
`docs/architecture/`. A file here is cited by a decision, or it is guidance a skill reads — and where it disagrees with
adopted material it says so and edits nothing.

**3 files and 2 corpora on 2026-11-05** (and one machine-readable result). The corpora are the two the record's own index names,
[`optimization/`](optimization/README.md) (the agent harness) and [`design/`](design/README.md) (UX and craft); each is
a folder with its own `README.md` and is **not** a split of a file at this path — `docs/research/` has no parent
document.

## What lives at this level

| File | What it is |
|---|---|
| [macos-build-probe.md](macos-build-probe.md) | the macOS ARM64 **source-build** probe (T6) in `release.yml`'s `build-probe` matrix: what a green source build establishes, and what it does not (IC-3 is not discharged by it) |
| [power-loss-test-concept.md](power-loss-test-concept.md) | the test concept for a power loss during a write (OQ-12): the scenario, in German as it was written. **A concept — it measures nothing and decides nothing**; the spike is [`../architecture/spikes/power-loss.md`](../architecture/spikes/power-loss.md) |
| [update-path-proof.md](update-path-proof.md) | the published-asset update verification (T3): `node tools/release-pipeline/update-path-proof.mjs`, and what it signs and checks |
| [update-path-2026-10-24.json](update-path-2026-10-24.json) | that proof's **machine-readable result** of 2026-10-24, tag `v0.1.0rc1` — the reading, not prose |
| [`design/`](design/README.md) | the design research corpus (2026-11-01, R-093): fourteen guides, an index, a reference catalogue and a ranked overhaul backlog. **Guidance, never authority** — it informs craft under [`../design/README.md`](../design/README.md) §1 and structure under §2, and overrides neither |
| [`optimization/`](optimization/README.md) | the agent-harness implementation guides (2026-09-21): fourteen framework-independent implementation profiles, an index and a reference catalogue. **Proposals to implement and test**, not a standard |

## How a file here is written and kept

- **A guide in a corpus is held to its sources and its date.** `tools/check-research-guides.mjs` runs in `pnpm lint`
  and fails a guide with no `**Review date:**` line or without its required sections (both corpora: "References and
  further reading"; the design corpus besides: "How this applies here", "Where this disagrees with the adopted
  material"). It prints the oldest review date and **never fails on age** — a calendar-driven red would fail the gate
  on a quiet day with nobody to fix it.
- **A guide is numbered once and never renumbered**, and a new guide takes the next number. Where a guide is over the
  document budget it splits into the index and its parts folder (`09-accessibility-for-a-dense-desktop-tool.md` and
  `09-…/`) like any other document.
- **A guide that disagrees with adopted material raises an open question and edits nothing** — its section 8 names the
  claim, the adopted text it meets and the question. The corpus, not the guide, is what a skill reads.
- **A file here is not a proof and not a spike.** A measurement that prices a decision belongs in
  [`../architecture/spikes/`](../architecture/spikes/README.md); the record a proof writes is under
  [`../proofs/`](../proofs/README.md). This folder holds what informed a decision *before* or *beside* it.

## Where a new corpus or file goes

A corpus with its own index, its review dates and its required sections gets a folder with a `README.md` here, added
to this page and to [`../README.md`](../README.md)'s table in the same change. A single measurement or probe that
prices a decision goes to [`../architecture/spikes/`](../architecture/spikes/README.md) instead; a machine-readable
result goes beside the proof that wrote it.
