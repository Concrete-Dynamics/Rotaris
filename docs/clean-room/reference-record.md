# Reference Record

This record identifies the exact reference version whose *observable behavior* the rewrite targets.
It contains identification metadata only. No reference source, structure, or implementation detail
is recorded here or anywhere else in this repository.

```text
REFERENCE-ID:   ROTARIS-CRW-001
Repository:     https://github.com/Concrete-Dynamics/Rotaris
Commit:         e7093dda0a44ff9f926dedcc782c4d0c30b73e3d
Default branch: master
Captured:       2026-08-29
License:        GPL-3.0
Tracked files:  1889
Acquisition:    fresh git clone from the public repository
```

*Noted 2026-10-21 ([R-078](../product/requests.md#r-078)): the identification fields above stand exactly as
captured. On 2026-10-21 the reference repository was renamed to `https://github.com/Concrete-Dynamics/Rotaris-legacy`
and archived; the reference commit `e7093dda0a44ff9f926dedcc782c4d0c30b73e3d` is unchanged. Since then
`https://github.com/Concrete-Dynamics/Rotaris` is this repository, the clean-room rewrite, and not the reference.*

## Behavioral target

All RED analysis, gateway specifications, and black-box oracle comparisons refer to this exact
commit. A different reference revision requires an explicit new reference record and a new
REFERENCE-ID; specifications derived from an older revision remain valid under their own revision
until re-approved.

## Licensing note

The reference is published under GPL-3.0. This rewrite is not a derivative work of it: the
implementation is produced from the approved behavioral specifications in `docs/spec/`, the
architecture decisions in `docs/architecture/`, public technical documentation, and approved design
material. No reference source is copied, adapted, or consulted by implementation agents. The
clean-room evidence in this directory exists to make that claim demonstrable rather than merely
asserted.

## Sealed material

Raw reference-derived analysis lives outside this repository, in a sealed working area that is never
committed here and never exposed to implementation agents. This repository contains only material
that has passed the clean-room gateway.
