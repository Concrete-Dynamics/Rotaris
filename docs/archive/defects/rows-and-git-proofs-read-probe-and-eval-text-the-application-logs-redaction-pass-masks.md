## rows-proof and git-proof read probe and eval text that the application log's redaction pass masks

**Outcome (repaired 2026-11-04).** The readers accept the masked echo as the step's own; the product is unchanged.
`apps/desktop/scripts/lib/logged-text.mjs` holds the one reading: `loggedAs` takes an echo for a text when it is the
text, or the text with value tokens replaced by the mark, each mark standing for exactly one value token as
REQ-TOOLS-171 bounds one (`"***"` a double-quoted value, `'***'` a single-quoted one, a bare `***` a run with no
whitespace or quote), so `({ key: *** })` is the echo of `({ key: a.b })` and not of `({ key: a.b, more: 1 })`.
`readEval` (`lib/capture-evals.mjs`) reads through it and still throws when two expressions at one offset echo alike.
rows-proof keys its end probes by the selector given, matching each logged line to the first selector not yet read
whose echo it is, in the order the seam runs them (`readEndProbes`), so the three outcome probes that mask alike are
told apart; its `inspect-at` and `probe-at` readings go through `readTimedStep`, which throws on an ambiguous offset.
Pinned by `lib/logged-text.test.ts` and four new cases in `lib/capture-evals.test.ts`, every log in them written through
the product's own `redact` (three of the four were red on `ad1a6698` before the change).

Shown on the branch `hrda-accept1-3` over `ad1a6698` (Windows 11 ARM64, Node 26.13.0, another tree's Electron
running beside it): `pnpm rows-proof --skip-build` green at 31 % load, REQ-CHAT-060's outcomes read `ok · 3.2s`,
`failed`, `blocked · 0.0s` and `◉ running…` and the blocked reason reachable, with the seven `data-call-key="***"`
lines still in `rows.log`. `pnpm git-proof --skip-build` (51 % load) passed the isolated launch's REQ-GIT-109 cell
reading and stopped at the worktree-ahead launch's `1440x902`, the known reading
`docs/defects/driver-and-git-proofs-read-the-window-two-pixels-taller-at-150-percent-display-scale.md` records.
Of the other `readEval` suites, `artifacts-proof` was green; `plan-gate-proof` read its eval and stopped at the known
`1000x682` (`docs/defects/plan-gate-proofs-window-reads-1000x682-where-1000x680-is-asked-on-windows.md`); `slash-proof`
read its popup eval and stopped after it on a skill from the real home
(`docs/archive/defects/slash-proof-counts-a-skill-from-the-real-home-as-a-fixed-skill-command.md`). Not repaired here, and
exposed the same way should a step ever carry a secret-looking name: `lib/capture-clicks.mjs`'s `unpressedClicks`
reads the click seam's echo verbatim, and other proofs carry their own copies of the probe parser; none of their steps
carries such a name today, and none of the three suites' logs from this run holds a masked echo.

Acceptance round 1 of plan hrda (finding AF-01, 2026-11-04, head `ad1a6698`, Windows 11 ARM64, Node 26.13.0,
`C:/dev/Rotaris-wt-accept`, `--skip-build`) found two proofs red on the same cause. Each was red again when run alone,
at 10 to 18 % load.

Since `ad07ac2c` (hardening bundle D1, "write the application log through the one redaction pass") `createAppLog` runs
every line through `redact()` (`packages/kernel/src/redaction.ts`). Layer 1 masks the value after a name that holds a
REQ-TOOLS-172 secret segment, and `key` is one of them. The capture seam echoes each probe's selector and each eval's
expression into that log, and the proofs find their readings by that echo:

```
capture: probe [data-testid="proof-workspace"] [data-call-key="***"] → [{"text":"11:00:03coding-agenthelper▾Reads README.mdok · 3.2s…
capture: probe [data-testid="proof-workspace"] [data-call-key="***"] .tool__outcome → [{"text":"failed",…}]
capture: probe [data-testid="proof-workspace"] [data-call-key="***"] .tool__outcome → [{"text":"blocked · 0.0s",…}]
capture: eval-at 170000 (async () => { … key: *** === 'THEAD' ? 'header' : … })() → {…}
```

- **rows-proof** keys each end probe by the selector as logged (`rows-proof.mjs`, the probe parser in `launch`). The probe
  for `[data-call-key="call-ok"]` is therefore absent, and the three outcome probes collide on one masked key, so the
  proof stops at REQ-CHAT-060 with `the ok outcome was not drawn: ""`, although `rows.log` shows the row drawn
  (`Reads README.mdok · 3.2s`). Its two `inspect-at` readings of `[data-call-key=…]` (the blocked header at 5000 ms and
  the collapsed card at 7600 ms) are found by a regular expression over the verbatim selector and would miss the same way.
- **git-proof**'s `WORKTREE_CELLS` eval (`lib/cell-paint.mjs`, `key: tr.parentElement.tagName === 'THEAD' ? …`) is
  logged as `key: *** === 'THEAD' …`. `readEval` (`lib/capture-evals.mjs`) matches the verbatim expression, finds none,
  and the isolated launch throws `the bound row's cells were not measured: undefined` (REQ-GIT-109).

The product masks as REQ-TOOLS-171 and REQ-TOOLS-172 require; the readers are wrong. Evals sent over the driver socket
(resilience, transcript, requirements) are not echoed through the log and are unaffected. Of the other `readEval` users
(artifacts, plan-gate, slash, live-run), none carries such a name today.

Once repaired, git-proof's worktree-ahead launch still meets the window read at 1440x902, a separate known reading
(`docs/defects/driver-and-git-proofs-read-the-window-two-pixels-taller-at-150-percent-display-scale.md`). Related open
note: `docs/defects/the-application-log-masks-the-word-after-token-in-the-products-own-stall-line.md`.

## Specs

None contradicted by the product: REQ-TOOLS-171 names application log files among the surfaces the one pass backs, and
REQ-TOOLS-172's segment list holds `key`. The proofs that measure REQ-CHAT-060 (rows-proof) and REQ-GIT-109 (git-proof)
went unasked on this head.

## Relevant files

- `apps/desktop/scripts/rows-proof.mjs`: the probe parser in `launch`, `inspect`, and the `data-call-key` readings.
- `apps/desktop/scripts/lib/capture-evals.mjs`: `readEval`, which matched the expression verbatim.
- `apps/desktop/scripts/lib/cell-paint.mjs`: the cell probe's `key:` field.
- `apps/desktop/scripts/git-proof.mjs`: the isolated launch's cell reading.
- `apps/desktop/src/main/capture/probe.ts`, `apps/desktop/src/main/capture/seams.ts`: the echo lines.
- `apps/desktop/src/main/app-log.ts`: `createAppLog`, which runs every recorded line through `redact()`.
- `packages/kernel/src/redaction.ts`: layer 1 and `SECRET_SEGMENTS`.
