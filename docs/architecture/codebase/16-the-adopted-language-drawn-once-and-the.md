# The codebase — how the architecture is laid out in code — The adopted language, drawn once — and the evidence a critic reads (2026-09-12)

Part 16 of 22 of [the codebase record](../codebase.md), which indexes every part.

## The adopted language, drawn once — and the evidence a critic reads (2026-09-12)

The owner asked whether the repository's skills, instructions and workflows could make UI generation and debugging
better. Classified **covered** as R-007: `docs/design/README.md` §7 already governs generation, REQ-SHELL-128..160
already govern rendered evidence, and REQ-WORKSPACE-051/053 already govern repository-local portable skills. Nothing
here changes what the product does. What it changes is **where a control is written, and what can be measured about
one** — `packages/ui/src/design-system/` (twenty-seven briefs, twenty-nine typed exports, sixty-nine drawing files
migrated onto it), `tools/check-ui-language.mjs` in `pnpm lint`, `pnpm ui-review`'s evidence pack, `theme-proof` moved
onto the driver, and three portable skills under `.agents/skills/` with thin `.claude/skills/` routers. *(Three then;
five since — `orchestrated-build` and `run-autopsy` came later, and run-autopsy's router on 2026-10-13, which
`tools/skill-routers.test.ts` now pins for every portable skill; since 2026-10-26 `tools/agent-config.test.ts`, which also holds each router's description to the canonical file's.)*

**Eight defects, the ninety-first to the ninety-eighth, and six of the eight were in the measuring code.** That ratio
is the finding, not a coincidence: this delivery is almost entirely measurement, and measurement is where this project
has repeatedly found its faults.

**The ninety-first — the theme matrix's focus section had been photographing a still image.** `webContents.capturePage()`
answers with the last COMPOSITED frame, and a window Windows has decided is occluded composites nothing. **Thirty-two
consecutive focus captures were byte-identical to `settings-13.png`** — the capture succeeded, the PNG was written, the
PNG decoded, the pixels were measured, and the section concluded that **no control in this product paints a focus ring**:
ratio 1.000 for every nav item and every Settings category, on every theme at every scale. Nothing about the failure
looked like a harness fault; it looked like a wholesale accessibility violation. A capture that must be new now says so —
one pixel of resize forces a frame, three refusals are reported as a stale capture, and a stale capture is excluded from
the ratios rather than counted as a failing one. With fresh frames the section passes everywhere: **31 of 32 captures
tested, minima 3.27 to 7.12 against a floor of 3**, one skipped because that Tab landed on no measurable control. The
counterfactual is worth stating too — `--counterfactual=focus` would have "failed" against the frozen frame as
convincingly as against a real one, so it discriminated nothing while looking like it discriminated everything.

**The ninety-second — a control disabled by `aria-disabled` was held to the enabled floor.** Mission's Pause is
`aria-disabled` rather than `disabled`, because REQ-TRACE-435's shape requires it to stay focusable and carry its reason;
it wears the disabled colour all the same. The metadata's disabled test read `:disabled` alone, so the proof measured a
disabled label against 4.5:1 instead of REQ-SHELL-145's 3:1. **The floor follows the appearance, not the attribute that
produced it.** Correcting it did not make the red go away — it made it exact, which is the next paragraph.

**The ninety-third is the product's, and it belongs to the owner: OQ-56.** With the frozen frames gone and the floors
right, one thing is left standing in the whole matrix. `--rt-text-disabled` is transcribed from the adopted
`docs/design/system/tokens/colors.css` at `oklch(52% 0 0)`, and against the default palette's own surfaces that clears
**3.22:1 on `--rt-bg`, 3.07:1 on `--rt-chrome`, 2.90:1 on `--rt-surface`, 2.56:1 on `--rt-surface-2` and 2.48:1 on
`--rt-hover`**. REQ-SHELL-145 asks for 3:1 **on every background the token is actually painted on**, and the rendered
proof measures 2.898:1 on a card — for "Cancel selection" (`disabled`) and Mission's "Pause" (`aria-disabled`) — at
100 %, 125 %, 150 % and 200 %. `nocturne` (60%) and `high-contrast` (62%) clear every surface. **At 175 % it passes, at
3.030:1**, which is the sharpest thing the matrix says about this token: the same pair, the same palette, and one
scale's device-pixel rounding is the whole distance to the floor. A value that four scales fail and the fifth clears by
three hundredths is not a value anyone chose — it is one nobody had measured.
**`static-contrast.ts` passed it because it checks the page ground alone — which is REQ-SHELL-160 (a)'s own sentence**,
"a token pair that computes correctly but paints over a different surface fails". Widening that check is one line and
`oklch(58% 0 0)` clears every surface while staying far under the dimness ceiling; **neither is an agent's to do**, because
one changes approved design material and the other changes an approved requirement. So the token is unchanged, the
narrow check stays narrow with its reason written beside it, `docs/design/README.md` §5 item 1 records that the
acceptance item it had flagged as "specifically at risk" has now been settled from pixels and failed, and OQ-56 carries
the two resolutions. `pnpm theme-proof` is red on `rotaris-dim`'s `contrast` section and on nothing else until it is answered.

**The critic ran, in a fresh context, and it is worth what it cost.** `pnpm ui-review` captured twenty-six PNGs — seven
views at two sizes, six overlays at two sizes — with geometry, computed-style landmarks, eight evaluated layout
contracts per view and **zero deterministic findings**; an agent with no memory of building any of it read the pack and
returned **twelve findings, four high, seven medium, one low**, every one citing `geometry.json` or `styles.json` by
number. The deterministic layer had reported the surfaces CLEAN, and it was right: nothing was clipped, buried,
unreachable or outside its box. What the critic found is the class of thing no assertion here was ever written to
catch — **ten distinct interactive heights across the pack**, three different treatments for "this one is selected"
with one of them outside the declared tints, empty-state panels at 84 % of a view's height around three lines of copy,
and a table whose right edge lands at 1400.44 px in a 1400 px window. **Two lessons, both cheap to state and neither
obvious before the pack existed.** A screenshot pack read by something that did not build the product is a different
instrument from a proof, and it should be run as one. And the containment check did not report that 1400.44 — a finding
against the probe, which the next round owes.

**The critic dropped one of its own findings, and that is the part worth keeping.** It had read `.btn-secondary` in the
downscaled captures as a filled light block, which would have violated the one-filled-control rule outright. Before
writing it down it decoded the PNGs and sampled the pixels: the secondary's ground is `rgb(34,34,34)` against the
primary's `rgb(103,78,176)`, the perceptual read of a shrunk screenshot was simply wrong, and the rule holds. **A critic
that judges from an impression of a picture is worth nothing here**; one that measures before it files is the whole
difference, and it is why the pack ships geometry and computed styles beside the PNGs rather than PNGs alone.

**One was repaired, ten were carried, and the difference is the point.** UIR-008: the banner's two controls were direct
children of a `flex-start` row with only the dismiss centring itself, so their centres sat **5.42 px apart on every view
at both sizes** — the first misalignment on every screen in the product. They share one cross-centred row now and an
`align-y` contract between them, and iteration 2 measures both middles at **81.62** where they had been 76.19 and 81.62.
**The other eleven were not an agent's to act on**, and saying why is the whole discipline: seven touch geometry or an
information architecture the specification owns, one — the native checkboxes — is **OQ-57**, because
`docs/design/` contains no checkbox at all and drawing one would invent a member of the adopted language, and the rest
are readings of the design material that the material should settle. Their dispositions are written into
`critique.json` beside them, each with its reason, and **the dispositions are this session's, not the owner's** — the
file says so in the field that records who wrote them. **Only one of the three cycles the plan allows was spent**: a
second pass over eleven unchanged surfaces would return the same eleven findings and read like progress.

**The ninety-eighth — the iteration series broke on the round where something was repaired.** `ui-review` keyed its
output directory on `HEAD`, and acting on a finding changes `HEAD`, so `iteration-2` never found `iteration-1`'s
critique and a three-round series could not link once. The pack keeps the revision it was shot at — that is its
provenance — and the chain now looks across revisions for the newest `iteration-(N-1)/critique.json`. Found by running
the loop rather than by reading it.

**The matrix was run twice and the two passes are identical.** Fifteen runs each — three themes × five scales — naming
the same two strings at the same 2.898:1 on the same four scale points, with **zero stale captures**, **31 of 32 focus
captures tested and one skipped** in every one of the thirty runs, and **no text skipped for animating** in either pass,
which is the mid-fade repair holding. A verdict that reproduces exactly is what makes the one red attributable to the
palette rather than to the machine.

**Repaired on the way, and NOT a new number: the mid-fade contrast reading.** 2026-09-08 diagnosed five strings at about
1.26:1 in the startup notice and attributed them to the notice being photographed mid-fade. It was diagnosed then and
never repaired; it reappeared here at high-contrast × 2. Waiting harder is not enough on its own — **the notice mounts
after the settle that preceded the capture**, so its animation was not in the list that was awaited. Settling is a loop
now, and the metadata carries, per string, whether that element's subtree was still animating when the frame was taken;
a string that was moving is reported as skipped with its reason and never as a floor violation. Every section of the
proof now reports **discovered, tested and skipped**, because "no failures" over an empty sample is the shape of a proof
that cannot fail.

**The ninety-fourth — `composer-proof` failed on a preference that is none of its business.** Its REQ-SHELL-006 check
read `!JSON.stringify(preferences).includes('alpha')` — the whole serialised document — to assert that no workspace path
is spelled into a *key*. Main's `workspace/lastOpened`, added the same day by the startup-resolution work, stores a
workspace path as a legitimate **value**, and the document-wide scan began failing a registration it was never about.
The assertion reads keys now. **The date it went red is stated and the falsified text is kept beside its replacement.**

**The ninety-fifth — the language guard watched half the code that draws.** `check-ui-language.mjs` scanned
`packages/ui/src` and stopped, and `apps/desktop/src/renderer/main.tsx` — 120 KB, the terminal and persona window
bodies — was outside it, where one raw `<button>` toggle sat. A guard that names a rule and enforces it over part of the
tree is worse than no guard, because the part it does not reach reads as compliant. It scans both roots now, and the
toggle is the shared `ToggleSwitch` — which was also about to carry **two accessible names**, since the caller names it
by visible text with `aria-labelledby` and the component always set `aria-label`.

**The ninety-sixth — `TextArea` published another component's name into every capture.** It emitted
`data-ui-component="Input"`, so every geometry and style row for a textarea in every evidence pack was filed under a
component it is not. Nothing rendered differently; the *evidence* was wrong, which is the failure mode this whole
delivery is supposed to make impossible.

**The ninety-seventh — the class helper repeated the token the caller already carried.** The parser-based migration
passes each caller's exact class string through, so `Button` received `className="btn btn-primary btn-compact"` and
composed `"btn btn btn-primary btn-compact"`. CSS does not care; a selector written against `className` does, and every
migrated control in the product carried it. `classes()` keeps the first occurrence of each token now.

**What the baseline is, and why it can only fall.** 163 normalized literal spacing, type, radius and motion entries
remain, 157 of them in `shell.css`. The check fails on a new one **and on a paid-off one** until the baseline is lowered,
so an allowance freed in one file cannot be re-spent in another; `compareDebt` is a pure function with both directions
pinned by a unit test. The same split runs through the audit: the probe inside `ui-audit.mjs` now only **measures**, and
`lib/layout-relations.mjs` decides, with all nine relations and both directions of each failure covered by fixed
numbers — a verdict reached inside the page can only be exercised by launching the product.

**Verified on the merged branch.** `pnpm check` green (symbol generator, `tsc --noEmit`, `eslint`, **1,598 passed and 25
skipped across 135 files**) and `pnpm build`. **Of the thirty-seven proof scripts, thirty-six ran — `slice-proof` alone
needs the owner's pasted key *(so it did then; since 2026-10-02, [R-068](../../product/requests.md#r-068), a registered endpoint with a stored key runs it unattended and an endpoint without one takes `--paste-key`)* — and the list was generated from the filesystem rather than typed.** Thirty-two passed on
the first sweep, `code-intel-proof` among them.
**Three of the four reds pass alone on an idle machine** — `composer-proof` after the repair above, and `mcp-proof` (229 s)
and `transcript-proof` (its 1200-row growth bound, 39.1 ms against 22.1 ms) unchanged, which is the standing rule that a
batch runner's exit code is not a verdict. The fourth is OQ-56 and stays red by decision, not by accident.
