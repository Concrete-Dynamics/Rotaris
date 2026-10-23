# Dependency alerts — triage readings

GitHub's Dependabot reads this repository's manifests and `pnpm-lock.yaml` and opens one alert per advisory, per
manifest, per vulnerable copy it believes it found. Its `scope` (`runtime` / `development`) and `relationship` (`direct` /
`transitive` / `inconclusive`) are inferred from the manifest a line sits in, not from the graph the product is built
from. **An alert is a lead, not a finding.** A reading here takes each open alert to the copy `pnpm-lock.yaml` actually
resolves, the paths that reach it (`pnpm why -r`), and whether the shipped application carries it, before anything is
changed.

Each file is one triage pass, dated, and names where its data came from: the API call and the moment it was read, the
commit it was read against, and the commands that established each path. A file records what was true when it was
written. When a later pass finds an alert closed, re-opened or re-scoped, that pass gets a file of its own; an earlier
file is not rewritten. An alert closes when the default branch carries the fix. A reading never dismisses one: dismissal
is the repository owner's act in GitHub, and none of these files performs or implies it.

The dispositions a reading uses:

- **patched**: a pull request moves the copy to a version outside the advisory's range, without breaking any dependent's
  declared range. The alert is *expected* to close when that pull request merges, and is not counted closed before.
- **residual**: no version outside the range exists, none is reachable without breaking a dependent's range, or the only
  one reachable leaves unchanged the code the advisory describes (taking it would close the alert and fix nothing). The
  reading records the copy's actual reach, what limits it, and what would retire it. A residual is an owner-visible risk
  that stays open, not a dismissal.

Each pull request a pass opens keeps its own record beside the pass, named `<date>-lane-<topic>.md`: what it changed, how
that was verified, and which alerts it is expected to close. It lives on that pull request's branch, so it reaches `main`
only with the pull request.

| File | Read against | Alerts | What it reads |
| --- | --- | --- | --- |
| [`2026-10-22-dependabot-triage.md`](2026-10-22-dependabot-triage.md) | `b0d1b3ff` | 51 open | the first pass (R-081): each alert's resolved copy, path and reach; two pull requests (patches; Electron); two residuals |
