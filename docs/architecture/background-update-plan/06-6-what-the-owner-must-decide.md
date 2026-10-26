# Background updates — installable from a release, downloaded by itself, applied at the next start — 6. What the owner must decide

Part 6 of 8 of [this document](../background-update-plan.md), which indexes every part.

## 6. What the owner must decide

None of these is decided by this plan, by R-084, or under R-072's delegation: the request reserves them to the owner, and
the requirement clauses that depend on them say *reserved*. Each names the stage it blocks.

| # | Decision | Options | Recommended | Blocks |
|---|---|---|---|---|
| UD-1 | Metered or data-saving connections | (a) download regardless; (b) skip automatic download where Windows reports the connection metered (a native cost query) and offer it by click; (c) a setting — a preference key, so a further directive on REQ-STARTUP-146 and REQ-SHELL-006 | (a) for the first slice, disclosed (180); revisit with (b) | PR-4 |
| UD-2 | What a cancel means | (a) this process only: the offer returns with a manual download action, and the next launch downloads again; (b) the version is waved off as a dismissal is; (c) downloads pause until the user starts one | (a) | PR-4 |
| UD-3 | What dismissing means once downloads are automatic | (a) dismissing the download or ready notice only hides it; waving a version off is a separate act on the cancelled offer; (b) dismissing the download notice cancels and waves off; (c) keep REQ-STARTUP-117 as it reads | (a) — needs a revision of PD-STARTUP-008 naming REQ-STARTUP-117, REQ-SHELL-114, REQ-NOTIFY-216 | PR-4 |
| UD-4 | Which background failures the user sees | (a) transport failures silent and retried at the next launch; signature, manifest, digest and revalidation refusals shown as `Update not installed`; (b) everything shown; (c) everything silent except an apply the user started | (a) | PR-4 |
| UD-5 | Which release a pending update yields to | newer release appears: (a) replace the pending one, (b) keep it until applied; the latest release becomes **older** than the pending one (a release withdrawn): (c) discard pending, (d) still apply it | (a) and (c) | PR-2 constants, PR-4 |
| UD-6 | What the first start after an installed-flavour update shows while its installer runs | (a) a small non-modal "Updating Rotaris…" window, then the updated app opens; (b) nothing until the updated app paints; (c) the installer's own progress page | (a) | PR-3 |
| UD-7 | A notice after the update took effect | (a) one transient acknowledgement in the first window ("Updated to X"); (b) a persistent notice with the release summary; (c) none | (a) | PR-4 |
| UD-8 | Install timing, stated explicitly | **Next start** is the contract. (i) Never install at quit — `autoInstallOnAppQuit`'s pattern is **not** the contract; (ii) the portable's artifact is swapped as soon as it is verified (the running process is unaffected, the next start runs it) vs swapped at the next start by the launcher stub | (i) confirm; (ii) swap when verified | PR-2, PR-3 |
| UD-9 | Retention and retries | how many next-start apply attempts before a pending update is discarded; how long an unapplied pending update is kept; whether an offline start applies | 2 attempts; kept until applied or superseded; offline start applies (172 needs no network) | PR-3 |
| UD-10 | Where progress lives when another notice holds the single banner (REQ-SHELL-114) | (a) banner only — progress hidden while another notice is shown; (b) also an "Updates" line in About & Legal with progress and cancel; (c) a title-bar indicator (a new surface, design work) | (b) | PR-4 |
| UD-11 | Automatic rollback when the updated build will not start | (a) none: `.old` kept until the new version paints, recovery documented; (b) the launcher stub falls back to `.old` (portable); (c) both flavours, which the installed tree cannot do without UD-12 (b) | (a) now, (b) later | PR-3 |
| UD-12 | If PR-3's spike shows the NSIS over-install is not interruption-safe | (a) accept the residual risk, documented; (b) a side-by-side versioned install layout (an ADR-0054 revision and a new installer shape); (c) installer-only updates disabled until (b) | decide on the spike's evidence | PR-3 |

**Not the owner's — implementation choices the stages make and record** (they decide no product behaviour):
IMPL-1 the `<data>/updates/` layout and `pending.json` schema; IMPL-2 the hard-link-then-replace swap (or copy where a
link fails); IMPL-3 `--force-run` versus a relauncher, chosen on PR-1a's measurement; IMPL-4 hashing the retained asset at
apply (≈1 s, inside the exempt launch); IMPL-5 a proof-only key in proof-only packages, refused by the pipeline's preflight;
IMPL-6 how the gate snapshot intercepts the feed for update acceptance, kept off the release-gate snapshot; IMPL-7 no
`Range` resume — a download interrupted restarts at byte 0 (a resume would be a broadening to ask for, not to take);
IMPL-8 the cancel's 2 s bound (170) as the figure the proof measures; IMPL-9 log lines at `info`/`warn` per
`PD-MONITOR-002`.

---
