# The codebase — how the architecture is laid out in code — All twelve critic findings, repaired and measured (2026-09-13)

Part 17 of 22 of [the codebase record](../codebase.md), which indexes every part.

## All twelve critic findings, repaired and measured (2026-09-13)

The owner read the dispositions of the first critic pass and answered them in five words — *"i want you
to fix ALL of them"* — including the four this session had carried back as needing a ruling. Logged as
**R-008**, classified **covered** with one open question answered: eleven are craft against the adopted
language, and the twelfth (UIR-004) **closes OQ-57**, because `docs/design/` defines no checkbox and
only the owner could decide that the product draws one.

**Every finding is stated as a number the evidence measured before and after**, from the two packs' own
`geometry.json` and `styles.json` rather than from a claim:

| # | What it was | What it is |
|---|---|---|
| UIR-001 | status strip `scrollWidth` **1847** against `clientWidth` 1400 and 1000 | **1400/1400** and **1000/1000** |
| UIR-002 | a branch fragmented across six lines | elided; **0 boxes past the viewport** at either size |
| UIR-003 | page headers **30.39, 51.81, 51.44**, two absent | **32** on every view that draws one |
| UIR-004 | the platform's own 13 × 24 box, `border-radius: 0` | **2 `Checkbox` components** in the pack; seven call sites |
| UIR-005 | active option `oklch(0.29 0 0)` at **14 px** | `--rt-accent-tint-14` at **11 px** |
| UIR-006 | **eleven** distinct interactive heights | **three** — 24, 32, and the composer textarea at 80 |
| UIR-007 | largest empty state **1236 × 636 = 71 %** of its view | **555 × 185 = 21 %** |
| UIR-008 | the banner's two control centres **5.42 px** apart | both at **81.63** |
| UIR-009 | four unrelated bands at 1000 × 680 | two declared rows at both sizes |
| UIR-010 | two selects' left edges **51.04 px** apart; one **729.2 px** wide to hold "single" | one label column; fields bounded to content |
| UIR-011 | a **393 × 24** button carrying two clauses | **134 × 24**, elided, the sentence unchanged where the requirement puts it |
| UIR-012 | rightmost extent **1400.44** in a 1400 px window; a **2230 px** history | **1400.00**, and **1063** |

**Three of the twelve were not what the critic thought, and that is worth more than the repairs.**
UIR-001 reads as a craft preference and is a **`REQ-SHELL-038` violation**: the requirement says "a long
one is clipped with an ellipsis and keeps its full text in the tooltip", and the items were
`flex: 0 0 auto`, so nothing ever shrank, no ellipsis ever happened, and the strip overflowed instead.
UIR-003 reads as a design choice and was a **missing declaration**: `.display` was defined *nowhere* in
the product, so an `h1` carrying it fell back to the browser's 2em wherever a view had not overridden it
— Library and Settings at 32 px, Overview and Git overriding to 18, Mission to 20, Requirements to 14.
And **UIR-011 could not be done as asked**: `REQ-TRACE-390` requires the accessible description to equal
the **visible** text, so replacing the sentence with a verb would break the clause the control exists
for. It was bounded and elided instead, which is the repair the language already makes elsewhere.

**UIR-005 found the adopted material disagreeing with itself.** `system/components.css` line 65 draws
`.seg-opt.is-active` with `background: var(--rt-surface-2)` — a neutral block off the ground ramp — and
§1.2 of the README that **adopts** that sheet says selection is "a tint plus accent ink, never an
outlined box and never a filled block", with three tints and no fourth to be invented. The README wins,
because it is the document that adopts; §1.2 now records where the two differ so the next reader does
not have to find it again. The other half of that finding was a plain drift: `font: inherit` had
discarded the adopted `.seg-opt`'s own `--rt-text-xs`.

**Six values were named rather than invented.** `--rt-control-height` (32) and
`--rt-control-height-compact` (24) are read off the adopted `.btn` and `.btn-compact` — 7 px padding over
`--rt-text-sm` at 1.2 with a hairline is 32, and `.input` already declared `min-height: 32px` outright.
`--rt-prose-measure` (340) is the one width the sheet states for a block of secondary text,
`.empty-state-hint`'s. `--rt-label-column`, `--rt-field-min` and `--rt-tick-width` are the three the
material does not state, and all six are declared in the theme data where the rendered proof can see
them — **a token name that resolves to nothing is worse than an honest literal**, which this record
learned in wave 3, and is why not one of them is a bare `var(--rt-thing, 12px)` fallback.

**The ratchet worked in the direction it was built for.** The repairs took the literal-geometry baseline
from **163 entries to 158** — `font-size: 18px` and `20px` gone with the per-view titles, four
`min-height` literals gone with the control scale — and the check refused to pass until the baseline was
lowered to record it, twice, because that is what "a paid-off allowance cannot be re-spent elsewhere"
means in practice. Five new literals appeared in the first draft of the checkbox and the guard caught
every one: a visually-hidden input's `1px` pair, the tick's `2px`, a `420px` cap and a `32px` fallback.
The checkbox was rebuilt around `appearance: none` on the real input — a better control anyway, since
the focus ring now lands where the keyboard does — and the rest became tokens or a `vh`.

**Verified.** `pnpm check` green (**1,601 passed, 25 skipped**), `pnpm build`, and eight proofs over
every surface that changed — `layout-proof`, `git-proof`, `requirements-proof`, `sessions-proof`,
`settings-proof`, `composer-proof`, `mission-proof`, `library-proof` — all green. `pnpm ui-review`
reports **0 deterministic findings** on the repaired build, and a second critic cycle read the new pack
in a fresh context to check the twelve rather than take them on trust.


**The second critic cycle checked the twelve rather than taking them on trust, and it is the reason this
paragraph is not a victory lap.** A fresh-context agent read the repaired pack, decoded pixels rather than
trusting the downscaled captures, and returned **six verified-resolved, six partial, and twelve new
findings**. It reproduced every number claimed above from the packs' own evidence. What it caught is that
**three repairs were the same mistake in different clothes — a bound applied to a child rather than to the
box the child lives in**: the status strip fitted by cutting nine of twelve items to six-character stubs
rather than by priority; the worktrees table stopped fragmenting words and took a 549.48 px floor inside a
346 px card, putting the danger-styled Delete off the card; and the Library panel shrank past its card,
leaving 248 px of bare ground above a one-sentence message. **All three are repaired** — priority elision
behind a `data-elide` marker, `table-layout: fixed` so the table takes its card (340 px in a 346 px card),
and the panel sitting where its first row would. The strip now fits exactly at 1400 and overflows by 79 px
at 1000, down from 847, with the remainder reachable through the scroll affordance REQ-SHELL-038 keeps.

**Nine findings are carried, and one of the critic's readings is wrong.** UIR-018 calls
`--rt-accent-tint-14` a fourth tint strength; it is the third of the three §1.2 declares. What is fair in it
is that two selection idioms now differ in strength — tint-10 on the rail, tint-14 on the segmented control
— and which one a control takes is the material's to say. The Git header at 1000 × 680 reports
`clientHeight` 56 against `scrollHeight` 76, a control sitting outside its header with nothing clipped;
**not repaired**, because the cause is a wrapping flex line and guessing at one from a capture is how a
repair becomes a regression. The dot grid still paints under the copy, which is the motif's own material.

**The ninety-ninth defect — re-running an iteration deleted the critique written for it.** `ui-audit`
empties its output directory before it captures, which is right for evidence and fatal for the one file in
there that is not evidence: a critique is the only record of a reading and it costs a whole pass to produce.
The second cycle's file was destroyed by a re-capture minutes after it was written, and its content survives
only in the session transcript and in this paragraph. `ui-review` refuses an iteration that already holds a
critique now, and `--reshoot` is how you say the loss is intended. **Found by running the loop, again.**

**The refusal was not enough, because the wrapper is not the only way in.** The same critique was destroyed a
second time on 2026-09-13 — the directory that held it now carries one 1400x900 Overview capture where the
pack had twenty-six images — and the refusal had nothing to say about it, because a refusal in `ui-review`
guards the door while the deletion lives in `ui-audit`, which anyone may run directly with `--output=` aimed
anywhere. So the tool preserves rather than refuses now: emptying the output directory carries `critique.json`
across the wipe, and `--discard-critique` (which `ui-review --reshoot` passes) is the one way to lose it on
purpose. **Preserving beats refusing when the thing being protected is not reproducible**: every other file in
a pack comes back by capturing again, and a reading does not. The skill says so too — a critique is the least
durable file in the pack, `.ui-review/` is ignored by git, and the findings belong in the report the critic
hands back, not only at a path.

### UIR-014 was `flex-shrink`, and the guard that now catches its whole class

The one finding carried out of the second cycle is repaired. It read as a wrapping defect and was not: every
view is a `flex-direction: column` box, so its header is a flex **item** carrying the default `flex-shrink: 1`.
When a short window's content exceeds it the column takes the difference out of whichever child will give, and
`min-height` — which reads like a floor — only says how far. At 1000x680 the Git header's actions wrap to a
second line, its content stands 76 px tall, and the column shrank the **box** to 56 while the content kept its
size. Nothing was clipped, because a header does not scroll: the second line paid out below the box and the
worktrees card, painted later, covered it. That is why "Merge selected" ended at y 231.25 beneath a card border
at y 227 with its own bottom border never drawn at all. `.page-header { flex: 0 0 auto }` is the whole repair —
a header shows its content or the view scrolls; it is never the thing that gives way. It is the second cycle's
own lesson mirrored: the bound was on the header, and what the header needed was to refuse to shrink.

**An ancestor's scroll is no excuse, which is why the check is strict.** `.git` is itself `overflow: auto`, so
the overflowing content did extend the view's scroll height — and scrolling never revealed it, because the next
card paints over that region. A box that cannot show its own content is a finding even inside a scroll
container. `shrunkBoxes` in `lib/layout-relations.mjs` is that verdict, pure and unit-tested in both directions,
and `ui-audit` reports it as **`SHRUNK`**: a marked box whose content exceeds it on an axis whose `overflow` is
`visible`. It is not `text-fit`, which is opt-in and published by a component about itself — and which caught
nothing here, because nobody thought to publish it on a header. This asks the question of every marked box.

**It was proved against the defect before being trusted.** With the repair reverted the sweep reports
`client height 56 holds content 76 and does not scroll` on `.page-header.git__header` — the critic's two numbers,
reached deterministically — and with it in place the header measures 830 by 830 and the finding is gone. Across
fourteen captures the new check is quiet: one finding, and a real one the critic missed.

**That finding is open, and it is the fixed-layout table's bill coming due.** `table-layout: fixed` fitted the
worktrees table to its card, which is what UIR-002 asked for; what `SHRUNK` measured is the cost. Seven columns
share 342 px at 1000x680 — 48.56 px each — and **six of the seven hold content wider than their column**:
heading "Branch" 59, `mainbase` 71 (elided), `idle · ready` 59, `+0 -0 / 0` 73, the Delete button 58. Each one
with `overflow: visible` paints across its neighbour, and because only the last column can overflow the table
itself, the table reports 350 inside 340. Two repairs were tried and **measured afterwards rather than
announced**: confining the heading cells did not move the 350 (their overflow lands on the next heading, inside
the table), and letting the action cell wrap did not either (a 58 px button cannot wrap below its own width).
Neither was kept. What the numbers say is that `.git__body` hands the checkpoint column its full 480 px and the
seven-column table the remainder, and choosing between a narrower checkpoint column, a stacked layout and fewer
columns at the minimum size is the design material's call — not a CSS nudge at the end of a repair round.

**The layout contract's first evaluation on the window controls, and the audit that could not survive it
(2026-09-28, R-062).** The controls `PD-SHELL-003` added wrote their contract by hand as `{"relations":[…]}`; the
CONTRACTS sweep iterates an array, threw in the renderer on every view (the title bar is on all seven), and the script
died on the driver's `{ error }` answer, so no pack could be produced on any view. Repaired in three parts: the controls
(and the Proposals tab, the one other hand-written attribute) publish through `layoutContractAttributes`; `pnpm lint`
refuses a `data-ui-contract` written anywhere else in the drawing roots (`tools/ui-contract-publisher.mjs`, called from
`check-ui-language.mjs`); and `ui-audit` reads each answer through `lib/audit-answer.mjs`, so a thrown expression is an
`AUDIT-ERROR` finding naming the view, the size and the expression, and a non-array contract is a `schema` finding for
its own box. First run of the whole sweep with the controls' contract in it: 14 captures and 12 overlay captures,
**0 findings**, 9 contracts per capture, the containment in `shell-title` passing. What it could not show: About is a
Settings category, not a view, so no pack reaches it and the owed critique of the About caption is still owed
(`../../defects/fixed/the-window-controls-contract-is-an-object-and-kills-every-ui-audit.md`). One more defect in the same
script was found by the counterfactual and recorded, not repaired: a `CONTRACT` finding's own `kind` is overwritten by
the relation's (`../../defects/fixed/a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md`) — repaired 2026-09-29 (R-067): the finding keeps `CONTRACT` and names the failed relation under `relation`.

### The third cycle's critique, recovered from the reader rather than from the disk

The file was gone; the reading was not. The critic still held its own transcript, so the twenty-four entries came
back verbatim in three messages and were written to the path the tool now protects — twelve verification entries
and twelve findings, **valid against the schema on the first parse**. Its evidence arrays name files that no
longer exist, which is the true cost of defect 99: the observations' numbers are the only remaining check on them,
and a fourth reader could not re-measure a single one. **Ask a critic for its findings in the message, not for a
path to them.**

**Two of the twelve are misreadings, and both were settled from the source rather than argued.** UIR-018 reports
`.seg-opt.is-active` painting an alpha of 0.18 where the language declares three tints — but the theme data
defines `--rt-accent-tint-14` as `oklch(59% 0.160 292 / 0.18)`, and the rule cites the token, not a number: the
name is the tint's nominal strength, not its alpha, and the three declared tints are 0.09, 0.13 and 0.18. There is
no literal to lint. UIR-022 reports the Library's violet kicker as an outlier against eight grey ones — but
`.card-accented .card-kicker { color: var(--rt-accent-300) }` is declared in the **adopted**
`docs/design/system/components.css`, and the stash card takes `card-accented` deliberately. What is fair in it is
the question of whether that card should be the accented one, which is an information-architecture choice and not
a defect. Both readings were reasonable from a screenshot; neither survives the source.

**UIR-024 repaired and measured**: the Mission captions spanned both columns, so the form had three left edges
where the label column was introduced to give it two — label ink at 145, field at 272.98, and a caption starting
at 145 that belonged to the field. `grid-column: 2` puts each caption under the control it describes, measured at
**272.98 at both window sizes**.

**UIR-023 attempted, measured, and reverted — the finding is fair and the obvious repair is worse.** The rail's
seven items are sized to their own labels (54, 58.73, 54, 70.98, 54, 54, 54), so the selection tint changes shape
as the user moves. `align-self: stretch` does equalise them — measured at one width and one x across every view —
and then the rail resolves to its `min-width` rather than to its longest label, and the new sweep immediately
reported **every item in the pack holding 57 px of content in a 54 px box**: "Requirements" clipped, which is the
one thing REQ-SHELL-029 names this rail's width for. A constant tint box is craft; an ellipsis in the primary
navigation is a requirement. **The guard caught the repair within minutes of being merged, which is what it is
for.** Whatever answers this has to widen the rail and equalise the items in one move, and the rail's declared
width is the design material's to change.

**Seven remain open with written reasons**: UIR-013 (the strip elides all twelve items rather than dropping the
lowest-priority ones and middle-eliding the path), UIR-015 and the seven-column table above, UIR-016 (the Library
card did not shrink with its panel), UIR-017 (the dot motif paints under the copy — the motif is the material's
own), UIR-019 (the session browser's empty message inherits a column's alignment), UIR-020 (the slash catalogue's
kind tag is not a column) and UIR-021 (the composer's kickers carry values the controls already state). Four want
a decision from the design material; three are drawable but touch spec-owned surfaces, and none should be guessed
at from a pack that no longer exists.

**The hundredth defect — the artifact port's private section list, found by planning a directive's closeout.**
`PD-LIBRARY-001` widened the section vocabulary with `commands`, and the store's own filter took the widening the
day the directive landed — its test has been green since. What nobody had tested is the only path a model reaches:
`artifactOps.read` in the engine port filtered every `artifact_read` request through its own `SECTION_NAMES`
list, which predated the directive and never gained the section, so a filtered read for `commands` matched
nothing and **fell through to the full document**. A model asking for the command ledger received the whole
artifact and every request read as success — the falsest kind of green, because the store test proves the
mechanism and the drift lived one seam above it. Found while planning the directive's built-app evidence, not by
a red check: the unit suite could not see it because the tool path had no test. The repair is the one the
vocabulary asks for — the port imports contracts' `ARTIFACT_SECTIONS` and no longer holds a copy — pinned by a
regression through `artifactOps.read` and held shut by `pnpm artifacts-proof`'s sixth launch, which drives the
whole path in the built app: a child runs three ordered terminal calls (success, exit 7, one the gate denies),
and the ledger lands in SQLite in the exact run order, comes back through the real filtered tool read as **only**
the Commands section, sits in the sidecar with the same statuses in words, and renders in the inspector. The scripted dialect gained a
verification-only `terminal:<key>` step for it. `REQ-TOOLS-148` now takes that widened vocabulary through the
directive too. Recorded in a defect note (removed once repaired);
the first execution is in `docs/architecture/first-executions.md` and the directive's own record.
