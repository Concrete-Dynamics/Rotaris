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

**The release-age window comes before any alert.** An alert answers a vulnerability someone has already found in a
version this repository resolves; the first line of defence is that a version just published is not resolved at all.
Since 2026-11-01 `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`: no install takes a version younger than seven
days, so a hijacked or broken release that is noticed and pulled from the registry within that week never reaches
`pnpm-lock.yaml`. Beside it, `trustPolicy: no-downgrade` refuses a version whose publishing evidence is weaker than an
earlier one's (the shape of a stolen token), and `blockExoticSubdeps` keeps transitive dependencies on the registry. An
exception to either is an entry in that file with its reason and the date it goes; `tools/dependency-policy.test.ts`
fails any release-age exception and a trust exception that names no exact version (R-091,
[`hardening.md`](../hardening.md) §3.5).

**Version updates are Dependabot's; a reading here stays the alerts'.** Since 2026-11-01 `.github/dependabot.yml` has
Dependabot open version-update pull requests weekly: for npm in three groups (`electron`, which moves Electron,
electron-builder and electron-vite together; `dev-tooling`; `production`), at most five open, each proposing only a
version at least seven days old (its `cooldown`, matching `minimumReleaseAge` above, so `pnpm install` resolves it); and
for the SHA-pinned actions in `.github/workflows/`, whose pin and version comment it moves together. Such a pull request
is a branch, landed by the repository's workflow (rebase, gate green on the rebased head, fast-forward;
[`agent-workflow.md`](../../clean-room/agent-workflow.md)), never by GitHub's merge button. It does not replace a triage
pass: an alert is still read here, to its resolved copy and its reach, and a version update that closes one is recorded
by the next pass as the alert's disposition. `tools/dependabot.test.ts` holds the file's ecosystems, cooldown and groups.

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
| [`2026-11-01-audit-gate.md`](2026-11-01-audit-gate.md) | `9b0b5858` | `pnpm audit`, not the alerts | CI's blocking production audit's first run (R-091): 5 high in `zod`, `undici`, `fast-uri`, patched; what `--prod` does not see (the shipped Electron); how an exception is written |
| [`2026-11-04-lane-electron-44-10.md`](2026-11-04-lane-electron-44-10.md) | `ad1a6698` | `pnpm audit`, not the alerts | Electron 44.3.0 → 44.10.0 (R-091, acceptance finding AF-05 of plan `hrda`): GHSA-jr5w-w6x2-84p9 and three more, patched; the shipped runtime's audit made blocking |
| [`2026-11-06-lane-undici-ignore.md`](2026-11-06-lane-undici-ignore.md) | `b6501e8e` | no alert read — a version update refused | the owner's ruling after #54: `undici` majors in `.github/dependabot.yml`'s `ignore`, with the evidence and the lifting condition, and `tools/dependabot.test.ts` holding it |
| [`2026-11-07-lane-electron-vite-6-preload-fix.md`](2026-11-07-lane-electron-vite-6-preload-fix.md) | `6b521dc6` | no alert read — a version update completed | `electron-vite` 5 → 6 with the preload's externals answered (R-091): the root cause the 2026-11-06 probe left open, `build.externalizeDeps: false`, the artifact check that keeps it, `electron` held at 44.10.0 |
| [`2026-11-07-lane-electron-45-1.md`](2026-11-07-lane-electron-45-1.md) | `0b5981f3` | no alert read — a version update rated | Electron 44.10.0 → 45.1.0 **alone**, on the base the preload fix made green (R-091): the runtime line (Chromium 152 → 156, `modules` 149 → 150), the two native modules measured N-API-stable across it, and rule 4's own reading — which separates the pin's behaviour from the electron-vite-6 defect #49/#58 were confounded by |
