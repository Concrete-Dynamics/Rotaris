# Requirements Board and Traceability — Verification Pass

Part 3 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-090 – REQ-TRACE-141.

### Verification Pass

- **REQ-TRACE-090** — Verification SHALL be pure: it returns lists of errors and warnings, logs nothing itself, and writes nothing. Plain checking SHALL NEVER write; only the explicit regeneration and baseline-update actions of REQ-TRACE-509 and REQ-TRACE-510 write. The single exception is the maintenance of the index REQ-TRACE-089 permits, on that requirement's terms and on no others, and it is stated there rather than restated here. That exception does not weaken this guarantee, because REQ-TRACE-089 requires index maintenance to be observably inert: a verification pass leaves the repository, the delivery store and every other record a user or another tool can read exactly as it found them, and returns the same lists whether an index was built, validated, rebuilt, discarded, or never existed at all. Every write this requirement forbids it still forbids.

- **REQ-TRACE-091** — One verification run SHALL judge every check against one reading of the store and one reading of the repository, so that no two of its findings can describe different states of the same file. A single run SHALL be able to report, together: a stale or missing generated artifact; malformed baseline lines; derived-from integrity failures; references to requirements that no longer exist; deprecated references; missing implementation traces and missing coverage, after baseline suppression; stale baseline entries; unresolved legacy comment references; orphan modules; orphan tests; and the statistics of REQ-TRACE-101. Apart from the short-circuit of REQ-TRACE-092, no check SHALL suppress, delay or alter another, and each SHALL report what it finds whether or not the others found anything. Findings SHALL appear in the returned lists **grouped by check and in the order the checks are listed above** — the generated artifact, malformed baseline lines, derived-from integrity, references to requirements that no longer exist, deprecated references, missing implementation traces, missing coverage, stale baseline entries, unresolved legacy comment references, orphan modules, orphan tests — with each check's own findings contiguous and internally ordered as that check itself specifies. The error list and the warning list SHALL each follow that same grouping, so two implementations cannot interleave the checks differently and both be conformant.

- **REQ-TRACE-092** — Given any parse error, verification SHALL return immediately carrying **only** the parse errors: every other diagnostic for that run is suppressed, because everything downstream depends on a clean parse. Fixing one malformed document MAY therefore reveal a large second wave of violations.

- **REQ-TRACE-093** — A generated artifact that is stale, or that is not there at all, SHALL be reported as an **error** and never as a warning. The message SHALL name the artifact's path and the regeneration action of REQ-TRACE-509 that brings it back up to date.

- **REQ-TRACE-094** — A reference to a number for which no requirement exists SHALL be an error, emitted once per occurrence, iterated over sorted numbers, naming the file and line, the referenced symbol, and instructing the author either to remove the reference or restore the requirement document. This is the mechanism by which deleting a requirement propagates into the code; at run time the same deletion also surfaces as a missing-attribute failure at every use site.

- **REQ-TRACE-095** — A deprecated requirement that is still referenced SHALL produce a **warning**, checked before the approved filter so that it applies at any lifecycle. The warning SHALL name the identifier, the title, the referencing sites as `file:line`, and the source path, and SHALL cap the site list at **5** entries with a `(+<n> more)` tail beyond that.

- **REQ-TRACE-096** — Only `approved` requirements SHALL carry trace and coverage obligations; `draft` and `deprecated` requirements SHALL be skipped entirely for those two checks.

- **REQ-TRACE-097** — A missing implementation trace SHALL be an error naming the identifier, the title, the source path, that the requirement is approved with trace required, that no implementation reference exists, and the exact annotation to add to the implementing element including the import needed. A missing coverage reference SHALL be an error in the same shape, naming the coverage annotation and its import.

- **REQ-TRACE-098** — Derived-from integrity SHALL enforce five rules; the first four are errors and the fifth a warning. Every message SHALL name the identifier, the title and the document path:
  - `type: technical` with no `derived-from` — tell the author to supply an origin identifying which requirement's implementation created the need for this additional code;
  - `derived-from` on a non-technical requirement — instruct the author to set the technical type or remove the link;
  - a requirement listing itself as its own origin — this case SHALL short-circuit, so the existence check is not additionally run for that origin;
  - an origin naming a requirement that does not exist;
  - an origin that is deprecated — a **warning** instructing the author to re-point at the superseding requirement.

- **REQ-TRACE-099** — Every error and every warning SHALL be actionable. Where it concerns a requirement it SHALL name that requirement's identifier, its title and the document declaring it; and in every case it SHALL name the concrete step that resolves it — the annotation to add together with the import it needs, the reference to remove, the baseline entry to prune, or the action to take.

- **REQ-TRACE-100** — Every diagnostic SHALL carry a machine-parseable location prefix of the form `<path>.md (<identifier>): <message>`, with the identifier part optional, so a consumer can recover a located, attributable issue. A message that does not match SHALL be retained with no location. This prefix format is a de facto public contract: changing it silently degrades issue attribution in consuming surfaces.

- **REQ-TRACE-101** — Verification statistics SHALL report: total requirements, approved count, traced count, test-covered count, and the four counts of baseline-suppressed items (trace debt, test debt, orphan modules, orphan tests).

### Orphan Code (Reverse Check: Code to Requirement)

- **REQ-TRACE-102** — Every production module beneath an implementation root SHALL hold at least one implementation trace; a module holding none SHALL raise an orphan-code **error**. Where removing a requirement strips a module of its last trace, that module SHALL therefore appear as an orphan, which is how a deletion propagates into the code.

- **REQ-TRACE-103** — Orphan detection SHALL be per **file**, not per symbol: a module carrying a single trace anywhere in it is not an orphan, however many untraced functions it contains.

- **REQ-TRACE-104** — A module SHALL be excused from the orphan-module check by the first of these that holds: (1) the convention's own module-excuse rule, which for the default convention excuses a module existing only to re-export names declared elsewhere; (2) the sweep already found a trace in that file; (3) the configured exempt marker appears anywhere in the file's text. The generated artifact never reaches this check, having been left out when files were enumerated. A module SHALL count as re-export-only when its parsed contents consist of nothing beyond import statements, module-level assignments naming exported symbols, and documentation or bare string-literal statements. Any function declaration, any class declaration, any conditional and any other executable statement SHALL disqualify it. A module whose text cannot be parsed SHALL NOT be excused by this rule, a rule that cannot read a file being in no position to vouch for it. For a project-declared convention the corresponding test SHALL be that convention's own `exempt_module_pattern` (REQ-TRACE-073).

- **REQ-TRACE-105** — The exempt-marker test for a module SHALL be a plain substring search over the whole file text — not a regular expression and not line-anchored. A marker inside a docstring or a string literal therefore also exempts the module.

- **REQ-TRACE-106** — The orphan-code error SHALL name the file, state that it has no trace, and offer all three remedies: trace it to the requirement it serves with the named annotation; author a technical requirement with an origin if none fits; or mark it with the configured exempt marker (quoted verbatim) if it is intentionally trace-free. Results SHALL be returned sorted.

- **REQ-TRACE-107** — An orphan-baseline entry that is now traced, exempt or removed SHALL produce a **warning** naming the entry, the baseline path and the pruning action of REQ-TRACE-510, emitted for the sorted difference between the baseline and the current orphan set.

### Orphan Tests (Reverse Check: Test to Requirement)

- **REQ-TRACE-108** — A collected test function beneath a test root SHALL be reported as an orphan-test **error** unless it carries a coverage annotation or a transitional coverage comment. Three exemptions SHALL apply: the function lies beneath an excused test root; the exempt marker appears within its window; or the function is already listed in the orphan-test baseline. Since that baseline may only lose entries, a test added after the baseline was taken SHALL always owe an annotation.

- **REQ-TRACE-109** — Test functions SHALL be collected from a file's syntax tree as follows: every function and every asynchronous function declared at module level whose name begins with `test`, and, one level of class nesting deeper, every class declared at module level together with those of its own methods whose names begin with `test`. Nothing deeper SHALL be collected: a class nested inside a class, and a function defined inside a test body, SHALL both be treated as helpers.

- **REQ-TRACE-110** — A syntax error while parsing a test file SHALL yield an empty function list: the file contributes no orphans rather than failing the run.

- **REQ-TRACE-111** — Test identifiers SHALL follow the node-identifier convention `<repository-relative path>::<function>` at module level and `<repository-relative path>::<class>::<function>` when nested, so that two methods sharing a name but belonging to different classes remain distinguishable. Given two classes each declaring a method of the same name, one annotated and the other not, exactly one orphan error SHALL be raised, and it SHALL identify the unannotated method.

- **REQ-TRACE-112** — A test function's line span SHALL start at the **minimum** of its definition line and all of its decorator lines, and end at its syntactic end line. The window in which an annotation or marker satisfies it SHALL extend **two lines above** that start, so a comment or exempt marker placed just above a decorator stack still counts.

- **REQ-TRACE-113** — A test function SHALL be satisfied by either: any recorded coverage occurrence in the same file whose line falls in the window; or any occurrence of the exempt marker in the same file whose line falls in the window. For tests the exempt marker therefore operates at **function** granularity, unlike modules where it is file-wide.

- **REQ-TRACE-114** — A test file with **zero** collected test functions SHALL be skipped entirely, so shared fixtures and helper modules under a test root never produce orphans.

- **REQ-TRACE-115** — The orphan-test error SHALL name the node identifier, state that no coverage annotation or comment reference is present, and offer the same three remedies. A stale orphan-test baseline entry SHALL produce the corresponding pruning **warning**.

### Debt Baselines (Shrink-Only Ratchets)

- **REQ-TRACE-116** — Three baselines SHALL exist — trace/test debt, orphan modules, orphan tests — and all three SHALL be **shrink-only**: they may lose entries and SHALL NEVER gain them. New debt of any kind SHALL always be an error; only pre-existing debt is grandfathered. Adding a baseline entry by hand to silence a violation SHALL be documented as forbidden.

- **REQ-TRACE-117** — All three baselines SHALL share parsing conventions: read UTF-8, split into lines, strip each line, skip blank lines and lines beginning with `#`, and report a malformed line as an error carrying `<baseline path>:<line number>: ` with **1-based** numbering counted over the raw file, comment lines included. A missing baseline file SHALL NOT be an error; it yields no entries.

- **REQ-TRACE-118** — A trace/test debt entry SHALL be an identifier followed by one or two whitespace-separated flags drawn from `{trace, test}`; the flag set SHALL be non-empty and a subset of that pair. A malformed line SHALL name the rejected text and the expected shape. Repeated identifiers SHALL merge by set union. Rendering SHALL emit a header block followed by one line per number in **ascending numeric** order with the flags sorted and space-joined.

- **REQ-TRACE-119** — An orphan-module entry SHALL be one repository-relative source path per line; validation SHALL be deliberately loose — the line's basename must contain a dot and the line must contain no space. Rendering SHALL be sorted lexicographically under a header whose text embeds the configured exempt marker.

- **REQ-TRACE-120** — An orphan-test entry SHALL match a path with an extension, zero or more `::`-separated class segments, and a final `::`-prefixed test-function segment. A malformed line SHALL name the rejected text and the expected shape. Rendering SHALL be sorted.

- **REQ-TRACE-121** — Every baseline header SHALL state, in the file itself, that the file may only shrink, how the debt is paid off, the exact pruning action, and that entries must never be added for new work.

- **REQ-TRACE-122** — Baseline suppression SHALL be **per flag**, not per requirement: a baseline listing only the trace flag SHALL still let the coverage error through. Every suppressed item SHALL be counted in the statistics.

- **REQ-TRACE-123** — The baseline-update action SHALL rewrite all three baselines in one invocation, in this order: trace/test debt, then orphan modules, then orphan tests. Each SHALL be reported by a notice naming the file written and the resulting entry count.

- **REQ-TRACE-124** — The debt ratchet SHALL be a **per-identifier intersection**: for each number recorded in the existing baseline, keep only the flags that are both recorded and currently unmet; drop numbers whose intersection is empty. Entries can therefore only ever be removed by this action. Given the baseline file does not exist, the action SHALL bootstrap by recording all current debt once.

- **REQ-TRACE-125** — The two orphan ratchets SHALL be a plain **set intersection** of recorded and current entries, with the same bootstrap rule when the file is absent.

- **REQ-TRACE-126** — Every baseline write SHALL create the parent directory when missing, SHALL write UTF-8 with LF endings forced on every platform, and SHALL be **atomic** in the manner of REQ-TRACE-061 — a temporary file in the target's own parent directory, then an atomic replace — so that a reader concurrent with a write observes either the whole previous file or the whole new one and never a partial one.

- **REQ-TRACE-127** — Given a baseline entry whose number no longer names an **approved** requirement — whether deleted, or moved back to draft or deprecated — the check SHALL emit a **warning** naming the entry, the baseline path and the pruning action. Given an entry whose flags are now satisfied — because the obligation was relaxed to optional or because the annotation now exists — the check SHALL emit a **warning** naming the satisfied flags sorted and space-joined. Both SHALL be warnings only: a stale baseline SHALL NEVER fail the build.

- **REQ-TRACE-128** — Every baseline a single update invocation writes SHALL describe the repository as it stands at that invocation, and the three SHALL be consistent with one another and with the verification performed in the same invocation. An update run a second time over an unchanged repository SHALL leave all three files byte-identical. How much of the work the invocation repeats in order to achieve this SHALL NOT be observable in what it writes or reports.

- **REQ-TRACE-129** — End-to-end ratchet behavior SHALL be: bootstrap records the current debt; after the trace debt is paid and a *new* unannotated requirement is added, a second update prunes the paid flag and does **not** add the new requirement, which remains an error. The same SHALL hold for both orphan baselines.

### Retired Identifiers (Tombstones)

- **REQ-TRACE-130** — The retired-identifier log SHALL only ever be **appended to** and SHALL NEVER lose entries: once an identifier is retired it remains retired permanently. Its header SHALL make three statements — that these entries are the sole surviving evidence that a since-deleted identifier was ever issued; that any attempt to claim a retired identifier again is rejected; and that identifiers are never handed out a second time.

- **REQ-TRACE-131** — A record SHALL be tab-separated: identifier, retirement date in ISO 8601 calendar form, and the last known title.

- **REQ-TRACE-132** — Deletion SHALL be observed only during **regeneration**, by comparing the generated artifact about to be replaced — the record of what existed last time — against the current store. An identifier the artifact carried that the store no longer declares SHALL be recorded as retired. There is no other moment at which the toolchain can observe a deletion.

- **REQ-TRACE-133** — The tombstone SHALL be written **before** the new generated artifact, so that a crash between the two leaves the identifier recorded rather than forgotten.

- **REQ-TRACE-134** — Reuse rejection SHALL be enforced inside the store parse itself, not in one entry point, so that every operation — checking, generating, comparing changes and verifying — refuses a reused identifier. The error SHALL name the source path, the identifier, the retirement date, the old title where one was recorded, and SHALL instruct the author to claim the next free identifier. Given no tombstones exist at all, the check SHALL return immediately.

- **REQ-TRACE-135** — Tombstone parsing SHALL be deliberately tolerant: a malformed line SHALL be skipped and SHALL NEVER be fatal. The log exists solely to stop identifiers being claimed twice, and dropping a single record after a clumsy manual edit costs the project far less than rendering the whole repository uncheckable. Per line: strip; skip blanks and comments; split on tab; require at least two fields; require the first field to begin case-insensitively with the identifier prefix; require the remainder after the prefix to be all digits. The title is the third field when present, else empty. A later duplicate line for the same number SHALL overwrite an earlier one in the parse result.

- **REQ-TRACE-136** — Where a record already exists for an identifier, that record SHALL be kept and the incoming one discarded, so a retirement date once written never moves. A later run, whatever its clock reads, SHALL leave every recorded date as it stands and SHALL add only identifiers retired since, dated by that run.

- **REQ-TRACE-137** — Rendering SHALL emit the header block, then one record per identifier in **ascending number** order, each terminated by a newline, written UTF-8 with LF endings forced, creating the parent directory when missing. The write SHALL be **atomic** in the manner of REQ-TRACE-061, because the log is append-only evidence that cannot be reconstructed from anything else and a half-written log would discard retirements permanently.

- **REQ-TRACE-138** — Retirement detection SHALL recover the requirement numbers and last known titles from the generated artifact as it stood before the regeneration that is about to replace it. A title containing a quote character SHALL be recovered intact. An entry that cannot be interpreted SHALL be passed over while the remaining entries are still recovered, and an artifact that cannot be read at all SHALL yield no entries — so no identifier SHALL be recorded as retired on the strength of a failed read.

- **REQ-TRACE-139** — Retirement detection SHALL report only identifiers that were present in the previous generation, are absent from the current live set, **and** are not already tombstoned. Results SHALL be sorted.

- **REQ-TRACE-140** — The retirement date SHALL come from an injectable clock defaulting to today's UTC calendar date, so a test can pin it. If a recorded retirement date shifted from one run to the next, the log would cease to be reproducible and every comparison taken over it would be noise.

- **REQ-TRACE-141** — Editing, renaming or re-titling a requirement SHALL produce **no** tombstone: only disappearance from the store counts as a deletion.
