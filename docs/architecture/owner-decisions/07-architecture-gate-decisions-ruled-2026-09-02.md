# Product-owner decisions on the architecture record — Architecture Gate decisions — ruled 2026-09-02

Part 7 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Architecture Gate decisions — ruled 2026-09-02

The four things the Architecture Gate verdict left with the product owner, plus the one question the
verdict's category B raised and declined to answer for itself. None of these is what makes the gate
verdict NOT READY; that is the four build-wrong defects and the four build-host obligations, and none
of them is the owner's to close.

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

### GD-2 — ESC-15's and SR-7's stated reasons are corrected in place; both rulings stand

**Decided: correct the reasoning, keep the conclusions.** Neither ruling is reopened. Both are corrected
where they are written, so that a later reader re-deriving from the stated reason reaches the stated
conclusion. The corrections are recorded in the ESC-15 and SR-7 sections above and summarised here.

**ESC-15.** The recorded reason was that write-ahead logging is unsupported on network filesystems, so the
store opens read-only, so the lock cannot be acquired, so no session starts. Spike 19 measured **both
clauses false**: WAL succeeded over a UNC path in 320 process-trials with zero errors, the pragma returned
`wal` and the prescribed read-back returned `wal`, the 32 KiB shared-memory segment was obtained over SMB,
and `db.readonly` was `false` in every network case. The ruling survives on three failures the measurement
found instead, all of them worse than the one it replaced: a store can report WAL enabled, read back as
WAL, own its shared-memory segment and still fail its next write, with that write silently absent from the
following read; and the failure is **path-spelling dependent**, so the same share behaves differently
addressed as a UNC path and as a mapped drive letter. The original claim at least fails loudly and in one
place. What the measurement disproved was an argument for the ruling that was weaker than the truth.

**SR-7.** The ruling's own evidence is untouched and stands unchanged — first paint at 13,287–19,580 ms
against a 5,000 ms budget at every bundle weight including a zero-payload build, against 664–1,561 ms for
the same payload as a directory tree. What was disproved is a subsidiary identification the ruling relies
on: the packaging tool's portable-executable environment variable was measured **null in 0 of 157**
launches through our own launcher, because the tool sets it only when the tool's own portable stub runs,
which ours is not. Our own declared variable carried the correct absolute artifact path in **149 of 149**.
The mechanism named changes; the conclusion does not.

**Why correcting matters when no conclusion moves.** A record whose conclusions are right for reasons that
are false is a record that cannot be re-derived. The next person to meet a workspace on a network share
will read ESC-15's reason, find it does not reproduce, and have to decide whether the ruling was wrong —
with no way to know that the truth is worse rather than better.

### GD-3 — the corrected restore is re-measured as a condition on its implementation, not on the gate

**Decided: not a gate condition; a condition on the first implementation of the restore, recorded in the
new `docs/architecture/implementation-conditions.md`.**

The three corrections to ADR-0058's restore are, as this is written, exactly the paper reasoning that
consequence 17 says is not evidence. They are also not on the startup path, and nothing else in the record
depends on them, so holding every unrelated decision for one mechanism's re-measurement buys nothing.

**The condition has a home, because otherwise this option is the do-nothing option.** No register of
conditions that bind at implementation time existed when this was ruled; the check was made rather than
assumed. `docs/architecture/implementation-conditions.md` is created by this ruling to hold it, and the
Architecture Gate verdict points at it. An unlanded condition is not a lighter version of a gate
condition, it is no condition at all, and this record has already lost two days to an amendment that was
ruled and never scoped.

**What the re-run must cover** is bounded to the two things the corrections changed and the measurement has
not yet seen: a run launched into the window between the refusal of new runs and the run host's
acknowledgement, confirming the second liveness evaluation refuses it and the run and its rows survive
intact; and an install rename forced to fail on an occupied name, confirming displace-then-rename leaves
the target store byte-identical.

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

### GD-5 — the Linux and macOS build-host obligations are deferred to hardware, not waived

**Decided, 2026-09-02: the obligations that need a machine this record does not have are deferred until one
is available, and they remain owed.** They are recorded as **IC-3** in `implementation-conditions.md` rather
than as gate items, on the same principle as GD-3: an obligation that cannot be discharged here does not
become smaller by being called something else, so it is written where it binds the work rather than left in
a verdict category that will be read once and closed.

**What is deferred**, and none of it can be closed by reasoning on this machine:

- **Spike 12** — the Linux artifact's runtime on a host that has never had the legacy FUSE library
  installed. It decides which of ESC-11's two applied options the release takes, and the whole point of the
  measurement is a machine that has never had the library, which this one cannot become by uninstalling it.
- **Spike 17's macOS and Linux platform keys.** `REQ-STARTUP-155` binds all four artifacts and only the two
  Windows ones were built.
- **ADR-0056's build-time load proof on all three release runners.** This one **grew** rather than merely
  waiting: it was always the only check in the record that catches an unloadable store binding, and defect
  D10 then established that the rebuild it was meant to confirm reports success while compiling nothing and
  that the loader would ignore the result anyway. It is no longer one check among several. It must be shown
  constructible on each runner, not assumed.
- **The instance claim on macOS and Linux.** SR-1 made single-instance behaviour entirely ours on three
  platforms and it has been measured on one. `REQ-STARTUP-156`'s release gate does not require launching
  the entry point twice on one user account, which is the check that would catch a failure here.

**What deferral does not mean.** It does not mean these are lower risk than the measured items — the
opposite is the record's own experience. Three mechanisms in this record went from paper to first execution
and every one held a defect no reading had caught, and **all four of these obligations are in the class of
things that have never been executed at all**. Deferring them is a decision about when a machine is
available, not a judgement that they will pass. Any implementation that reaches a Linux or macOS artifact
before IC-3 is discharged is shipping on an untested platform and the record says so here so that nobody
has to infer it.

**What it does mean for the gate.** The Architecture Gate's category C is unchanged by this ruling: these
four remain open, and this ruling relocates them rather than closing them. Whether the gate closes with
category C outstanding is a separate decision and is the owner's.

---
