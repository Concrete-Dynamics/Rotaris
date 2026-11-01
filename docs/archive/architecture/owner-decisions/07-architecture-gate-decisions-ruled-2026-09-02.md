# Archived owner decisions — Architecture Gate decisions — ruled 2026-09-02

The ruled escalations, structural rulings and gate decisions of [part 07](../../../architecture/owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md) of [the owner decisions](../../../architecture/owner-decisions.md) whose ruling the specification carries, each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/owner-decisions.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="gd-1"></a>

### GD-1 — the approved visual design reference is not a gate condition, and OQ-31 is ruled without it

**Decided, two parts.** The absence of the approved visual design reference **does not block the
Architecture Gate**. It becomes a precondition for the first screen rather than for the first line of
code, and is recorded as such in `implementation-conditions.md` so that it cannot lapse by being nobody's.
And **OQ-31 is ruled now**, on its own merits, rather than waiting on the reference.

**Why the reference does not block the gate.** `open-questions.md` states the position the architects
reached without it: every slice proposal is about mechanism — where state lives, what crosses a process
boundary, what paints a row — and **no mechanism depends on the reference, while no screen can be built
without it**. *(Corrected 2026-09-03: the second clause was written as though the reference were absent.
It is present — `docs/design/`, since 2026-09-01 — so the true statement is that no screen can be built
without **a** design language, and this product has one, adopted. GD-1's ruling that the reference does
not block the gate is unaffected and was right for the reason given.)* ADR-0050's theme mechanism is the
clearest case: themes as data, corrections computed,
contrast asserted from rendered pixels, all of it independent of which values the palette holds. Holding
a gate about mechanism for material no mechanism depends on delays every unrelated decision and improves
none of them.

**OQ-30 stays open and stays the reference's.** `REQ-SHELL-129` fixes the default theme's shell metrics
and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey; the
palettes themselves are specified nowhere in `docs/spec/` and are not going to be invented here. The same
holds for the three things `open-questions.md` lists beside it — the information architecture inside each
of the seven primary views, the visual form of the benchmark card and the diagnostics view, and the glyph
vocabulary `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

**Why OQ-31 is different, and is ruled here.** The Markdown dialect is not a visual question wearing a
functional hat; it is the reverse. The supported element list fixes what the transcript renderer will
accept from model output, and one entry on that list — images — is a security boundary rather than a
matter of taste. Waiting for a palette before deciding whether model output can name a resource the
renderer then loads is the wrong dependency.

**The ruling. The dialect is GitHub Flavored Markdown, less raw HTML, less image loading.**

- **Rendered**, in addition to the five treatments `REQ-CHAT-056` already fixes (fenced code blocks, bold,
  italic, inline code spans, hyperlinks): headings, block quotes, ordered and unordered lists, task lists,
  tables, thematic breaks, and strikethrough. Bare URLs are linkified and are activatable on
  `REQ-CHAT-076`'s terms, like any other link.
- **Raw HTML in Markdown source is not rendered as markup.** It is shown as the text it is. Rendering
  agent output as HTML would make every model response an injection surface into the renderer, and the
  renderer is the process holding the user's workspace in view. Nothing about the transcript needs it.
- **No image is ever loaded from a Markdown image reference.** An image reference renders as its alt text
  carrying an activatable reference, and never as fetched or read image content. For a remote URL this is
  already required — `REQ-CHAT-056` states that rendering "MUST complete synchronously and MUST NOT issue
  any network request" — and stating it as a dialect rule rather than leaving it as a consequence keeps a
  later reader from concluding that a local path is therefore fine. It is not: a transcript that reads
  arbitrary filesystem paths named by model output is a disclosure surface, and it would also make
  rendering depend on a filesystem read, which the same clause forbids.

**What this does not touch.** Images the *user* attaches, and image bodies the product itself holds as
per-session files, are governed where they already are and are unaffected — this rules on what Markdown
*syntax* may cause to be loaded, not on what the product may display.

<a id="gd-4"></a>

### GD-4 — a restore under way is visible; a backup may be abandoned

Two questions the measurements made askable that were not askable before. Both are ruled into
`REQ-SESSION-201` as clauses rather than as new identifiers, because both are about the action that
requirement already owns.

**GD-4a — acknowledgement, not progress reporting.** The gesture is acknowledged on the shell's ordinary
terms and the user is told a restore is under way and that the store is unavailable while it runs. **No
percentage, no stage list, and no estimate.** This creates no duration budget and does not disturb the
deliberate silence on how long a restore takes; that silence is about not disturbing *runs*, and this is
about what a waiting user is shown, which is a separable question.

The measurement that made it askable: the whole restore took 2.67 s at 313 MB, and the store was
unavailable for 64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**. No requirement states a budget
for any of it — the specification was searched. **This scales, and 1.45 s is a floor rather than a
ceiling**: ESC-9 leaves retention unbounded and ESC-19's survey records a comparable product's session data
reaching 700 MB to 2 GB.

**Why not staged progress.** Reporting stages requires the swap to report from inside a sequence whose
entire value is that it is atomic and uninterruptible. That is real complexity bought for a cosmetic gain,
and worse, it creates standing pressure to make the sequence interruptible so that it has something to
report. Saying nothing at all is defensible at today's sizes and wrong at the sizes the design permits.

**GD-4b — a backup may be abandoned, and abandoning it costs nothing.** A backup in progress may be
abandoned by the user. Abandoning it discards the partial artifact, leaves the store untouched, and never
leaves a partial or unreadable file at the destination the user chose.

The measurement that made it askable: `VACUUM INTO` under concurrent commits produced 8 valid snapshots in
8, integrity-clean and monotonic, at a median **1,077 ms per 41 MB**; the whole backup action measured
145.6 ms, 425.0 ms and 4,206.1 ms at 68 KB, 11.8 MB and 313 MB. A backup of a large store is a
multi-second action that runs while runs continue, since `REQ-SESSION-201` forbids it from disturbing them.

**Why this is nearly free, and why leaving it unspecified is not.** The mechanism already has the property:
the backup writes a staging snapshot and never mutates the store, so the requirement mostly writes down
something that is already true — the cheapest kind to satisfy and the easiest to test. Against that,
leaving it unspecified is precisely the shape that produced `REQ-SESSION-043`'s defect: a requirement that
enumerates cases and leaves the residue undefined. That shape has now cost this record twice, and it was
invisible to review of the words both times.
