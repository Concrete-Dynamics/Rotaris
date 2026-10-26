# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Context

Part 1 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Context

`REQ-TRACE-089` is the decisive constraint and its first paragraph is stated in the plainest language in
its domain: "Every operation shall report the repository as it stands at the moment that operation runs.
**No result shall be carried over from an earlier invocation and no stored summary shall be consulted in
place of reading the files**, so an edit made between two invocations shall be reflected by the second
without anything having to be cleared first, and two invocations over an unchanged repository shall
report the same thing. How often the work is repeated within one invocation shall make no difference to
what that invocation reports." `REQ-TRACE-173` accepts the consequence explicitly: "querying N
requirements one at a time costs N full scans — a documented cost". `REQ-TRACE-203` is explicit that
"scanning is therefore not incremental by default". `REQ-TRACE-090` and `REQ-TRACE-408` forbid a read
path from writing at all.

**`REQ-TRACE-089`'s second paragraph is new and it changes what this record may conclude.** It must be
read in full, because every clause of it is load-bearing:

> An **index** over the store and the repository — held wherever the application likes, including in a
> store it keeps for itself — is permitted, and exactly one distinction decides whether a given index is
> admissible. An index that is **consulted** is forbidden: if what an operation reports can depend on
> what the index last recorded, then a stale index and a current one are indistinguishable to the
> caller, and the guarantee above is gone however accurate the index usually is. An index that is
> **validated** is allowed: it is checked against the files themselves before any answer is given, and
> it is rebuilt from the files wherever that check fails or cannot be completed, so every answer still
> comes from the files and the index decides only how much work was avoided in producing it. The
> distinction is behavioural and SHALL be testable exactly as stated: with the application still open,
> change a requirement document, a baseline, the generated artifact or the retired-identifier log by any
> means at all — including means the application has no way to observe, such as a checkout of another
> revision, an edit by another program, or a restored backup — and the very next operation SHALL report
> the changed repository, with nothing to clear and no action by the user. An index that cannot meet
> that test is being consulted, whatever it is called, and SHALL NOT be used. Nothing here weakens
> `REQ-TRACE-091`'s rule that one verification run judges every check against one reading of the store
> and one reading of the repository.

`REQ-TRACE-513` is the placement requirement and did not exist when this record was written. It fixes
the four artifacts as "plain files in the user's own repository" that "SHALL NOT be moved into any store
the application keeps for itself", recorded "so that relocating them is a change someone has to argue
for rather than an optimisation that can be made while every other requirement still appears satisfied".
Its four grounds are worth having in one place because between them they answer most of what a later
reader will ask: the documents are **the user's versioned material and the product is a guest in it**
(authored by hand and by the creation surface, never by a migration — `REQ-TRACE-155`, `REQ-TRACE-442`;
baselines carrying headers written for a person — `REQ-TRACE-121`; the retired-identifier log parsed
tolerantly precisely because people edit it by hand — `REQ-TRACE-130`, `REQ-TRACE-135`);
**version-control history is load-bearing**, because the change comparison takes each requirement's
"before" from the generated artifact **as committed at the base revision** and is forbidden to
reconstruct it any other way (`REQ-TRACE-157`, `REQ-TRACE-158`); **the generated artifact is imported by
the user's own program** (`REQ-TRACE-053`), and "a record in a store cannot be imported by the
repository's code"; and **a shrink-only ratchet and an append-only log earn their value in a diff**
(`REQ-TRACE-116`, `REQ-TRACE-130`) — adding a baseline entry by hand is forbidden by a rule "enforceable
by people reading a diff and by nothing else". Two consequences the requirement attaches are this
record's: the concurrency obligation of `REQ-TRACE-502` **stays live over all four**, and "no property
of a store's concurrency control may be cited as discharging it"; and the only thing that may be held in
a store is an index, on `REQ-TRACE-089`'s terms and no others.

`REQ-TRACE-152` limits the toolchain's writes to two named actions — the regeneration of
`REQ-TRACE-509` and the baseline update of `REQ-TRACE-510` — "every other operation SHALL be read-only".
This record previously read that as "so there is nowhere an index could legally live". That reading is
now wrong and the correction is stated in alternative C: `REQ-TRACE-152`'s subject is what the toolchain
writes **in the repository**, and an index is not there.

`REQ-TRACE-501` fixes the cost of the store parse: linear in documents and bytes, roughly a thousand
requirement documents in about one second, and — the sharper half — "**peak memory shall be bounded by
the size of the largest single document plus the accumulated metadata records, never by the total prose
of the store: a document shall be normalised, hashed and reduced to its metadata record before the next
document is read, and no phase of the parse shall require every document's text to be resident at
once.**" `REQ-TRACE-088` fixes the sweep: linear, roughly a thousand source files carrying ten thousand
annotation sites in about a second, on one execution thread, timing enumeration, reading and matching
and excluding process start-up and the store parse — "the linear-growth clause is the binding one".

`REQ-TRACE-197`: there shall be **exactly one parser**; "any additional frontmatter reader would amount
to a rival definition of the repository's requirement set". `REQ-TRACE-013`: that parser shall be
self-contained and **depend on no third-party YAML, TOML or validation library**, so that it can run
wherever the engine is embedded — and for the same reason the layout configuration format shall be
JSON. `REQ-TRACE-008` to `REQ-TRACE-011` fix a frontmatter grammar that **is not YAML**: the first line
must strip to exactly three dashes; a field line opens with a letter, continues with letters, digits,
underscores or hyphens, then a colon; any other line is appended to the field most recently opened with
one space between; the value is everything after the first colon, stripped, with one matching outer
quote pair removed and **no other escape or quote processing**; an unterminated block means the document
has no frontmatter and produces **no diagnostic of any kind**. A key outside the model's own set is
**carried through untouched and otherwise ignored**, and survives a write (`REQ-TRACE-204`).

`REQ-TRACE-104` requires a **parsed** test for a re-export-only module: its parsed contents must consist
of nothing beyond import statements, module-level assignments naming exported symbols, and documentation
or bare string-literal statements; any function declaration, any class declaration, any conditional and
any other executable statement disqualifies it; and a module whose text cannot be parsed is not excused
by the rule. `REQ-TRACE-109` requires a **syntax tree** for test collection. `REQ-TRACE-110` requires a
syntax error to yield an empty function list rather than a failure. `REQ-TRACE-182` requires the **test
session itself** to regenerate the artifact before collecting tests, reporting through the test run's
own diagnostics and **never blocking collection: any failure shall be caught and reported as a
skipped-regeneration notice**.

`REQ-TRACE-079`: discovery is a **static text scan** — not an import and not runtime introspection.
`REQ-TRACE-077`: an annotation whose argument list itself contains a call is **not** recognised and no
diagnostic is produced. `REQ-TRACE-078`: plain call sites must be recognised as well as
decorator-position uses, "required for bootstrap: the toolchain's own modules cannot use decorator
syntax before the artifact they generate exists". `REQ-TRACE-084` and `REQ-TRACE-087` fix reporting to
the line the identifier actually occupies with an exact character span, and require offset-to-line
mapping verified exhaustively over an empty text, a text of only newlines, a text with no trailing
newline and a text with carriage-return line endings.

`REQ-TRACE-073` makes project-declared conventions a **regex-driven language seam**: six keys per entry,
patterns evaluated against the file's normalised text, a non-compiling pattern being a configuration
error naming the convention, the key and the compilation failure. `REQ-TRACE-074`: registration is a
single ordered sequence with the built-in convention at position one, and a later registration claiming
an already-claimed extension is accepted without diagnostic and simply never consulted.

`REQ-TRACE-091`: a verification run judges every check against **one reading** of the store and one of
the repository, with findings grouped by check in a fixed enumerated order, "so two implementations
cannot interleave the checks differently and both be conformant". `REQ-TRACE-092`: any parse error
short-circuits, returning only the parse errors. `REQ-TRACE-100`: every diagnostic carries a
machine-parseable prefix which "is a de facto public contract".

`REQ-TRACE-206` and `REQ-TRACE-377`: a consuming surface acquires coverage by **calling the library
directly** and receiving plain data; **no consuming surface may launch the checking engine as a
process**, parse rendered output in place of the data, or re-compute evidence health, requirement health
or epic progress — and **a guard test shall assert it**. `REQ-TRACE-378`: a board surface takes every
engine-derived value already translated, through the bridge and from no other route. `REQ-TRACE-337`:
evaluation and projection work shall **never** run on the interface event loop.

`REQ-TRACE-207` and `REQ-TRACE-208`: a sweep performed for a consuming surface uses **the project's own
layout**, never the toolchain's built-in defaults; where the layout cannot be read, log a warning and
carry on with an **empty sweep result**, showing no coverage anywhere.

`REQ-TRACE-154` and `REQ-TRACE-225` state that the absence of any time, document or resource limit on
the scan is **a deliberate decision and not a gap**, with every external call it makes bounded
separately (`REQ-TRACE-170`, `REQ-TRACE-201`: 30 s per version-control call, and "no operation shall be
able to block indefinitely on a child process").

**There is no command line, and this is now load-bearing.** `REQ-TRACE-142`, `REQ-TRACE-144` to
`REQ-TRACE-151`, `REQ-TRACE-153`, `REQ-TRACE-184`, `REQ-TRACE-185` and `REQ-TRACE-186` are all
withdrawn on the grounds that the product has no command-line surface. The operations that remain are
`REQ-TRACE-508` (check), `REQ-TRACE-509` (regeneration), `REQ-TRACE-510` (baseline update) and
`REQ-TRACE-511` (change comparison), each of which the **desktop application** offers. The only
invocation of the toolchain outside the application is `REQ-TRACE-182`'s test-session regeneration and
`REQ-TRACE-183`'s meta-tests, both of which run inside the *project's own* test session.

`REQ-TRACE-502` is the coordination rule, and it must be read whole, because its middle sentence
defines what its last sentence means:

> Concurrent invocations SHALL be safe without any lock, lease or coordination file. Every artifact the
> toolchain writes — the generated artifact, the three baselines and the retired-identifier log — SHALL
> be written by the atomic replace of `REQ-TRACE-061`, `REQ-TRACE-126` and `REQ-TRACE-137`, so a reader
> concurrent with a writer SHALL observe one complete version of a file and never a partial one, and two
> concurrent writers SHALL leave one complete file rather than a blend of both. Beyond that, **no
> invocation SHALL wait for another**: where two invocations race, each SHALL report the repository as
> it read it, so a check running beside a regeneration MAY legitimately report the artifact stale even
> though the other invocation is in the act of refreshing it, and re-running the check afterwards SHALL
> report it up to date. An invocation SHALL NEVER fail, hang or leave a lock behind because another was
> running.

Two things in that text decide the analysis below. First, it **names the four artifacts and requires
them to be written by atomic replace of a file**, so the requirement is about files by construction and
is not reachable by relocating a store. Second, its own gloss on "no invocation shall wait for another"
is about **views**, not about I/O scheduling: two racing invocations must each report what they read,
and one must not be made to observe the other's result. `REQ-TRACE-061` fixes the write's failure
behaviour in the opposite direction from a retry: on any failure the temporary file is removed
best-effort and **the failure is re-raised**. No retry ladder is stated for this store anywhere.
