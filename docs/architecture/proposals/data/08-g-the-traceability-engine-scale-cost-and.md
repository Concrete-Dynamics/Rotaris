# Architecture proposals — DATA slice — G. The traceability engine: scale, cost and statelessness

Part 8 of 25 of [the data proposal](../data.md), which indexes every part.

## G. The traceability engine: scale, cost and statelessness

**G1 — No result is ever carried over between invocations. (hard — this is the decisive constraint
against a persistent index)**
`REQ-TRACE-089`: "Every operation SHALL report the repository as it stands at the moment that
operation runs. **No result SHALL be carried over from an earlier invocation and no stored summary
SHALL be consulted in place of reading the files**, so an edit made between two invocations SHALL be
reflected by the second without anything having to be cleared first, and two invocations over an
unchanged repository SHALL report the same thing. How often the work is repeated within one
invocation SHALL make no difference to what that invocation reports."
`REQ-TRACE-173` accepts the consequence explicitly: "The sweep itself SHALL NOT be reused across
single-requirement calls, so querying N requirements one at a time costs N full scans — a documented
cost."
`REQ-TRACE-152`: the toolchain writes only under regeneration and baseline update. There is no third
thing it may write, so there is nowhere to put an index.

**G2 — Cost budgets, with stated reference conditions. (hard)**
`REQ-TRACE-501` (store parse): linear in documents and bytes; **~10³ requirement documents parsed in
about one second**; and — the sharper half — "**Peak memory SHALL be bounded by the size of the
largest single document plus the accumulated metadata records, never by the total prose of the
store: a document SHALL be normalized, hashed and reduced to its metadata record before the next
document is read, and no phase of the parse SHALL require every document's text to be resident at
once.**"
`REQ-TRACE-088` (sweep): linear; **~10³ source files carrying ~10⁴ annotation sites swept in about
one second**, measured on one execution thread on a contemporary developer workstation with an SSD
and a warm cache, timing enumeration + reading + matching, excluding process start-up and the store
parse. "The linear-growth clause is the binding one."
`REQ-TRACE-239`: putting a board on screen once the engine has answered occupies the interface
thread for **no more than 100 ms** at the minimum window size, and **that figure does not grow with
the size of the store**.
`REQ-TRACE-367`: the post-debounce filter recomputation likewise ≤ **100 ms**; one keystroke costs
no board work beyond restarting the debounce timer and painting the character.
`REQ-TRACE-363`: search debounce **150 ms**. `REQ-TRACE-350`: evaluation retry **150 ms** while a
read is in flight. `REQ-TRACE-351`: progress throttled only above **20 items** in a phase, minimum
publication interval **0.1 s**, with a phase change and a phase's final item always published.
`REQ-TRACE-352`: elapsed reading redrawn every **1000 ms** from a timestamp the pass set once.
`REQ-TRACE-300`: **100** populated columns supported on an open axis.

**G3 — Board virtualisation is mandatory and its shape is fixed. (hard)**
`REQ-TRACE-358` (widgets only for cards on screen plus overscan; scrolling reuses widgets),
`REQ-TRACE-359` (a widget is repainted where it stands through the identical update path live
refresh uses, never torn down), `REQ-TRACE-360` (margin **5** cards above and **5** below; released
widget pool capped at **20** per column; after widening and re-narrowing a filter the board holds no
more card widgets than before), `REQ-TRACE-361` (height estimate until at least one card has
genuinely completed layout), `REQ-TRACE-362` (a filter change recomputes membership and repaints
bands; nothing torn down; selection, scroll offsets and open panes carried through),
`REQ-TRACE-364` (an explicit "realise this named card" operation that scrolls to it and does **not**
realise everything on the way), `REQ-TRACE-365` (acceptance: a 300-card column in a ~1000 × 640
viewport realises fewer than a quarter of its members, that count does not grow with column length,
realised cards form one contiguous band from the top, and a reused widget never goes on showing the
card it previously held), `REQ-TRACE-366` (a readiness flag and pending count as observable state).
`REQ-TRACE-367` forbids the obvious cheat: "Spreading the construction of every card across
successive turns of the event loop SHALL NOT be accepted as satisfying this, since it leaves the
total work unchanged."

**G4 — There is exactly one requirement parser, and it may use no third-party YAML, TOML or
validation library. (hard — and it forces two parsers in one product)**
`REQ-TRACE-197`: "There SHALL be exactly **one parser**… Any additional frontmatter reader would
amount to a rival definition of the repository's requirement set." An adapter reading the store as a
source adds no second parse.
`REQ-TRACE-013`: "The parser SHALL be self-contained and depend on no third-party YAML, TOML or
validation library, so that it can run wherever the engine is embedded, without an activated project
environment. For the same reason the layout configuration format SHALL be JSON."
The frontmatter grammar is fixed and is **not** YAML (`REQ-TRACE-008` to `REQ-TRACE-011`): the first
line must strip to exactly `---`; a field line opens with a letter, continues with letters, digits,
underscores or hyphens, then a colon; any other line is appended to the field most recently opened
with one space between; the value is everything after the first colon, stripped, with one matching
outer quote pair removed and **no other escape or quote processing**. An unterminated block means
the document has no frontmatter and produces **no diagnostic of any kind** (`REQ-TRACE-009`).
So the product parses YAML for `agents.yaml` with a library, and parses requirement frontmatter with
a hand-written reader that is forbidden from using one.

**G5 — The generated symbol artifact is a source module in the product's own implementation
language, and that has consequences for the language choice. (hard)**
`REQ-TRACE-075`: "**Exactly one convention SHALL be registered by default, and it SHALL claim the
single source extension of the implementation language.**" `REQ-TRACE-039`: `generated_path`
defaults to `src/requirement_ids` **with the source extension claimed by the built-in annotation
convention appended**; `skip_parts` defaults include "the two directory names under which the
implementation language's own toolchain places its generated caches and its installed dependencies".
`REQ-TRACE-053`: loading the module makes available one integer-valued symbol per requirement named
after its identifier, a constant naming every deprecated requirement, and a lookup from number to
metadata record.
`REQ-TRACE-181`(1): "in the editor and at compile time, free of charge, through the generated
symbols — a deleted requirement's symbol vanishes and every reference becomes a build error, and a
deprecated requirement's symbol carries **the language's deprecation marker** so every reference
warns at the exact spot."
`REQ-TRACE-104` requires a **parsed** test for a re-export-only module: "its parsed contents consist
of nothing beyond import statements, module-level assignments naming exported symbols, and
documentation or bare string-literal statements. Any function declaration, any class declaration,
any conditional and any other executable statement SHALL disqualify it. A module whose text cannot
be parsed SHALL NOT be excused by this rule."
`REQ-TRACE-109` requires a **syntax tree** for test collection: module-level functions and async
functions whose name begins with `test`, plus one level of class nesting deeper, module-level
classes and their `test`-prefixed methods. Nothing deeper.
`REQ-TRACE-182` requires the **test session itself** to regenerate the artifact before collecting
tests, reporting through the test run's own diagnostic reporting and never blocking collection.
Taken together: the implementation language must have an integer enumeration with per-member
documentation, a deprecation marker the editor honours, a parseable syntax tree available to the
product at runtime, and a test runner with a before-collection hook. This is a real constraint on
the language decision and it belongs to the ARCH slice as well as to mine.

**G6 — Annotation recognition is a static text scan with fixed limitations. (hard)**
`REQ-TRACE-079`: "Discovery SHALL be a static text scan — not an import and not runtime
introspection. A reference in unreachable code, or inside a string literal, SHALL still count if it
matches."
`REQ-TRACE-077`: an annotation whose argument list itself contains a call is **not** recognised, and
no diagnostic is produced; implementers must treat this as a known limitation.
`REQ-TRACE-078`: plain call sites must be recognised as well as decorator-position uses, "required
for bootstrap: the toolchain's own modules cannot use decorator syntax before the artifact they
generate exists."
`REQ-TRACE-084`: every identifier written inside an annotation is reported with the line it actually
occupies — not the line the call opens on — and with its own character span from the start of the
file; taking the text at that span yields exactly that identifier and no surrounding characters.
`REQ-TRACE-087`: offset-to-line mapping is exact at every boundary, 1-based, and verified
exhaustively over an empty text, a text of only newlines, a text with no trailing newline, and a
text with CRLF endings.

**G7 — Project-declared annotation conventions are a regex-driven language seam. (hard)**
`REQ-TRACE-073`: six keys per entry (`name`, `extensions`, `reference_pattern`,
`annotation_pattern`, `test_pattern`, `exempt_module_pattern`), patterns evaluated against the
file's normalised text, a non-compiling pattern being a configuration error naming the convention,
the key and the compilation failure. A pattern-declared convention has no syntax tree, so a test
function it collects takes the matched line as its whole span, extended by the same two-line slack,
and its node identifier carries no class segment.
`REQ-TRACE-074`: registration is a single ordered sequence with the built-in convention at position
one; a later registration claiming an already-claimed extension is accepted without diagnostic and
simply never consulted for that extension.
This means user-supplied regular expressions are compiled and run over repository files. Catastrophic
backtracking is a denial-of-service vector the specification does not address — see **OQ-6**.

**G8 — Ratchets shrink only; the tombstone log grows only. (hard)**
`REQ-TRACE-116`: all three baselines may lose entries and **never** gain them; new debt is always an
error; adding an entry by hand to silence a violation is documented as forbidden.
`REQ-TRACE-124`: the debt ratchet is a **per-identifier intersection** — for each recorded number,
keep only flags both recorded and currently unmet, drop numbers whose intersection is empty.
`REQ-TRACE-125`: the two orphan ratchets are a plain set intersection. Both bootstrap by recording
current state once when the file is absent.
`REQ-TRACE-128`: an update run twice over an unchanged repository leaves all three files
byte-identical, and "how much of the work the invocation repeats in order to achieve this SHALL NOT
be observable".
`REQ-TRACE-130`, `REQ-TRACE-136`: the retired-identifier log is only ever appended to and never
loses entries; where a record already exists for an identifier it is kept and the incoming one
discarded, "so a retirement date once written never moves".
`REQ-TRACE-135`: tombstone parsing is deliberately tolerant — a malformed line is skipped and is
never fatal.
`REQ-TRACE-140`: the retirement date comes from an **injectable clock** defaulting to today's UTC
calendar date. That is a testability requirement with an architectural consequence: the clock is a
dependency, not a global.

**G9 — A verification run judges every check against one reading, and the finding order is fixed.
(hard)**
`REQ-TRACE-091`: one reading of the store and one reading of the repository, so no two findings can
describe different states of the same file; findings grouped by check in a fixed enumerated order,
each check's findings contiguous and internally ordered as that check specifies; the error list and
the warning list each follow the same grouping, "so two implementations cannot interleave the checks
differently and both be conformant."
`REQ-TRACE-092`: any parse error short-circuits — verification returns immediately carrying **only**
the parse errors.
`REQ-TRACE-100`: every diagnostic carries the machine-parseable prefix `<path>.md (<identifier>):
<message>`, identifier optional. "This prefix format is a de facto public contract."

**G10 — Everything expensive runs off the interface thread. (hard)**
`REQ-TRACE-337` ("Evaluation and projection work SHALL NEVER run on the interface event loop"),
`REQ-TRACE-229`, `REQ-TRACE-512`, `REQ-TRACE-410`, `REQ-TRACE-425`, `REQ-GIT-091`, `REQ-GIT-102`,
`REQ-LIBRARY-122`, `REQ-CONFIG-374`. `REQ-TRACE-497` lists "evaluation or projection work blocking
the interface event loop" among the things that must never be observable.
`REQ-TRACE-214`: progress callbacks happen **on the thread running the pass**; a host that must
touch a user interface marshals for itself. `REQ-TRACE-355`: progress raised away from the interface
reaches it only once handed to the interface's own thread.

**G11 — The desktop must not shell out to the checking engine. (hard)**
`REQ-TRACE-206`: "A consuming surface SHALL acquire coverage by **calling the library directly** and
receiving plain data back. No consuming surface SHALL launch the checking engine as a process, and
none SHALL interpret rendered output in place of the data. On this path there is consequently no
child process, no exit status to inspect and no text to parse."
`REQ-TRACE-377`: "**No module of the desktop application SHALL** launch a requirement-checking or
verifier process, parse rendered output in place of the data, or re-compute evidence health,
requirement health or epic progress. **A guard test SHALL assert** that no desktop module spawns
such a process."
`REQ-TRACE-378`: a board surface takes every engine-derived value already translated, through the
bridge and from no other route, and does not load the requirement engine while running.
So the engine is an in-process library on the runtime side, reached from the renderer only through a
translation bridge — and there is a test that enforces it.

**G12 — Nothing here has a wall-clock bound, deliberately. (hard, and worth stating)**
`REQ-TRACE-154`: no progress reporting and no cancellation at the toolchain layer; no interrupt
handling, no progress callback, no partial-result reporting. "The absence of any time limit,
document limit or resource limit on the file-system scan SHALL be a **deliberate decision and not a
gap**." The one cost the layer does not control is a child process, bounded by `REQ-TRACE-170`.
`REQ-TRACE-225`: neither refresh kind places a wall-clock bound on the engine read, and that too is
deliberate — the read runs off the interface thread, the board says a refresh is in progress, the
last good board stays on screen, and every external call the read makes is itself bounded.
`REQ-TRACE-178`/`REQ-TRACE-179`: the store probe applies neither a document cap nor a time limit,
and stops at the first document that declares a requirement identifier.
