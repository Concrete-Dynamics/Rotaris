# Provenance — Specification Phase

This record exists so the claim "these specifications were produced independently" can be checked
rather than taken on trust. It documents who produced what, what each producer was allowed to see,
and what the audits found.

## Zone assignment

Every step ran as an isolated agent with its own context. No context was reused across zones, and no
agent that read the reference ever wrote a specification.

| Step | Reference access | Wrote to this repository |
|------|------------------|--------------------------|
| Reference freeze | yes | no |
| Behavioral survey | yes | no |
| Survey coverage critic | yes | no |
| Per-domain behavioral analysis | yes | no |
| Gateway (spec authoring) | no — exactly one sealed findings file per agent | yes |
| Contamination scanning | yes | edits to specs only |
| Second-pass verification | yes | edits to specs only |
| Adjudication | yes | no — read-only |
| Specification quality review | no — clean side only | no — read-only |
| Remediation | no — clean side only | yes |

The gateway is the only step that authored specification text, and it never had reference access. It
read exactly one sealed findings file, produced by an analyst it never communicated with.

## Sequence

1. **Freeze.** The reference was cloned to a sealed area outside this repository and pinned to a
   commit. See [`reference-record.md`](reference-record.md).
2. **Survey.** One agent enumerated the observable behavior surface as domains. An independent critic
   re-derived the surface and found four domains the survey had missed or under-recorded; those were
   added rather than argued away.
3. **Analysis.** One agent per domain wrote exhaustive behavioral findings into the sealed area.
   Two domains had to be split into halves after the single-agent attempts stalled.
4. **Gateway.** One agent per domain converted its sealed findings into a specification here.
5. **Scanning and verification.** Two successive passes compared each specification against the
   reference and edited what they found.
6. **Adjudication.** Read-only judges with reference access rendered a verdict on each file, and
   clean-side reviewers judged whether each file was fit to build from. This step found that the
   earlier editing passes had cleaned identifiers and library names thoroughly but had left copied
   *expression* and inherited structure largely untouched — six files were graded contaminated.
7. **Remediation.** Clean-side authors with no reference access rewrote the flagged requirements
   from the observable consequence alone, and fresh judges re-adjudicated every file.

## What the audits actually found

The recurring failure was not identifier leakage. It was prose: rationale sentences explaining why a
behavior exists, descriptions of internal mechanism where only the guarantee is observable, tables
reproduced in their original order, and statements that could only come from reading source or
tests ("no test covers this", "no caller supplies that"). Those are the marks of derivation, and
they survived passes that were looking for names.

The remediation instruction that worked was to *recompose* a requirement rather than edit it —
matching phrasing is the evidence, so rewording is the remedy.

Judges were also asked whether remediation had over-corrected. Several restored behavioral content
that earlier scrubbing had vagued out. A specification scrubbed into uselessness is a failure, not a
pass.

## Standing constraints on what comes next

Implementation agents will receive the approved specifications, approved architecture decisions,
public documentation, and approved design material. They will not receive the reference, the sealed
area, RED findings, or raw audit reports. The repository's `CLAUDE.md` states this boundary so it
applies to every session opened here.

Implementation commits should cite the requirement IDs they satisfy, so the chain from requirement
to code to test stays checkable.
