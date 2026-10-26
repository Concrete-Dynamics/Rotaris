# Architecture proposals — DATA slice — ADR-DATA-06 — The traceability engine is a stateless streaming library with its own parser

Part 19 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-06 — The traceability engine is a stateless streaming library with its own parser

### Decision to be made

How the requirement store is parsed, how the repository is swept, where that code runs relative to
the desktop, and what it may remember between invocations.

### Constraints that bear on it

- **G1.** `REQ-TRACE-089`: no result carried over between invocations; no stored summary consulted in
  place of reading the files; two invocations over an unchanged repository report the same thing.
- **G2.** `REQ-TRACE-501`: linear cost, ~10³ documents in about a second, and **peak memory bounded
  by the largest single document plus the accumulated metadata records** — "no phase of the parse
  SHALL require every document's text to be resident at once". `REQ-TRACE-088`: linear sweep, ~10³
  files and ~10⁴ sites in about a second under stated reference conditions.
- **G4.** `REQ-TRACE-197`: exactly one parser. `REQ-TRACE-013`: that parser depends on no third-party
  YAML, TOML or validation library, and the layout configuration is JSON for the same reason.
- **G5.** `REQ-TRACE-104` needs a *parsed* re-export-only test; `REQ-TRACE-109` needs a *syntax tree*
  for test collection; `REQ-TRACE-110` requires a syntax error to yield an empty function list rather
  than a failure; `REQ-TRACE-182` requires the test session itself to regenerate before collection.
- **G11.** `REQ-TRACE-206` and `REQ-TRACE-377`: the consuming surface calls the library directly and
  receives plain data; **no module of the desktop application may launch a checking process**, and a
  guard test asserts it.
- **G10.** `REQ-TRACE-337`: evaluation and projection never on the interface event loop.
- `REQ-TRACE-207`: a sweep performed for a consuming surface uses **the project's own layout**, never
  the toolchain's built-in defaults. `REQ-TRACE-208`: where the layout cannot be read, log a warning
  and carry on with an **empty sweep result**, showing no coverage anywhere — do not report a read
  failure to the user and do not decline to display.

### Alternative A — parse the store into a resident model and refresh it incrementally

Hold the parsed store in memory across invocations, watch the filesystem, and update the affected
entries when a document changes. This is the design most boards get, and it would make
`REQ-TRACE-173`'s N-scans cost disappear.

`REQ-TRACE-089` forbids it in the plainest language in the whole domain. And `REQ-TRACE-203` is
explicit that "Scanning is therefore not incremental by default", with incremental reading an
*optional source capability* rather than the engine's own behaviour. What survives of A is the
**within-invocation** reuse `REQ-TRACE-089`'s last sentence permits and `REQ-TRACE-202` invites —
prose reads keyed to the store's own content hash, so an unchanged document's text is not fetched
twice within one refresh.

### Alternative B — a stateless engine invoked per operation, streaming its parse

Every operation opens with a fresh parse and a fresh sweep. Within one invocation, values are shared
freely: `REQ-TRACE-091` requires one reading of the store and one reading of the repository to serve
every check in a verification run, and `REQ-TRACE-128` says "how much of the work the invocation
repeats… SHALL NOT be observable". Between invocations, nothing is retained.

### Recommendation

**Alternative B**, with five specifics.

1. **Streaming parse.** `REQ-TRACE-501`'s memory bound is a design constraint, not a performance
   note: normalise, hash and reduce each document to its metadata record before reading the next.
   That rules out the natural `readdir` → `map(readFile)` → `map(parse)` shape, which holds every
   document's text at once. It also means the content hash is computed over the normalised text as it
   streams, and the prose extraction of `REQ-TRACE-198` happens in the same pass.
2. **The frontmatter reader is hand-written and shares nothing with ADR-DATA-03's YAML library.**
   `REQ-TRACE-013` requires it, and the grammar is not YAML anyway: `REQ-TRACE-008` to
   `REQ-TRACE-011` fix a line-oriented format with continuation lines joined by a single space, a
   value that is everything after the first colon with one matching outer quote pair removed and
   **no other escape or quote processing**, and an unterminated block that yields no frontmatter and
   **no diagnostic of any kind** (`REQ-TRACE-009`). A YAML parser would reject documents this reader
   must accept and accept constructs this reader must not interpret. Two parsers in one product is
   the right answer here and it is required rather than tolerated.
3. **A syntax tree is needed, and that is a language-choice consequence.** `REQ-TRACE-104` and
   `REQ-TRACE-109` cannot be satisfied by regular expressions: one asks whether a module's *parsed*
   contents consist of nothing beyond imports, module-level assignments and documentation, and the
   other collects functions and one level of class nesting from the tree. `REQ-TRACE-110` requires a
   syntax error to produce an empty list rather than a failure, which presupposes a parser that
   reports syntax errors. So the engine ships a parser for the product's own implementation language.
   If that language is TypeScript, the realistic options are the TypeScript compiler API (correct,
   heavy, and already present if the build uses it) or a fast native parser such as `oxc` or `swc`
   (lighter, another native module — which ADR-DATA-01 has just argued against carrying). This
   belongs in the ARCH slice's language decision as an input, and I flag it rather than settle it.
   Note also that `REQ-TRACE-088`'s one-second budget covers **the sweep only** — "enumeration,
   reading and matching" — and no budget is stated for the parse-requiring orphan checks, which is
   **OQ-5**.
4. **Choosing the implementation language chooses the built-in annotation convention.**
   `REQ-TRACE-075`: "Exactly one convention SHALL be registered by default, and it SHALL claim the
   single source extension of the implementation language." `REQ-TRACE-039`'s `generated_path`
   default takes that extension, and `skip_parts` takes "the two directory names under which the
   implementation language's own toolchain places its generated caches and its installed
   dependencies". If the product is written in TypeScript, the generated symbol module is a
   TypeScript module, the built-in convention's four regular expressions are authored against
   TypeScript, and the two skip components are the TypeScript toolchain's. `REQ-TRACE-181`(1) further
   needs a symbol whose disappearance is a **build error** and whose deprecation carries "the
   language's deprecation marker" — a TypeScript `enum` with `@deprecated` JSDoc gives the first
   (a missing member fails `tsc`) and the second at editor level; making it a build-time warning
   needs a lint rule, which is a small but real obligation. `REQ-TRACE-182`'s regenerate-before-
   collection hook is a test-runner plugin and therefore an input to the test-framework choice.
   `REQ-TRACE-078` is the reason a plain-call annotation form is required regardless of what the
   language's decorators can attach to: "the toolchain's own modules cannot use decorator syntax
   before the artifact they generate exists."
5. **The board projection is one immutable value per pass.** `REQ-TRACE-348`: "A board pass SHALL be
   held in **one value** so a reader can never observe half an update, and a detail read during a
   pass SHALL describe **one generation** of the board. A finished pass SHALL retire itself and never
   the pass that replaced it." All the joining, closure and sorting that Alternative A of ADR-DATA-01
   wanted a database for happens here, over data already in memory for the pass, and is handed
   across already translated (`REQ-TRACE-378`). `REQ-TRACE-380` makes the projection-to-display
   mapping pure with every input supplied including the current time — so it reads no file, consults
   no repository, reaches no engine and requires no UI toolkit, and is therefore directly testable.

`REQ-TRACE-207`'s "the project's own layout, never the toolchain's built-in defaults" deserves a
mechanical guard: the sweep entry point should take a layout value with no default, so that omitting
it is a compile error rather than a silent fall-back to this repository's own roots. That is exactly
the failure the requirement describes — "every card in a foreign workspace would show no
implementation and no covering test".

### Consequences accepted

- `REQ-TRACE-173`'s N-scans cost stands.
- Every board refresh re-reads the store and re-sweeps the repository. `REQ-TRACE-225` accepts this
  and states the mitigations: the read runs off the interface thread, the board says a refresh is in
  progress, the last good board stays on screen, and every external call the read makes is bounded.
- A syntax-tree parser for the implementation language ships inside the product.

### What would have to change to revisit this

`REQ-TRACE-089` being relaxed to permit a cache with a stated invalidation rule; or a measured
failure to meet `REQ-TRACE-088` or `REQ-TRACE-501` on a real repository at the stated scale, which
would make the streaming design a correctness problem rather than a memory-hygiene one.

---
