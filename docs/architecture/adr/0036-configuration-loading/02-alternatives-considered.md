# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Alternatives considered

Part 2 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Alternatives considered

**A — Parse to plain objects and merge with a schema library's defaults.** Attractive: validation and
typing fall out, and the codebase gets one description of the shape. It breaks on the tri-state and the
merge classes. A schema library's job is to **normalise** — apply defaults, coerce, produce a known
shape — and every one of those operations destroys the absent-versus-null distinction three requirements
require to survive the merge. Applying defaults per layer is worse than useless: it turns every unstated
field of the global layer into a stated value that then shadows the workspace layer, **inverting the
precedence for every key the user did not write**. It also cannot express the depth rules: named entries
overlay exactly one level while sections recurse to any depth, and no generic deep-merge does both.

**B — Parse to the document tree, merge over a tri-state model, validate the merged result.** Chosen.

**C — A general configuration library.** None models five fixed layers with four merge classes,
per-class null policies, per-scope pre-merge passes, or a five-way severity taxonomy. Each would be
fought rather than used, and each brings its own precedence model that would have to be disabled.

**D — Configuration in the workspace database (raised under SR-4, now refused by requirement).**
Assessed on its merits rather than dismissed by citing a ruling, because a reader who reaches this
alternative in two years will want the reasons and not the citation. Four of the five objections below
are `REQ-CONFIG-477`'s own grounds, restated as objections; the fifth is this record's.

1. **Tolerance of what this release does not know** (`REQ-CONFIG-477` ground 1). An unrecognised
   top-level key is a **warning**, contributes nothing to the merge, and is nevertheless still in the
   file afterwards, so a document authored against a later release loads, is edited, and is written
   back by an earlier one without losing the key (`REQ-CONFIG-040`, `REQ-CONFIG-233`); every writer of
   `agents.yaml` is forbidden to discard content it could not interpret (`REQ-CONFIG-442`,
   `REQ-CONFIG-458`), "and the file is what makes that possible". A document tree carries such a key
   through a targeted edit untouched. A table with a fixed column set cannot represent one at all, and
   a key-value table that could would have to re-derive the tri-state, the merge classes and the
   ordering that the tree gives for free. `requirements:` is the deliberate exception in the other
   direction — an unknown key there is a hard load failure (`REQ-CONFIG-183`) — and `REQ-CONFIG-477`
   is explicit that this is "an exception about a *configuration block*, not a licence to store
   configuration the way the product stores its own records."

   > **Correction, and it is this record's own.** The previous revision argued this objection partly by
   > analogy: it said the same tolerance "is what `REQ-CONFIG-192` asks of *delivery records*", and that
   > the configuration-side property "is no weaker". **Do not cite that.** `owner-decisions.md` ESC-14
   > records that SR-4's use of `REQ-CONFIG-192` to argue about configuration was wrong, because that
   > requirement's subject is the delivery store, which moved to rows. `REQ-CONFIG-192` now says so
   > itself: the delivery store "is not configuration and `REQ-CONFIG-477`'s boundary does not reach
   > it". The analogy was not merely imprecise, it pointed at the one neighbouring requirement whose
   > answer is the opposite. What survives of the argument is the part that never needed the analogy —
   > the carry-and-ignore policy stated of configuration, by `REQ-CONFIG-040` and `REQ-CONFIG-233`, and
   > enforced on every writer by `REQ-CONFIG-442` and `REQ-CONFIG-458`. That is strictly stronger than
   > the borrowed version, because it is stated of the thing under discussion.

2. **The product shows the user the file's own contents** (`REQ-CONFIG-477` ground 2). The advanced
   runtime card renders the chosen scope's **raw** `runtime:` mapping read directly from that scope's
   file, "exactly so a user can tell a setting stated globally from one stated in this workspace from
   one inherited from the built-in defaults" (`REQ-CONFIG-471`). The requirement's own sharpest
   sentence is the one to keep: "That distinction is a distinction between two files, and there is
   nothing raw to render when there is no file."

3. **Version control stays the user's choice** (`REQ-CONFIG-477` ground 3). These are the user's own
   text in the user's own directories — diffable, mergeable, reviewable, quotable in a bug report. The
   ignore rule of `REQ-CONFIG-013` and `REQ-CONFIG-456` is best-effort and is "a default about what is
   staged by accident, not a prohibition" (`REQ-CONFIG-010`); *deciding otherwise* is a choice a file
   leaves open, and "a store the application keeps for itself forecloses it for every user at once."
   Note what this is **not**: it is not a claim that the product commits configuration, and it is not
   in tension with the workspace being ignored by default. The ground is the availability of the
   choice, not the exercise of it.

4. **Three of the five layers are not per workspace** (`REQ-CONFIG-477` ground 4). Built-in defaults,
   the auto-discovered tool servers and the global discovery snapshot are not workspace-scoped at all,
   and the global scope is per user; the store SR-4 introduces is one per workspace and, under ESC-15,
   machine-local. A store scoped to one workspace could hold at most layer 5, so migrating
   configuration would put a single fixed total merge across two storage models with different failure
   modes — at no gain, since the workspace layer is hand-edited exactly as the global one is.

5. **There is nothing to gain, by SR-4's own test.** The principle asks for a database when the data is
   "high-volume, queried, or transactional". Configuration is none of the three: `REQ-CONFIG-014`
   forbids a read cache and requires a full re-read on every load precisely because the volume is
   negligible; there is no query beyond "read the whole thing and merge"; and the only atomicity
   anyone asks for is `REQ-CONFIG-260`'s validate-before-any-file-is-touched, which is a pre-check
   rather than a transaction. Contrast the delivery store, where `REQ-CONFIG-192` now states the
   opposite of all three in one sentence — the records "are high-volume, queried and transactional",
   and the state, the history, the prune and the audit entry are written "together, indivisibly". The
   two requirements were amended to sit beside each other, and reading them together is the fastest way
   to see that this alternative fails a test the delivery store passes.
