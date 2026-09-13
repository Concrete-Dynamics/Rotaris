---
reference: ROTARIS-CRW-001
domain: requirements-traceability
date: 2026-08-29
status: draft
---

# Requirements Board and Traceability

## Overview

A project keeps its requirements as versioned documents in its own repository. A traceability toolchain compiles those documents into a generated code artifact whose symbols are referenced by annotations on implementing code and covering tests, then checks — from the desktop application, and in the project's own test run — that every approved requirement is implemented and covered, that no annotation names a requirement that no longer exists, that no production module and no test is untraced, and that a requirement whose text changed has had its implementing sites revisited. On top of the same data a graphical board presents every requirement as a card in a column, states the health of the evidence behind it, and lets a user release work, review a result, edit or create a requirement, answer a blocker and schedule a run — with every state change passed to the engine, attributed and recorded, and with nothing ever written by merely looking at the board.

## Requirements

### Requirement Store: Layout and Discovery

- **REQ-TRACE-001** — The requirement store SHALL be a directory tree inside the repository, repository-relative and configurable, defaulting to `docs/requirements`. It SHALL be scanned recursively for Markdown documents.

- **REQ-TRACE-002** — The store's conventional shape SHALL be: an epic document at the store root named `<block>-<epic-slug>.md`, and, optionally, a sibling directory `<block>-<epic-slug>/` holding one document per child requirement. The child directory is optional; an epic MAY exist with no children and no directory.

- **REQ-TRACE-003** — Markdown documents inside the store that carry no YAML-style frontmatter block SHALL be ignored silently — no requirement, no warning, no error — so that analysis notes, templates and READMEs can sit in the store harmlessly.

- **REQ-TRACE-004** — The store root SHALL additionally hold four plain-text bookkeeping artifacts whose paths are individually configurable: a trace/test debt baseline, an orphan-module baseline, an orphan-test baseline, and a retired-identifier log.

- **REQ-TRACE-005** — The store scan SHALL enumerate `*.md` recursively and process documents in ascending order of their repository-relative POSIX path string, so that every ordered output derived from the scan is deterministic and "first claimant wins" resolves to the lexicographically smaller path.

- **REQ-TRACE-006** — Every document SHALL be read as UTF-8 with undecodable bytes replaced rather than raising, and CRLF and lone CR SHALL be normalized to LF before any parsing or hashing. A content hash SHALL therefore be independent of line endings, and a single undecodable byte SHALL NOT abort a scan.

- **REQ-TRACE-007** — A document's requirement identity SHALL come from its frontmatter, never from its file name or directory. A misnamed file SHALL parse normally; nothing in the toolchain enforces the `<PREFIX>-<n>-<slug>.md` naming convention.

- **REQ-TRACE-501** — Store-parse cost SHALL grow linearly with the number of documents scanned and the number of bytes read, and a store of the order of 10^3 requirement documents SHALL be parsed in about one second under the reference conditions of REQ-TRACE-088. Peak memory SHALL be bounded by the size of the largest single document plus the accumulated metadata records, never by the total prose of the store: a document SHALL be normalized, hashed and reduced to its metadata record before the next document is read, and no phase of the parse SHALL require every document's text to be resident at once.

### Frontmatter Parsing

- **REQ-TRACE-008** — Frontmatter SHALL be recognized only when the very first line of the document, after stripping surrounding whitespace, is exactly `---`. Scanning SHALL continue until a subsequent line that strips to `---`, which terminates the block.

- **REQ-TRACE-009** — Given a document whose frontmatter opens but never closes, the parser SHALL treat the document as having no frontmatter: it contributes no requirement and produces no diagnostic of any kind.

- **REQ-TRACE-010** — Within the block, a line that opens with a letter, continues with any run of letters, digits, underscores or hyphens, and then carries a colon SHALL begin a new field. Any other line SHALL belong to the field most recently opened, its stripped text appended to what is already there with one space between. A value written across several indented lines SHALL therefore be read as one value.

- **REQ-TRACE-011** — A field's value SHALL be everything after the first `:`, stripped. If the result is at least two characters long and begins and ends with the same quote character (single or double), that outer pair SHALL be removed. No other escape or quote processing SHALL be performed.

- **REQ-TRACE-012** — A document whose frontmatter carries no requirement-identifier key SHALL be skipped without error.

- **REQ-TRACE-013** — The parser SHALL be self-contained and depend on no third-party YAML, TOML or validation library, so that it can run wherever the engine is embedded, without an activated project environment. For the same reason the layout configuration format SHALL be JSON.

### Frontmatter Schema and Vocabulary

- **REQ-TRACE-014** — The frontmatter keys the parser acts upon SHALL be exactly these seven:
  - `req-id` — one identifier, or a bracketed list of identifiers; unique across the whole store and never reissued.
  - `status` — the lifecycle value; see REQ-TRACE-016.
  - `trace` — `required` or `optional`, taken as `required` where the key is absent: whether an implementation reference is owed.
  - `test` — `required` or `optional`, taken as `required` where the key is absent: whether a covering test reference is owed.
  - `title` — free text.
  - `type` — `product` or `technical`, taken as `product` where the key is absent.
  - `derived-from` — one identifier or a bracketed list; accepted only where `type` is `technical`, and required there.
  A key outside this set and outside the provenance set of REQ-TRACE-015 SHALL be **carried through untouched and otherwise ignored**: it SHALL produce no error and no warning, SHALL take no part in any check, and SHALL survive a write performed by the source write path, which is required to preserve frontmatter fields the model does not represent (REQ-TRACE-204). Rejecting an unknown key would make that preservation impossible and would turn the addition of one field to a project's own document template into a repository-wide parse failure.

- **REQ-TRACE-015** — The parser SHALL additionally carry, without validating or enforcing them, these provenance fields: a legacy identifier (explicitly NOT unique across documents), a priority, a parent-epic identifier, a date, and an originating document path.

- **REQ-TRACE-016** — The lifecycle vocabulary SHALL be exactly three values with these effects:
  - `draft` — the symbol exists and may be referenced; **nothing is enforced at all** (zero errors, zero warnings).
  - `approved` — `trace: required` demands at least one implementation reference and `test: required` demands at least one covering test reference; a missing one is an error.
  - `deprecated` — every reference produces a deprecation warning, never an error.
  An unrecognized value SHALL be a parse error naming the document path, the identifier, the rejected value and the sorted list of accepted values.

- **REQ-TRACE-017** — `trace` and `test` SHALL accept exactly `required` and `optional`, defaulting to `required` when absent. An unrecognized value SHALL be a parse error naming the document, the identifier, which flag, the rejected value and the sorted accepted set.

- **REQ-TRACE-018** — `type` SHALL accept exactly `product` and `technical`, defaulting to `product` when absent, empty or whitespace-only. An unrecognized value SHALL be a parse error in the same shape.

- **REQ-TRACE-019** — `derived-from` SHALL accept a single identifier or a bracketed comma-separated list, parsed by the same rules as `req-id`. A token that does not match the identifier form SHALL produce an error naming it and SHALL be skipped, while the remaining tokens still parse. The stored value SHALL be an ordered tuple of requirement numbers.

- **REQ-TRACE-020** — A requirement's title SHALL be resolved in this order: a per-identifier body-heading override, then the frontmatter `title`, then the document's first top-level `#` heading. When none exists the title SHALL be the empty string, which is not an error.

- **REQ-TRACE-021** — Legacy identifiers SHALL be collected case-insensitively (upper-cased) into a map from legacy identifier to the list of requirements claiming it. After the scan, only entries claimed by exactly one requirement SHALL resolve; an identifier claimed by two or more SHALL resolve to nothing (historical reuse of same-day identifiers is the documented cause).

### Identifier Scheme

- **REQ-TRACE-022** — A requirement identifier SHALL be the project's identifier prefix, a hyphen, and one or more decimal digits, and nothing else. The prefix SHALL be one uppercase token, fixed for the project and identical on every requirement in the store. Numbers SHALL be written without leading zeros and SHALL have no upper bound. A `req-id` value of any other shape SHALL be a parse error naming the document and the value rejected. The prefix SHALL be declared by the `id_prefix` key of the layout configuration (REQ-TRACE-039), whose default is `REQ`; it SHALL NOT be inferred from the documents, because inferring it from the first document scanned would make a typographical error in that one document silently redefine what every other document must say.

- **REQ-TRACE-023** — Identifiers SHALL be globally unique across the whole store. A repeat SHALL produce an error naming the identifier and both claiming documents, and the later claimant SHALL be dropped; because the scan is path-sorted, "first" is deterministic.

- **REQ-TRACE-024** — The numbering convention SHALL be: `x00` is an epic (conventionally `trace: optional` and `test: optional`, since it is realized through its children); `x01` upward are the epic's requirements; one hundreds-block per epic; a new epic claims the next free block. Identifiers SHALL NEVER be renumbered or reused, and a deleted requirement SHALL leave a permanent gap.

- **REQ-TRACE-025** — Each identifier SHALL map to a generated integer-valued code symbol whose value is the requirement number itself, so that an annotation MAY be written with either the symbol or a bare integer and the two are indistinguishable downstream.

- **REQ-TRACE-026** — A document that fails validation SHALL contribute no requirements at all. Other documents in the same scan SHALL still parse; rejection is per document, not per field.

### Multi-Identifier Specification Documents

- **REQ-TRACE-027** — `req-id` MAY be a bracketed, comma-separated list, declaring several requirements in one document. The list form SHALL be detected by a value matching `^\[(.*)\]$`; parts SHALL be split on commas and stripped, and empty parts dropped. An empty list SHALL be an error naming the document.

- **REQ-TRACE-028** — In a multi-identifier document every declared identifier SHALL have a matching body heading of level 2 through 6 whose text begins with the identifier. The separator between the heading marker and the identifier SHALL be spaces or tabs. The remainder of the heading line, after stripping leading hyphen, em-dash and colon characters and re-stripping, SHALL become that identifier's title override; a bare heading with no remainder is valid and overrides nothing.

- **REQ-TRACE-029** — A declared identifier with no matching body heading SHALL be an error that names the identifier and the expected heading shape, and that identifier SHALL be dropped while the others still parse. The converse — a body heading for an identifier not in the list — SHALL NOT be an error; that block is simply never consulted.

- **REQ-TRACE-030** — Metadata overrides for a declared identifier SHALL be read from the lines that follow its heading. Blank lines sitting between the heading and the block SHALL be passed over. The block SHALL open at the first line whose key is a lowercase letter followed by any run of lowercase letters and hyphens and then a colon, and SHALL close at the first line thereafter that is blank or is not such a field. Prose following the block SHALL NOT be absorbed into it. An override key SHALL admit neither a capital letter nor a digit; a key carrying either is not an override, unlike a frontmatter key, which admits both.

- **REQ-TRACE-031** — Overrides SHALL apply to the lifecycle, the two obligation flags and the legacy identifier. Anything not overridden SHALL fall back to the shared frontmatter value.

- **REQ-TRACE-032** — A block SHALL extend from just after its heading line to the start of the next identifier heading, or to end-of-document for the last block.

- **REQ-TRACE-033** — Every identifier declared by one document SHALL share that document's single content hash. Editing any part of the document therefore changes the hash — and hence the baseline debt and the change-comparison result — for every identifier it declares.

- **REQ-TRACE-034** — A single-identifier document SHALL NOT consult body headings at all; it cannot override its own metadata from its body.

- **REQ-TRACE-035** — In a multi-identifier document the document-level legacy identifier SHALL NOT be inherited by the declared identifiers; only a per-block legacy-identifier override applies.

### Content Hashing

- **REQ-TRACE-036** — A requirement's content hash SHALL be the first 16 hexadecimal characters of a SHA-256 over the entire normalized document text, frontmatter and prose included. Touching any byte of the document — including a typographical fix in prose — SHALL change the hash for every identifier the document declares.

- **REQ-TRACE-037** — Two hashes SHALL exist over a requirement and SHALL NOT be exchanged for one another. The store hash of REQ-TRACE-036 is the value baseline suppression and change comparison compare. A canonical hash SHALL also be available which does not move when the frontmatter keys are reordered or the document reformatted, and which differs between two identifiers declared by one document. A consumer SHALL state which of the two it needs, and neither SHALL be accepted where the other was specified. The canonical hash SHALL be the first **32** hexadecimal characters of a SHA-256 taken, for one declared identifier, over a payload of these lines joined with LF in exactly this order: the identifier; the resolved lifecycle; the resolved trace obligation; the resolved test obligation; the resolved type; the comma-joined derived-from identifiers in declaration order; the resolved title; and that identifier's own prose as extracted by REQ-TRACE-198. Every line SHALL be stripped and its interior runs of whitespace collapsed to a single space before joining. The payload is therefore unmoved by a reordering of the frontmatter keys or a reformatting of the document, and differs between two identifiers declared by one document. The two hashes SHALL be distinguishable by length alone — **16** characters for the store hash, **32** for the canonical hash — so that a consumer handed the wrong one can tell.

### Layout Configuration

- **REQ-TRACE-038** — Every location the toolchain needs SHALL be carried in a single layout value that does not change for the duration of an operation. Each path in it SHALL be repository-relative, and the caller SHALL resolve it against a repository root. A repository that configures nothing SHALL be given the default layout, whose values are those stated in REQ-TRACE-039, and SHALL behave identically to one that configures those same values explicitly.

- **REQ-TRACE-039** — The layout SHALL carry exactly these thirteen configurable keys, every one of which SHALL have a default, so that the default layout of REQ-TRACE-038 is complete and no key is ever without a value:
  - `requirements_dir` — the store directory; default `docs/requirements`.
  - `id_prefix` — the project's requirement identifier prefix (REQ-TRACE-022); default `REQ`.
  - `generated_path` — where the compiled requirement-symbol module is written; that file takes no part in the annotation sweep; default `src/requirement_ids` with the source extension claimed by the built-in annotation convention appended.
  - `impl_roots` — the roots whose files may carry implementation traces; default the single root `src`.
  - `test_roots` — the roots whose files may carry coverage references; default the single root `tests`.
  - `excused_test_roots` — test roots excused as a whole from the orphan-test check, for suites that exercise a general capability rather than any one requirement and that an ordinary run does not execute; default the empty list, since excusing a suite is a decision a project makes deliberately.
  - `baseline_path` — the trace/test debt baseline; default `debt-baseline.txt` inside the store directory.
  - `orphan_baseline_path` — the orphan-module baseline; default `orphan-modules.txt` inside the store directory.
  - `test_orphan_baseline_path` — the orphan-test baseline; default `orphan-tests.txt` inside the store directory.
  - `tombstone_path` — the retired-identifier log; default `retired-identifiers.tsv` inside the store directory.
  - `exempt_marker` — the comment-shaped token that excuses a module, or a test function, from the reverse check; default `trace-exempt`, which is deliberately free of any one language's comment punctuation because the marker is matched as a plain substring (REQ-TRACE-105) and must therefore work inside whatever comment syntax the file is written in.
  - `skip_parts` — path components that are never entered or scanned; default `fixtures` together with the two directory names under which the implementation language's own toolchain places its generated caches and its installed dependencies. What is observable is fixed however those two are spelled: no file beneath a skipped component is parsed, can carry a trace, can be reported as an orphan module or an orphan test, or contributes coverage. Those two names are properties of the implementation language rather than of this product's behavior and are therefore left to the implementation, which SHALL supply exactly those two and no third; `fixtures` is fixed here.
  - `annotation_conventions` — the project's additional annotation conventions (REQ-TRACE-073), in registration order; default the empty list, the built-in convention being registered ahead of it and never listed here.
  A project SHALL NOT be expected to change `exempt_marker`: the default is intended to be adopted as it stands. Changing it SHALL rewrite the orphan baselines' headers and the diagnostics that quote it on the next baseline update, which is a consequence to be accepted deliberately rather than a reason to avoid the key.

- **REQ-TRACE-040** — The optional layout configuration SHALL be a JSON document named `rotaris-traceability.json`, located directly at the repository root and nowhere else. That name is fixed: no key, preference, or other surface renames it or nominates a second location for it, and a file of that name in a subdirectory is not a layout configuration. This requirement is the product's single definition of the file's name and location; a document that reads, reports, or looks for the layout configuration SHALL cite this identifier rather than naming the file a second time. When the file does not exist the default layout SHALL be returned with no error.

- **REQ-TRACE-041** — A configuration file MAY carry the layout keys directly in its top-level object or grouped beneath a `layout` key. Where a `layout` key is present, its object SHALL be the one read. Where a `layout` key is present but holds anything other than an object, loading SHALL fail with an error naming the configuration file.

- **REQ-TRACE-042** — The key schema SHALL be strict and fail loudly: an unrecognized key SHALL be an error listing the offending keys and the accepted keys, both sorted. Typos SHALL NOT be silently ignored.

- **REQ-TRACE-043** — Path-valued keys SHALL require a non-empty string (or path) value; backslashes SHALL be normalized to forward slashes; the result SHALL be rejected when absolute or when it contains a `..` segment, with distinct messages for "not a non-empty repository-relative path" and "must be relative and stay inside the repository".

- **REQ-TRACE-044** — List-valued keys SHALL require a list or tuple. A bare string SHALL be rejected with a message stating that a list of repository-relative paths was expected, guarding the common "one path where a list was meant" mistake. `skip_parts` SHALL likewise reject a bare string and SHALL become an unordered set of strings. `exempt_marker` SHALL require a non-empty string. `id_prefix` SHALL require a non-empty string of uppercase letters and digits beginning with a letter and containing no hyphen — the hyphen being the identifier's own separator — and any other value SHALL be rejected with a message naming the rejected value and that shape. `annotation_conventions` SHALL require a list whose every member is an object of the shape given in REQ-TRACE-073.

- **REQ-TRACE-045** — Setting only `requirements_dir` SHALL also relocate all four bookkeeping artifacts into the new directory. An explicitly named baseline or log path SHALL still win, regardless of key order in the file: the store-directory move is applied first, then the generated path, then the path-list fields, then the four explicit bookkeeping paths, then the exempt marker, then the skip components, then the identifier prefix, then the annotation conventions.

- **REQ-TRACE-046** — A read or parse failure of the layout configuration SHALL produce an error prefixed with the configuration path and stating that the layout configuration cannot be read, including the underlying cause. A top-level JSON value that is not an object SHALL produce an error stating that a JSON object was expected. All validation errors SHALL be re-raised prefixed with the configuration path.

- **REQ-TRACE-047** — A file is excused from the reverse test check when its repository-relative path is relative to any excused test root; matching SHALL be by path prefix and SHALL happen before the file is read.

### Repository Root Discovery

- **REQ-TRACE-048** — Repository-root discovery SHALL walk upward from a starting directory and return the first candidate where either (a) the layout configuration file REQ-TRACE-040 names exists as a file — a directory carrying it wins outright — or (b) the store directory exists AND at least one configured implementation root exists as a directory under that candidate. Within each candidate, (a) SHALL be tested before (b). The walk SHALL be innermost-first, so a nested repository carrying a configuration file beats an enclosing one.

- **REQ-TRACE-049** — When no candidate satisfies either test anywhere up the chain, discovery SHALL fall back to the current working directory rather than failing.

- **REQ-TRACE-050** — *Withdrawn.* The product has no command line, so there is no option to carry a repository root and no help output to suppress it from. A caller that already knows the root still supplies it directly, since every entry point takes one; which root the desktop operations use is fixed by REQ-TRACE-512, and discovery for a caller that does not know it stays with REQ-TRACE-048 and REQ-TRACE-049.

### Generated Requirement-Symbol Artifact

- **REQ-TRACE-051** — The store SHALL be compiled into a single generated source module at the configured generated path. The module SHALL NEVER be edited by hand, SHALL be excluded from the annotation sweep, and SHALL carry a fixed header that states it is auto-generated, names the store directory it was generated from, and states how it is regenerated (REQ-TRACE-509).

- **REQ-TRACE-052** — The header SHALL carry linter and formatter suppression directives so that ordinary tooling leaves a generated file alone, and a global fingerprint line carrying a full-length (untruncated) SHA-256 in hexadecimal.

- **REQ-TRACE-053** — Loading the generated module SHALL make three things available to code that refers to requirements: one integer-valued symbol per requirement the store declares, named after that requirement's identifier and equal in value to its number; a constant naming every requirement whose lifecycle is `deprecated`; and a lookup from requirement number to that requirement's metadata record. Every requirement the store declares SHALL be reachable by all three routes, and a requirement the store does not declare SHALL be reachable by none of them.

- **REQ-TRACE-054** — Each enumeration member SHALL be followed by a documentation string reading `[<status marker>] <title> - <source path>` and then one blank line. The marker SHALL differ per lifecycle value, and the marker for a deprecated requirement SHALL be the longer wording stating that no new references may be added, so that an editor showing the symbol's documentation shows that notice at every use site. Each lifecycle value SHALL have exactly **one** marker text, constant across every generation so that generation stays deterministic (REQ-TRACE-059), and the three SHALL be distinct from one another. What each must convey is fixed here and the wording is left to the implementation: the `draft` marker conveys that the requirement is not yet approved and that nothing is enforced against it; the `approved` marker conveys that it is approved and carries whatever trace and coverage obligations its flags declare; the `deprecated` marker conveys that it is deprecated and that no new reference may be added, and is the longest of the three.

- **REQ-TRACE-055** — Titles written into the documentation string SHALL be sanitized so that an arbitrary title cannot terminate the string: a triple double-quote SHALL be rewritten to a triple single-quote and backslashes to forward slashes.

- **REQ-TRACE-056** — When nothing is deprecated the deprecated-set constant SHALL still be emitted, as an empty frozen set; otherwise as a multi-line literal.

- **REQ-TRACE-057** — Each metadata entry SHALL be a positional constructor call in this fixed field order: identifier, number, lifecycle, title, source path, trace-required flag, test-required flag, content hash, type, and the derived-from tuple. Strings SHALL be emitted in a form that round-trips exactly. `source path` SHALL be the repository-relative POSIX path of the declaring document.

- **REQ-TRACE-058** — The global fingerprint SHALL be a full SHA-256 over a newline-joined payload containing, for every requirement in ascending number order, the fields: identifier, lifecycle, trace-required as an integer, test-required as an integer, title, source path, content hash, type, and the comma-joined derived-from list. Because the payload folds in the source path, *moving* a requirement document without editing it SHALL still change the fingerprint and force a regeneration.

- **REQ-TRACE-059** — Generation SHALL be deterministic: ascending number order, LF line endings, UTF-8 encoding, and a trailing newline. Generating from a reversed input list SHALL produce byte-identical output.

- **REQ-TRACE-060** — Generation SHALL be idempotent: newly generated text is compared against the normalized existing file text and nothing is written when they are equal, and the operation reports that it changed nothing. The first regeneration of a stale artifact SHALL report a change; an immediately following one SHALL report none.

- **REQ-TRACE-061** — The write SHALL be atomic: a temporary file created in the target's own parent directory, written UTF-8 with LF endings, then atomically replaced over the target. The parent directory SHALL be created when missing. On any failure the temporary file SHALL be removed on a best-effort basis. **The replacement SHALL take a bounded retry ladder** (accepted amendment 2026-09-06, OQ-41): **at most five attempts in total** — a first attempt and at most four retries — with a delay before each retry of **0.05 s, 0.1 s, 0.2 s and 0.4 s**, so the last attempt begins no more than 0.75 s after the first. The retry SHALL NOT be conditioned on being able to attribute the failure to another process: on Windows a replacement fails transiently against any open handle, and on shared storage with no other opener at all. **Exhaustion SHALL produce a recoverable error and SHALL retain the previous file**, which stands exactly as it did before the attempt; it SHALL NOT be reported as a partial or unknown outcome, and no caller is obliged to catch an exception to learn of it. An attempt that succeeds SHALL report nothing of the ladder, and no attempt SHALL leave a temporary artifact behind. **This is the only replacement ladder this domain states**, and it covers every whole-file replacement the domain performs: the generated artifact, the three baselines of REQ-TRACE-126, the retired-identifier log of REQ-TRACE-137, and the destination an export of REQ-TRACE-514 writes to. Its constants are **this domain's own and are deliberately not borrowed** from REQ-SESSION-033, whose six-attempt ladder governs the local summary file and may not be cited in place of this one; REQ-EVENTS-145's export destinations cite **this** one. Any document summarising the figures takes them from here.

  *This supersedes the earlier "the failure re-raised", which named a delivery mechanism rather than an outcome and was read as licence to let the failure escape uncharacterised; what the caller is owed is a stated failure with the old file intact. **The ladder itself was ruled on 2026-09-02 under OQ-44 and its amendment never reached this text**, which OQ-41's delivery found on 2026-09-13: the register recorded the closure, the constants were cited by name throughout the implementation, and the requirement still said the failure was re-raised. The figures here are that ruling's, unchanged.*

  **The replacement SHALL be retried before it is re-raised, and this requirement states the ladder.** Where the replacement fails with a transient access or permission failure, it SHALL be attempted again: **at most five attempts in total** — the first attempt and at most four further ones — with a delay before each retry of **0.05 s, 0.1 s, 0.2 s and 0.4 s**, so the last attempt begins no more than 0.75 s after the first. An attempt that succeeds is a successful write and SHALL report nothing; only after the last attempt has failed SHALL the failure be re-raised, on the terms the paragraph above fixes, and no attempt SHALL leave a temporary artifact behind. **The retry SHALL NOT be conditioned on this application being able to attribute the failure to another process holding the target.** On storage shared with, or reachable from, another machine the replacement fails transiently with no other opener present at all, and that condition — not contention — is the one this ladder is stated for; a build that retries only where it can identify a foreign handle absorbs none of it and does not satisfy this requirement.

  This ladder SHALL cover **every whole-file replacement this domain performs** — the generated artifact here, the three baselines of REQ-TRACE-126, the retired-identifier log of REQ-TRACE-137, and the destination an export of REQ-TRACE-514 writes to — and it is **the only replacement ladder this domain states**. It is stated because these artifacts are the user's own version-controlled material and are left on whatever storage the user chose (REQ-TRACE-513, REQ-SESSION-198): a regeneration or an export the user asked for MUST NOT fail for a condition of that storage which the user can neither act on nor reproduce, and a bounded retry costs nothing where nothing fails. This ladder is this domain's own and is **not** derived from the one REQ-SESSION-033 states for the sessions domain's summary file: the two govern different targets on different storage, neither requirement's attempt count or delays are the other's, and neither SHALL be cited in place of the other. A requirement in another domain whose write lands on a destination this product does not choose MAY cite this ladder rather than state a third one — REQ-LIBRARY-176 does.

- **REQ-TRACE-062** — The staleness check SHALL return "not up to date" whenever there are parse errors — a store that cannot be parsed is by definition not up to date — and otherwise SHALL compare normalized on-disk text with freshly generated text. A missing artifact SHALL read as stale.

- **REQ-TRACE-063** — Parse errors SHALL abort generation: nothing is written and the errors are returned. A broken store SHALL NEVER be able to produce a partially updated artifact, and after such a run the artifact SHALL NOT exist if it did not exist before.

- **REQ-TRACE-064** — A generated artifact produced by an earlier release SHALL remain loadable by a later release that has added fields to the metadata record: the fields the older artifact does not supply SHALL take defined defaults, and the artifact SHALL keep answering for the requirements it records until it is regenerated.

- **REQ-TRACE-065** — Editing only a requirement's body SHALL change the generated artifact (through the content hash) while leaving the enumeration member itself unchanged. Deleting a requirement document SHALL remove its symbol entirely from regenerated output. Changing `type` or `derived-from` SHALL change the global fingerprint, so the derived relation participates in staleness detection.

### Link Declaration: Annotations

- **REQ-TRACE-066** — Two annotation kinds SHALL exist: an implementation-trace annotation applied to the implementing code element, and a coverage annotation applied to the covering test. Both SHALL be variadic — one annotation MAY name several requirements — and both SHALL coerce their arguments to integers.

- **REQ-TRACE-067** — Applying an annotation SHALL record the numbers on the annotated object under its own dedicated attribute, appending to whatever is already recorded so that stacked annotations accumulate. The two kinds SHALL use separate attributes: applying one SHALL NOT set the other's.

- **REQ-TRACE-068** — Recording the attribute SHALL be best-effort: an object that rejects attribute assignment (slotted or built-in) SHALL be tolerated silently, because the static text scan still sees the reference. The runtime attribute is a convenience; the source text is authoritative.

- **REQ-TRACE-069** — Both annotation kinds SHALL check for deprecation at the moment they are applied, looking the numbers up in the generated metadata and emitting a deprecation warning for any deprecated one that names the identifier, the title and the source path, reported at the caller's own source location. The metadata lookup SHALL be lazy and SHALL tolerate the generated artifact not yet existing, so the check is a no-op during bootstrap.

- **REQ-TRACE-070** — A transitional comment naming a requirement SHALL be recognized and SHALL count as covering it. A legacy identifier written in such a comment SHALL be resolved through the legacy alias table of REQ-TRACE-021. The form is a test-side convention only: an occurrence outside a test root SHALL be discarded and SHALL count towards nothing. The comment's form SHALL be, within any one line: the case-insensitive token `covers:`, then whitespace, then one or more identifiers separated by commas, whitespace, or both, recognition ending at the end of that line. An identifier written there SHALL be either a canonical identifier (REQ-TRACE-022) or a run of one or more hyphen-separated alphanumeric segments, the latter resolved through the legacy alias table of REQ-TRACE-021.

- **REQ-TRACE-071** — A comment-form identifier that resolves to no requirement — the legacy identifier being unknown, or claimed by more than one requirement — SHALL produce a **warning** and never an error, and SHALL therefore never on its own be reported as a violation. The warning SHALL name the file, the **1-based** line, and the identifier exactly as written, and SHALL tell the author to write a canonical identifier in its place. The occurrence SHALL be recorded with no requirement number attached to it.

- **REQ-TRACE-072** — Direction SHALL determine what a reference counts as:
  - an implementation-trace annotation found in an implementation root counts as an implementation trace and marks its file as traced;
  - a coverage annotation or a transitional comment found in a test root counts as test coverage;
  - an implementation-trace annotation in a test root, or a coverage annotation in an implementation root, counts toward **neither** obligation — but is still recorded among all references, so it still participates in the deprecated-reference warning, the removed-requirement error and the change-comparison site index.

### Annotation Conventions (Language Seam)

- **REQ-TRACE-073** — How a reference is written SHALL be replaceable per language, so that a project whose sources are not in the host language can be swept by the same toolchain. A project SHALL be able to declare, for a language of its own, which file extensions that language owns and how that language spells a requirement reference, an annotation site, a collectable test function and an excused module. Once declared, files carrying those extensions SHALL take part in every check on the same terms as host-language files: their traces SHALL satisfy implementation obligations, their coverage references SHALL satisfy test obligations, their untraced modules and unannotated tests SHALL be reported as orphans, and their sites SHALL appear in the change-comparison worklist.
  A convention SHALL be declared as one entry of the `annotation_conventions` list in the layout configuration (REQ-TRACE-039), each entry being an object carrying exactly these six keys:
  - `name` — a non-empty string identifying the convention in diagnostics;
  - `extensions` — a non-empty list of file extensions written with their leading dot, which is what the convention claims (REQ-TRACE-074);
  - `reference_pattern` — matches one requirement reference and captures the identifier or bare number it names;
  - `annotation_pattern` — matches a whole annotation site, its argument list included, and captures which of the two annotation kinds it is;
  - `test_pattern` — matches the declaration of a collectable test function and captures its name;
  - `exempt_module_pattern` — matches a module this convention excuses from the orphan-module check.
  Patterns SHALL be regular expressions evaluated against the file's normalized text. A pattern that does not compile SHALL be a configuration error naming the convention, the key and the compilation failure; an entry missing a key, carrying an unrecognized key, or declaring an empty extension list SHALL be a configuration error in the shape of REQ-TRACE-042. Because a pattern-declared convention has no syntax tree to consult, a test function it collects SHALL take the matched line as its whole span — extended above by the same two-line slack as REQ-TRACE-112 — and its node identifier SHALL be `<repository-relative path>::<captured name>` with no class segment; the class-nesting rule of REQ-TRACE-109 SHALL apply to the built-in convention alone.

- **REQ-TRACE-074** — A file SHALL be swept under whichever convention claims its extension. Where two conventions claim the same extension, the one declared earliest SHALL be the one that applies. Registration SHALL be a single ordered sequence with no simultaneous entries, so "earliest" is always decidable and no further tie-break is needed: the built-in convention of REQ-TRACE-075 occupies position one, and project-declared conventions follow in the order they are written in the layout configuration (REQ-TRACE-073). A later registration claiming an extension an earlier one already claims SHALL be accepted without diagnostic and SHALL simply never be consulted for that extension. The set of extensions the toolchain will sweep SHALL be reportable, each extension appearing once however many conventions claim it. Declaring a further convention SHALL leave every already-claimed extension handled exactly as it was.

- **REQ-TRACE-075** — Exactly one convention SHALL be registered by default, and it SHALL claim the single source extension of the implementation language. A file whose extension no registered convention claims SHALL be passed over completely: it can hold no trace, can never be reported as an orphan module or an orphan test, and contributes no coverage. A repository whose sources are all written in a language no registered convention claims SHALL therefore report no traces at all.

- **REQ-TRACE-076** — The default convention SHALL recognize:
  - a call of either annotation kind, tolerating whitespace and line breaks between the name and the opening parenthesis and an argument list spread over several lines, but **not** an argument list that itself contains a parenthesis;
  - the requirement symbols named inside such a call;
  - a transitional comment in the form fixed by REQ-TRACE-070, and the identifiers written in it, each being either a canonical identifier or a run of one or more hyphen-separated alphanumeric segments.
  **No list of legacy prefixes SHALL exist.** A non-canonical token SHALL be resolved solely through the legacy alias table built from the `legacy-id` provenance field (REQ-TRACE-021): a project declares the legacy identifiers it recognizes by writing them on the requirements that inherited them, and a token that resolves to nothing warns under REQ-TRACE-071 rather than being matched against a hard-coded prefix no requirement claims.

- **REQ-TRACE-077** — Given an annotation whose argument list itself contains a call, the sweep SHALL NOT recognize it: the reference does not exist as far as the toolchain is concerned, and no diagnostic is produced. Implementers MUST treat this as a known limitation of the recognition form.

- **REQ-TRACE-078** — Recognition SHALL match plain call sites as well as decorator-position uses, because a module that annotates its own functions by calling the annotation at the bottom of the module must be seen exactly like a decorated one. This is required for bootstrap: the toolchain's own modules cannot use decorator syntax before the artifact they generate exists.

- **REQ-TRACE-079** — Discovery SHALL be a static text scan — not an import and not runtime introspection. A reference in unreachable code, or inside a string literal, SHALL still count if it matches. Test fixtures MUST therefore build annotation tokens by concatenating constants, so that a sweep of the whole repository does not credit some genuine requirement with coverage from a test that has nothing to do with it.

### Repository Sweep

- **REQ-TRACE-080** — File enumeration SHALL, for each configured root that exists as a directory, recursively glob every claimed extension, de-duplicate the results, and iterate them sorted by repository-relative POSIX path. Any path one of whose components (relative to the root) is a configured skip component SHALL be excluded, as SHALL the generated artifact itself.

- **REQ-TRACE-081** — The sweep SHALL visit implementation roots first, then test roots, each in its configured order. Files SHALL be read UTF-8 with undecodable bytes replaced so that a single bad byte never aborts a scan.

- **REQ-TRACE-082** — The sweep result SHALL carry: implementation traces by number, test coverage by number, all references by number in both directions, the unresolved legacy comment occurrences, and the set of implementation files holding at least one trace. An occurrence SHALL be the tuple (number, repository-relative POSIX path, 1-based line, kind), where kind names which of the three forms produced it.

- **REQ-TRACE-083** — A file SHALL answer two questions consistently: which requirements it references, and what each annotation written in it says. The second SHALL report, for every annotation, the first and last line it covers, its character span within the file, the identifiers it names, and whether it stands in decorator position. The two answers SHALL agree exactly — no requirement SHALL be listed as referenced without an annotation reporting it, and no identifier reported at an annotation SHALL be missing from the reference listing.

- **REQ-TRACE-084** — Every identifier written inside an annotation SHALL be reported with the line it actually occupies — which, where the annotation is spread over several lines, is not the line the call opens on — and with its own character span measured from the start of the file. Taking the text at that span SHALL yield exactly that identifier and no surrounding characters.

- **REQ-TRACE-085** — It SHALL be possible to ask whether a given line falls within an annotation, and to locate a single identifier by line together with requirement number. A number alone SHALL NOT be sufficient to locate one: a single line may name two requirements, and a single requirement may be named by two annotations in the same file. A lookup SHALL match an identifier only on the line that identifier occupies, and not on the other lines the surrounding annotation covers.

- **REQ-TRACE-086** — The decorator-versus-plain-call distinction SHALL be reported. Deleting a plain call removes a statement that actually runs, not merely a marker, so a rewriting caller may legitimately decline to touch it. A decorator SHALL be recognized only when the marker sits on the line immediately preceding the call with nothing else on that line.

- **REQ-TRACE-087** — Offset-to-line mapping SHALL be exact at every boundary and SHALL be 1-based. It SHALL be verified exhaustively — at every position from 0 to length+2 over awkward texts including an empty text, a text of only newlines, a text with no trailing newline, and a text with CRLF endings — because the failure mode is an off-by-one at a boundary that sampled tests step over.

- **REQ-TRACE-088** — Sweep cost SHALL grow linearly with the amount of source scanned, and a repository of the order of 10^3 source files carrying of the order of 10^4 annotation sites SHALL be swept in about one second. Sites naming several requirements, and sites spread over several lines, SHALL be handled by the ordinary path with no special case. That budget SHALL be measured under the **reference conditions**: one execution thread on a contemporary developer workstation backed by a solid-state disk, with a warm file-system cache, timing the sweep alone — enumeration, reading and matching — and excluding process start-up and the store parse. The linear-growth clause is the binding one: an implementation satisfies this requirement where doubling the amount of source scanned costs about twice as much and a repository of the stated size is swept within the stated time under those conditions.

- **REQ-TRACE-089** — Every operation SHALL report the repository as it stands at the moment that operation runs. No result SHALL be carried over from an earlier invocation and no stored summary SHALL be consulted in place of reading the files, so an edit made between two invocations SHALL be reflected by the second without anything having to be cleared first, and two invocations over an unchanged repository SHALL report the same thing. How often the work is repeated within one invocation SHALL make no difference to what that invocation reports.

  An **index** over the store and the repository — held wherever the application likes, including in a store it keeps for itself — is permitted, and exactly one distinction decides whether a given index is admissible. An index that is **consulted** is forbidden: if what an operation reports can depend on what the index last recorded, then a stale index and a current one are indistinguishable to the caller, and the guarantee above is gone however accurate the index usually is. An index that is **validated** is allowed: it is checked against the files themselves before any answer is given, and it is rebuilt from the files wherever that check fails or cannot be completed, so every answer still comes from the files and the index decides only how much work was avoided in producing it. The distinction is behavioural and SHALL be testable exactly as stated: with the application still open, change a requirement document, a baseline, the generated artifact or the retired-identifier log by any means at all — including means the application has no way to observe, such as a checkout of another revision, an edit by another program, or a restored backup — and the very next operation SHALL report the changed repository, with nothing to clear and no action by the user. An index that cannot meet that test is being consulted, whatever it is called, and SHALL NOT be used. Nothing here weakens REQ-TRACE-091's rule that one verification run judges every check against one reading of the store and one reading of the repository.

  Building, extending, validating and rebuilding such an index is the **one** thing an operation that only reports SHALL be permitted to write, and it is permitted only on the terms stated here. This paragraph is the whole of the exception REQ-TRACE-090, REQ-TRACE-152 and REQ-TRACE-408 make; nothing else an index write could otherwise reach falls inside it, and no further exception SHALL be read into any of them. REQ-TRACE-497 needs no exception and is given none, because its test is already whether a write is **observable** and an index maintained on these terms is not. **Confinement.** Index maintenance SHALL be confined to a store the application keeps for itself: it SHALL write nothing in the user's repository (REQ-TRACE-152, REQ-TRACE-513), SHALL write no delivery record (REQ-TRACE-399, REQ-TRACE-405), and SHALL emit no notice, no log entry and no statistic. **Observable inertness.** Deleting the whole index between any two operations SHALL change nothing either operation reports, and no surface, message, statistic or exported record SHALL disclose that an index exists, or that one was validated, rebuilt or discarded — so a user, and any other tool reading the same material, sees exactly what they would see had no index ever been built. **No relief.** The index SHALL relieve no budget: REQ-TRACE-088 and REQ-TRACE-501 are stated over the files and SHALL be met with the index **cold**, so removing it changes timing and nothing else. **A precondition of nothing.** An index that cannot be written, cannot be read, or is discarded SHALL leave every operation still able to run and still reporting the same answer; a failure to maintain one SHALL NEVER be reported to the user and SHALL NEVER fail an operation, and no invocation SHALL wait for another on account of one (REQ-TRACE-502). An index that cannot meet all four of these is not permitted by this requirement, whatever it is called.

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

### Toolchain Operations

- **REQ-TRACE-142** — *Withdrawn.* The product has no command line, so it has no subcommands, no flags and no usage error to exit on. The three capabilities the subcommands carried are re-sited on the desktop: verifying traceability is REQ-TRACE-508, regenerating the requirement-symbol artifact is REQ-TRACE-509, and producing a worklist of requirement changes against a base revision is REQ-TRACE-511.

- **REQ-TRACE-143** — *Withdrawn.* There is no invocation to carry global options. Which repository root and which layout configuration an operation reads is fixed by REQ-TRACE-512, which takes both from the workspace the window has open rather than from the user.

- **REQ-TRACE-144** — *Withdrawn.* No flag exists to be given a meaning. Four of the five capabilities are carried elsewhere: regenerating before verifying by REQ-TRACE-509, pruning the baselines by REQ-TRACE-510, and the base revision together with the drift finding by REQ-TRACE-511. The fifth, `--report-only`, selected the enforcement level withdrawn with REQ-TRACE-504; the check of REQ-TRACE-508 gates nothing by itself, so the complete non-blocking report that flag had to be asked for is what every check now produces.

- **REQ-TRACE-145** — *Withdrawn.* Nothing in the product has an exit code, so the observation that the board had none of its own now holds of the whole product. Each classification the codes carried survives as a stated finding: traceability violations and parse errors by REQ-TRACE-508, a malformed layout configuration and an unanticipated failure by REQ-TRACE-512, and unpropagated drift by REQ-TRACE-511.

- **REQ-TRACE-146** — *Withdrawn.* The `check` command no longer exists, and its steps were an ordering of writes to two byte streams. The ordering that remains observable — regenerate, then rewrite the baselines against the fresh parse, then verify — is carried by REQ-TRACE-508; the routing of findings between streams has no successor and needs none.

- **REQ-TRACE-147** — *Withdrawn.* There are no streams within which to order emitted lines. The operation order it fixed is carried by REQ-TRACE-508, and the order in which findings are presented remains fixed, for every surface alike, by REQ-TRACE-091.

- **REQ-TRACE-148** — *Withdrawn.* The regeneration capability, including that a run which rewrote the artifact stays distinguishable from one that found it already up to date, is carried by REQ-TRACE-509.

- **REQ-TRACE-149** — *Withdrawn.* There is no standard output and no standard error to route findings between. Errors, warnings, statistics and notices are presented together by REQ-TRACE-508, told apart by what each one is rather than by which stream carried it.

- **REQ-TRACE-150** — *Withdrawn.* The toolchain emits no lines into a mixed log, so there is nothing to tag. Findings are presented as records by REQ-TRACE-508, each already attributed by the location form of REQ-TRACE-100.

- **REQ-TRACE-151** — *Withdrawn.* The statistics have no line to occupy. Their content is unchanged and still owed: REQ-TRACE-101 fixes the figures and REQ-TRACE-508 requires them to be stated on every check.

- **REQ-TRACE-152** — The toolchain SHALL write **only** under the regeneration action of REQ-TRACE-509 (the generated artifact and the retired-identifier log) and the baseline-update action of REQ-TRACE-510 (the three baselines). Every other operation SHALL be read-only. What this requirement governs is what the toolchain writes **in the user's repository** (REQ-TRACE-513). The single exception is the maintenance of the index REQ-TRACE-089 permits, on that requirement's terms and on no others, and it is stated there rather than restated here; that index never lives in the repository, so no operation of this domain gains the ability to write there.

- **REQ-TRACE-513** — The material this domain reads and writes in the repository — the requirement documents themselves, the three debt baselines, the generated requirement-symbol artifact and the retired-identifier log — SHALL be **plain files in the user's own repository**, and SHALL NOT be moved into any store the application keeps for itself. This is a stated boundary, recorded so that relocating them is a change someone has to argue for rather than an optimisation that can be made while every other requirement still appears satisfied. Four grounds reach it, each independently sufficient:
  - **They are the user's versioned material and the product is a guest in it.** The requirement documents are authored by hand against a template and by the creation surface, never by a migration operation (REQ-TRACE-155, REQ-TRACE-442); the baselines carry headers written for a person to read and act on (REQ-TRACE-121); and the retired-identifier log is the sole surviving evidence that a deleted identifier was ever issued, parsed tolerantly precisely because people edit it by hand (REQ-TRACE-130, REQ-TRACE-135).
  - **Version-control history is load-bearing, not incidental.** The change comparison takes each requirement's "before" state from the generated artifact **as committed at the base revision** and is expressly forbidden from reconstructing it any other way (REQ-TRACE-157, REQ-TRACE-158). That is only possible if the artifact is a file the repository's own history carries.
  - **The generated artifact is imported by the user's own program.** Loading it makes one symbol per requirement, the deprecated set and the metadata lookup available to code that refers to requirements (REQ-TRACE-053), and the sweep excludes it as a file (REQ-TRACE-080). A record in a store cannot be imported by the repository's code.
  - **A shrink-only ratchet and an append-only log earn their value in a diff.** Both exist so that a change to them is visible in review (REQ-TRACE-116, REQ-TRACE-130), and adding a baseline entry by hand is documented as forbidden — a rule that is enforceable by people reading a diff and by nothing else.

  Two consequences follow and SHALL be read with this requirement. First, the concurrency obligation of REQ-TRACE-502 stays live over all four: because they never enter any store, no property of a store's concurrency control may be cited as discharging it. Second, what MAY be held in a store is an **index** over these files, on the terms REQ-TRACE-089 fixes and on no others.

- **REQ-TRACE-153** — *Withdrawn.* There is no command-line entry point, and the continuous-integration gate and commit-time hook whose lack of an environment it existed to accommodate are withdrawn with REQ-TRACE-184 and REQ-TRACE-185. The self-containment that is still observable is kept by REQ-TRACE-013, which holds the store parser free of third-party libraries and the layout configuration in JSON.

- **REQ-TRACE-154** — The toolchain SHALL provide no progress reporting and no cancellation of any kind at this layer: no interrupt handling, no progress callback, no partial-result reporting. The only observable progress is the result an operation returns once it has finished; the scan itself reports nothing while running. The absence of any time limit, document limit or resource limit on the file-system scan SHALL be a **deliberate decision and not a gap**: the scan is local file input whose cost is bounded by the size of the store and of the configured roots (REQ-TRACE-088, REQ-TRACE-501), a partially completed scan yields nothing a caller could act upon, and the layers that genuinely need to abandon work in flight own their own cancellation (REQ-TRACE-220). The one cost this layer does not itself control is a child process, and that SHALL be bounded by REQ-TRACE-170.

- **REQ-TRACE-155** — The toolchain SHALL provide no operation to add a requirement, renumber, or migrate; authoring is manual against the template, assisted by agent skills, and the one surface that brings a requirement into existence is the creation form of REQ-TRACE-442. It SHALL likewise provide **no project-structure detection and no configuration-scaffolding operation**: adoption consists of writing the layout configuration of REQ-TRACE-040, or of accepting the default layout of REQ-TRACE-039 unchanged, and the four operations of REQ-TRACE-508, REQ-TRACE-509, REQ-TRACE-510 and REQ-TRACE-511 are the whole of what the toolchain offers to be invoked.

- **REQ-TRACE-502** — Concurrent invocations SHALL be safe without any lock, lease or coordination file. Every artifact the toolchain writes — the generated artifact, the three baselines and the retired-identifier log — SHALL be written by the atomic replace of REQ-TRACE-061, REQ-TRACE-126 and REQ-TRACE-137, so a reader concurrent with a writer SHALL observe one complete version of a file and never a partial one, and two concurrent writers SHALL leave one complete file rather than a blend of both. Beyond that, **no invocation SHALL wait for another**: where two invocations race, each SHALL report the repository as it read it, so a check running beside a regeneration MAY legitimately report the artifact stale even though the other invocation is in the act of refreshing it, and re-running the check afterwards SHALL report it up to date. An invocation SHALL NEVER hang or leave a lock behind because another was running. The bounded replacement retry of REQ-TRACE-061 is **not** a wait for another invocation and SHALL NOT be dropped as one: it retries a condition of the storage the artifact sits on, it holds nothing another invocation needs, and it either completes or reports within its own stated bound.

  **What the independence promise reaches, and what it does not** (accepted amendment 2026-09-06, OQ-41). The promise is about **whole invocations and the freshness of what they report**, not about the scheduling of individual I/O operations: two invocations SHALL each run to an outcome and report the repository as they read it, and neither SHALL be made to wait on the other's *completion*. Ordering individual whole-file operations against one another is permitted and is how the guarantee above is met. *The clause "an invocation SHALL NEVER fail … because another was running" is narrowed here rather than kept whole, because it could not be met as written:* where a concurrent reader holds the artifact open, the replacement can exhaust REQ-TRACE-061's ladder, and the honest outcome is that requirement's **recoverable error with the previous file retained** — reported to the user as a failed operation they can repeat, never as a corrupted or half-written artifact. An invocation that fails this way SHALL say so; it SHALL NOT retry indefinitely, and it SHALL NOT report success. The **complete-file guarantee is not narrowed at all**: a reader never observes a partial file and two writers never leave a blend, whatever the contention.

  **The one concurrent invocation this product still has** is REQ-TRACE-182's test session regenerating the artifact in the same checkout. Its adapter SHALL keep its catch-and-report behaviour explicitly: a regeneration that fails SHALL be reported as a skipped regeneration and SHALL NOT block collection, so the suite runs against the artifact already on disk — stale at worst and never partial — and staleness is what the meta-tests surface.

- **REQ-TRACE-503** — A store that declares no requirements SHALL be reported, never passed over in silence. Where the parse yields no requirements, the check of REQ-TRACE-508 SHALL emit a **warning** — not an error — that names the configured store directory and distinguishes three findings using the probe of REQ-TRACE-178: the store directory is absent; it exists but holds no document carrying frontmatter; or it holds documents carrying frontmatter of which none declares a requirement identifier, which is the case that means the documents are of a kind this parser does not read. The warning SHALL name the concrete next step for the finding it reports. With no other violation the check SHALL still report the repository as carrying none, since a repository that has not begun writing requirements is not a repository in violation, and the statistics SHALL report a total of zero.

- **REQ-TRACE-504** — *Withdrawn.* Enforcement levels were selected only at the command line and were observable only in an exit code, and the product has neither. What the reporting level existed to obtain is now unconditional rather than requested: the check of REQ-TRACE-508 performs the whole verification, states every finding, and gates nothing by itself, so a repository adopting the toolchain with no baseline written obtains its complete coverage report from the first check it runs. The decision that a repository may not disarm its own gate is kept there too — no configuration key and no control suppresses a finding.

- **REQ-TRACE-508** — The desktop application SHALL offer a **traceability check** for the workspace it has open, and that check SHALL be where a user reaches the verification pass of REQ-TRACE-090 through REQ-TRACE-101. It SHALL run that pass over one reading of the store and one reading of the repository, and SHALL:
  - present every error and every warning the pass returns, grouped by check and ordered exactly as REQ-TRACE-091 fixes, each stated as REQ-TRACE-099 requires;
  - carry each finding's location in the attributable form of REQ-TRACE-100, and make the document or the site it names openable **at its own line** by the route REQ-TRACE-266 already uses;
  - distinguish an error from a warning by what the finding says about itself, never by where it was written;
  - state the statistics of REQ-TRACE-101 whether or not anything was found, and state **in words** when the repository carries no violation at all, so that a clean result is never an empty surface;
  - present parse errors alone when there are any, as REQ-TRACE-092 requires, saying that no other check could be performed.
  The check SHALL write nothing (REQ-TRACE-090, REQ-TRACE-152) and SHALL **gate nothing by itself**: there SHALL be no control and no configuration key by which a finding can be suppressed or an enforcement level chosen. Where the user asks for a regeneration (REQ-TRACE-509) or a baseline update (REQ-TRACE-510) alongside a check, the operations SHALL be performed in the order regenerate, then rewrite the baselines against the fresh parse, then verify, and each SHALL report what it did. This check SHALL be distinct from the verification of REQ-TRACE-410, which runs the workspace's own check suite and records evidence per requirement; the traceability check records none. It SHALL be reachable from the requirements view and its findings presented there, and the closed pane namespace of REQ-TRACE-375 SHALL be left exactly as it stands.

- **REQ-TRACE-509** — The desktop application SHALL offer a **regeneration** action that brings the generated requirement-symbol artifact up to date for the workspace it has open. It SHALL perform the generation of REQ-TRACE-059 through REQ-TRACE-063 unaltered, including the retirement record that REQ-TRACE-132 and REQ-TRACE-133 require to be written first, and SHALL report the artifact's path, **which** of "regenerated" and "already up to date" it observed, and the requirement count — so that a run which rewrote the artifact is distinguishable from one that found nothing to do. On parse errors it SHALL report each of them, SHALL write nothing (REQ-TRACE-063), and SHALL state that the artifact was left exactly as it stood.

- **REQ-TRACE-510** — The desktop application SHALL offer a **baseline update** that performs REQ-TRACE-123 through REQ-TRACE-129 for the workspace it has open: all three baselines rewritten in the fixed order, only entries now satisfied removed, never one added, and each reported by the notice REQ-TRACE-123 requires. It SHALL be invoked deliberately and SHALL NEVER be performed as a consequence of opening the board, reading it, or running the check of REQ-TRACE-508.

- **REQ-TRACE-512** — Every operation of REQ-TRACE-508 through REQ-TRACE-511 SHALL run against the repository root of **the workspace the window has open**, resolved by REQ-TRACE-048 and REQ-TRACE-049, and against the layout configuration found there (REQ-TRACE-040); neither a root nor a configuration path SHALL be nominated by the user. Each SHALL run **off the interface thread** (REQ-TRACE-337), and at most one operation of a given kind SHALL be in flight for a workspace at a time — a second request SHALL be refused with a stated reason rather than queued or raced. A layout configuration that cannot be read or does not validate SHALL be reported in the terms of REQ-TRACE-046, naming the configuration path and the underlying cause, with **no operation performed and nothing written**; a failure the operation did not anticipate SHALL likewise be **stated**, naming what failed, rather than swallowed or reduced to a bare code. No operation SHALL be started on its own initiative by opening the requirements view or by reading the board (REQ-TRACE-408). These four operations write repository bookkeeping artifacts and **never a delivery record**; they are not board actions, and nothing here SHALL be read as extending the closed action set of REQ-TRACE-382 or as offering a second path by which a delivery state could be persisted (REQ-TRACE-399).

- **REQ-TRACE-514** — **The delivery store exports.** The delivery records of the workspace the window has open SHALL be obtainable as a file the user chooses, in a form that yields every field of every record to a stock parser on a machine with none of this product's code present. That guarantee is REQ-EVENTS-166's and is not restated in a second form here; this requirement applies it to the delivery store on the same terms REQ-SESSION-199 applies it to the timeline, the issues record, the metrics document and the permission audit. It SHALL run against the open workspace's repository root exactly as REQ-TRACE-512 requires of the four operations above, with neither a root nor a store nominated by the user, and SHALL be available whether or not a run is in flight. **It is not a fifth toolchain operation**: REQ-TRACE-508 through REQ-TRACE-511 remain exactly four, and this action performs none of their passes.

  The export SHALL carry, for each requirement the store holds a record for: the delivery state that requirement occupies, from the column vocabulary of REQ-TRACE-232 together with the blocked condition and the origin state a blocked requirement returns to (REQ-TRACE-233); the delivered specification hash an acceptance stored (REQ-TRACE-387, REQ-TRACE-402); the retained per-requirement delivery history the store keeps; and each recorded transition with the acting party, the time and the stated reason, an entry written for an override additionally carrying that it was an override and the grounds given for it (REQ-TRACE-401). It SHALL also carry the retained ids of requirements the sources have stopped declaring, which the delivery store keeps so that a retired id is never issued again; that record is the delivery store's own and is a **different** thing from the retired-identifier log the toolchain keeps as a file in the user's repository (REQ-TRACE-130, REQ-TRACE-513), which is already the user's and needs no export.

  **The audit exports as an audit.** Transitions SHALL appear in the order they were taken, none omitted, and — where the store's history retention has pruned earlier entries — the export SHALL state that it has and how many, so a pruned history can never be mistaken for a complete one. REQ-TRACE-405 is what obliges the store to retain enough to say so; that obligation is stated there and is not restated here. **Where the export states that entries are absent it SHALL state why they are absent.** A count of missing entries reported without its cause is not an audit statement, because a reader cannot tell the record working as designed from a gap in the record, and the two mean different things about the same number. In this store retention is the only cause there is: REQ-TRACE-405 makes writing the record a condition of the state-changing action completing, so a transition this store admitted cannot afterwards be missing for any other reason, and the export SHALL say that rather than leave it to be assumed. The export SHALL NOT report absence as a single undifferentiated figure, and SHALL NOT carry that figure in a shape shared with the export of a store whose absences have more than one cause (REQ-LIBRARY-176), because a shape that fits both erases the distinction each export exists to state. A record the running build cannot interpret SHALL be exported as it stands and identified as uninterpretable together with the version it carries, which is the same answer REQ-CONFIG-192 requires of every other surface that reads delivery records; an export that silently omitted it would be the one place a user could not discover it existed.

  Exporting SHALL write nothing to the delivery store, SHALL NOT persist or alter a delivery state (REQ-TRACE-399), SHALL relocate no card, and SHALL record no verification (REQ-TRACE-410). **It is not a channel**: it is a user-initiated action producing a file at the moment it is asked for, it SHALL NOT refresh itself, and no surface SHALL be built on repeating it. Where the store holds no record of a kind the export SHALL produce an empty record of that kind rather than nothing at all, so that absence is distinguishable from failure. **The destination is the one write in this domain whose target the product does not choose**, so where the file the user chose already exists, replacing it SHALL take the retry ladder of REQ-TRACE-061 — that requirement states the ladder and it is not restated here — because a destination a user names may be on storage this product neither chose nor can characterise, where a replacement fails transiently with nothing else holding the file. A failure SHALL be **stated**, naming what failed, in the terms REQ-TRACE-512 fixes, with nothing written.

  **Why it exists and where its boundary is.** Delivery records were files a user could open and read for themselves before they became records only this application reads; without an export, moving them into the store would be a straight reduction in what a user owns about their own project's delivery history — the same argument that reaches the permission audit. A record gains an export when it carries no unredacted user or tool content, and a delivery record qualifies: it holds a state, a hash, an acting party, a time and a reason the user themselves wrote, and it holds no tool arguments and no agent output. The export SHALL NOT be widened to carry the run material a delivery decision refers to. The sessions those records point at have exports of their own and limits of their own, and a session's tool-call evidence deliberately holds unredacted arguments and never gains one (REQ-SESSION-199, REQ-SESSION-136).

### Change Comparison Against a Base Revision

- **REQ-TRACE-156** — The change comparison SHALL answer a question the check is structurally incapable of answering. Where a requirement's **prose** is rewritten but every annotation naming it is left in place, verification continues to report success even though the code now implements an older statement. The comparison SHALL convert such a change into an actionable worklist by comparing each requirement's content hash at a base revision against its hash in the working tree.

- **REQ-TRACE-157** — The "before" state of every requirement SHALL be taken from the **generated artifact as committed at the base revision**, and SHALL NOT be reconstructed by re-reading the requirement documents as they stood at that revision. Only entries in that artifact that are well formed and carry a requirement number SHALL contribute; an entry that cannot be interpreted SHALL be passed over while the remaining entries still contribute. A requirement SHALL therefore be reported as unchanged exactly when the content hash the base artifact records for it equals the hash computed from the working tree, whatever the historical documents contained.

- **REQ-TRACE-158** — Given the base artifact cannot be retrieved, is empty, fails to load, or carries no usable mapping, the base SHALL be reported unavailable: no changes are computed, the comparison states that there is no base artifact to compare against, and nothing is reported as drift. A base revision that exists but at which the generated artifact had not yet been introduced SHALL take exactly this path and SHALL be indistinguishable in behaviour from a base revision that does not exist: in both cases there is no recorded "before" state, and inventing one by re-reading the historical requirement documents is forbidden by REQ-TRACE-157.

- **REQ-TRACE-159** — The changed-file set SHALL be the union of two version-control queries: tracked changes between the base revision and the working tree, and untracked-but-not-ignored files. Each SHALL be merged only when it succeeded; a failing query SHALL contribute nothing rather than aborting. Untracked files SHALL be included so a brand-new implementation or test file counts as touched.

- **REQ-TRACE-160** — Classification SHALL be pure given the current requirements, the base snapshot, the site index and the changed-file set. For every current requirement: no base entry means **added**; differing content hashes mean **modified**, with drift computed, and — when the lifecycle also differs — the transition recorded on the same entry so a combined change is reported once as modified carrying the transition, not twice; equal hashes with a differing lifecycle mean **status**; equal hashes and equal lifecycle emit nothing. Every base number missing from the current set means **removed**, carrying the base title, lifecycle and source path. The result SHALL be sorted by requirement number.

- **REQ-TRACE-161** — Drift for a **modified** change SHALL be defined as: the requirement is `approved`, **and** it has at least one recorded annotation site, **and** none of those site files appears in the changed-file set. Consequences: a `draft` requirement can never drift; a requirement with no annotations can never drift; and drift is judged at **file** granularity, so touching any part of a file containing a site clears it.

- **REQ-TRACE-162** — Drift for a **removed** change SHALL omit the approved precondition: it is simply "has sites and none touched".

- **REQ-TRACE-163** — The site index SHALL be **all** references in both directions, not the direction-filtered maps, so a coverage annotation in a test root and a trace annotation in an implementation root both count as sites to review.

- **REQ-TRACE-164** — Each change SHALL be presented as one entry carrying: the change kind, the identifier, the quoted title, an optional lifecycle transition stated only when a transition was recorded **and** differs from the current lifecycle, a fixed obligation text per kind, and a drift marker when drift was found. Beneath that entry SHALL come one `<file>:<line> (<kind>)` entry per site.

- **REQ-TRACE-165** — Each change kind SHALL carry a fixed obligation text. For **added**: implement the requirement, then attach both annotations. For **removed**: delete each listed reference or point it elsewhere. For **modified**: re-check every site in the list against the rewritten text. For **status**: bring the existing references into line with the requirement's new lifecycle.

- **REQ-TRACE-166** — Given an **added** or **modified** change with no sites, a single placeholder SHALL state that there are no annotation sites yet. Given a **removed** or **status** change with no sites, no site entries SHALL be presented at all.

- **REQ-TRACE-167** — Given no changes at all, the comparison SHALL state that there are no requirement changes against the base.

- **REQ-TRACE-168** — Given a non-empty drift set, the comparison SHALL state, as a finding distinct from the per-change entries, the number of requirements that changed without their implementing or covering code being updated, and SHALL instruct the user to propagate the change or update the annotations and then commit the requirement and the code together. Drift SHALL always be reported; it is never suppressed and never selected for.

- **REQ-TRACE-169** — The comparison SHALL parse the store freshly and return parse errors before touching version control at all; on parse errors it SHALL present no worklist whatsoever and SHALL report those errors in their place.

- **REQ-TRACE-170** — The comparison's version-control queries SHALL each be a read-only child process rooted at the repository, capturing output, not raising on a non-zero status, and treating an unavailable version-control executable as a failed query with empty output. Every such invocation SHALL be bounded by a **30-second** timeout, the same bound the consumer layer applies (REQ-TRACE-201). An invocation that exceeds it SHALL be terminated and SHALL count as a failed query with empty output, which the surrounding rules already accommodate: the changed-file set simply gains nothing from that query (REQ-TRACE-159), and a base artifact that could not be retrieved is reported as unavailable (REQ-TRACE-158). **No operation SHALL be able to block indefinitely on a child process.**

- **REQ-TRACE-511** — The desktop application SHALL offer a **change comparison** against a base revision, and that surface SHALL be where a user reaches REQ-TRACE-156 through REQ-TRACE-170. The base revision SHALL be selectable and SHALL default to the revision the working tree currently sits on. The comparison SHALL present the classified changes of REQ-TRACE-160 in requirement-number order, each carrying the facts of REQ-TRACE-164 and the obligation text of REQ-TRACE-165, with every listed site openable at its own file and line by the route of REQ-TRACE-266. The drift finding of REQ-TRACE-168 SHALL be presented distinctly from the changes themselves, an unavailable base (REQ-TRACE-158) and an absence of changes (REQ-TRACE-167) SHALL each be stated in words, and the comparison SHALL write nothing.

### Read-Only Coverage Query

- **REQ-TRACE-171** — A side-effect-free query API SHALL answer "what covers requirement X?" without running verification. Its only inputs SHALL be the requirement store together with the configured source roots: it SHALL consult no version-control system, open no network connection and write nothing. Asked about a requirement that has no coverage, or one it does not recognize at all, it SHALL return empty collections rather than raising.

- **REQ-TRACE-172** — Its shapes SHALL be: a site carrying a repository-relative POSIX path, a line and a kind; and a per-requirement result carrying the number, the implementation sites and the test sites, with derived "is traced" and "is test covered" predicates.

- **REQ-TRACE-173** — Entry points SHALL be: one requirement; every requirement keyed by number; and a pure projection of an already-computed sweep. An existing parse MAY be supplied for reuse. The sweep itself SHALL NOT be reused across single-requirement calls, so querying N requirements one at a time costs N full scans — a documented cost.

- **REQ-TRACE-174** — The keys of the full map SHALL be the union of two sets, sorted ascending: the numbers of the declared requirements, **and** every number the sweep saw referenced anywhere. A caller can therefore spot references to requirements that no longer exist without running verification again. A requirement with no sites SHALL still appear as a key, holding empty collections rather than being omitted.

- **REQ-TRACE-175** — Coverage sites obtained from a sweep SHALL be flagged as **not executed**. A static scan can establish only that a test is present in the source; it cannot establish that the test was ever run. Downstream, such sites SHALL project as *stale* evidence. The boundary of what the static scan can assert is presence, never execution.

- **REQ-TRACE-176** — The library SHALL be importable in a repository where the generated artifact has never been produced, and importing it SHALL neither parse the store nor require that artifact to exist. The metadata record, the lifecycle enumeration and both annotation kinds SHALL be usable immediately on import. Asking for a name the public surface does not offer SHALL raise the language's ordinary missing-attribute error, naming both the package and the name asked for.

### Store Probing

- **REQ-TRACE-177** — A probe SHALL answer whether a repository keeps a store **of this kind** without parsing it, so that workspace selection can distinguish "no requirements" from "requirements we cannot read". The mere presence of a directory bearing the expected name proves nothing: another project may store its requirements at that exact path but in a document convention this parser does not understand, in which case an ordinary parse yields an empty list and reports no errors at all.

- **REQ-TRACE-178** — The probe result SHALL carry three fields: whether some document under the store declares a requirement identifier; how many documents carry frontmatter that is *not* an identifier block — a positive count here alongside a negative answer to the first field is precisely the situation the probe exists to detect; and how many documents were inspected, a figure limited only by how large the store is, since the probe scan applies **neither a document cap nor a time limit**.

- **REQ-TRACE-179** — Where the store directory is absent, the probe SHALL answer at once with no identifier found, no frontmatter documents counted and nothing inspected. Otherwise it SHALL walk the store in the same path order as the store scan, normalizing each document it reads and passing over any it cannot read, and SHALL **stop at the first document that declares a requirement identifier** — so the inspected count reported with a positive answer covers only the documents reached up to that point. The probe SHALL compute no hashes, produce no requirements, write nothing and consult no version-control system.

- **REQ-TRACE-180** — A workspace SHALL be claimed as carrying a store of this kind only by **reading** it, never by the directory existing.

### Enforcement Layers

- **REQ-TRACE-181** — Enforcement SHALL be layered so that drift is caught at five different moments: (1) in the editor and at compile time, free of charge, through the generated symbols — a deleted requirement's symbol vanishes and every reference becomes a build error, and a deprecated requirement's symbol carries the language's deprecation marker so every reference warns at the exact spot; (2) the test session's own regeneration (REQ-TRACE-182), which turns an edited requirement into a failure inside that same test run; (3) meta-tests inside the ordinary test suite (REQ-TRACE-183), so that any continuous-integration run of that suite enforces it with no extra configuration; (4) the traceability check of REQ-TRACE-508, together with the board's continuous evaluation (REQ-TRACE-334, REQ-TRACE-347), which states a violation on the requirement's own card as soon as the repository changes; (5) the completion conditions the engine evaluates before a requirement may be recorded as delivered (REQ-TRACE-399, REQ-TRACE-402), which no surface may relax.

- **REQ-TRACE-182** — Before collecting tests, the test session SHALL regenerate the compiled requirement-symbol artifact, so that editing a requirement surfaces as a verification failure within that same test run. It SHALL report a regeneration notice and any parse errors through the test run's own diagnostic reporting, and SHALL NEVER block collection: any failure SHALL be caught and reported as a skipped-regeneration notice, leaving parse errors for the meta-tests to surface. **"Any failure" includes a failed replacement** (accepted amendment 2026-09-06, OQ-41): this session is the one concurrent invocation the product still has (REQ-TRACE-502), it writes the artifact the same checkout may have open, and REQ-TRACE-061's ladder can exhaust there. The catch SHALL therefore sit around the whole regeneration and not around its parse alone, and a failure SHALL leave the suite running against the artifact already on disk — stale at worst, never partial.

- **REQ-TRACE-183** — Meta-tests SHALL assert, over the real repository, that the store parses with zero errors and is non-empty, that the generated artifact is up to date (with a failure message naming the regeneration action of REQ-TRACE-509), and that verification reports **zero errors**. The repository's steady state SHALL therefore be: no violations, only baseline-suppressed debt.

- **REQ-TRACE-184** — *Withdrawn.* A continuous-integration workflow enforced traceability by invoking the withdrawn command line, which no longer exists to be invoked. The capability — a repository being told about traceability violations without anyone remembering to look — is carried by the meta-tests of REQ-TRACE-183, which any continuous-integration run of the project's own test suite exercises, and by the desktop check of REQ-TRACE-508 together with the board's continuous evaluation (REQ-TRACE-334, REQ-TRACE-347).

- **REQ-TRACE-185** — *Withdrawn.* A commit-time hook exists only to invoke a command from a shell, and the product offers no command to invoke. The capability it carried — a violation stopping work before it is committed — is carried by REQ-TRACE-508, which states every violation over the repository as it currently stands, by REQ-TRACE-183, which fails the project's own test suite on the same findings, and by REQ-TRACE-402, which refuses to record a requirement as delivered while its text has moved on. The staging behaviour has no successor and needs none: the two paths the toolchain may write are written by REQ-TRACE-509 and REQ-TRACE-510 and are committed by the user like any other change.

- **REQ-TRACE-186** — *Withdrawn.* There is no command-line invocation for a build target to wrap and none for a contract to rest on. The operations of REQ-TRACE-508 through REQ-TRACE-511 are the contract, and they are reached the same way on every supported platform.

- **REQ-TRACE-187** — An implementation SHALL be accepted only where all five of these hold:
  1. the full test suite passes and the check of REQ-TRACE-508 reports **no violation**;
  2. taking one approved requirement that has no implementation reference and setting `trace: required` on it makes that check report an error naming that requirement and makes the traceability meta-test fail; reverting the edit and regenerating restores both;
  3. the same exercise with `test: required` on a requirement that has no covering test produces the equivalent error and the equivalent recovery;
  4. editing only a requirement's prose causes the artifact to be regenerated with a changed content hash at the next compile, test run or regeneration (REQ-TRACE-509), and causes no other failure;
  5. a violation introduced while the board is open is stated on that requirement's own card and on the check surface without the application being restarted, and the requirement cannot be recorded as delivered while it stands (REQ-TRACE-402).

### Authoring and Propagation Workflow

- **REQ-TRACE-188** — Five triggers SHALL each start the propagation procedure: verification reporting errors; a traceability meta-test failing; a missing-attribute failure raised where a symbol was removed; a deprecation warning fired at a reference site; and **any** edit made anywhere under the requirement store.

- **REQ-TRACE-189** — The procedure SHALL be, in order: (1) obtain the worklist from the change comparison of REQ-TRACE-511, optionally against a chosen base revision, and read each changed requirement's current text in full rather than its diff; (2) act on each entry according to the obligation its change kind carries (REQ-TRACE-165); (3) regenerate the artifact (REQ-TRACE-509) and run the check of REQ-TRACE-508, taking the reported violations as the work queue; (4) visit every reference site the worklist lists, implementation sites and covering tests alike; (5) bring each implementation site into line with the current text, keeping its trace annotation attached to the behavior it names; (6) add or amend covering tests until the check reports no errors; (7) commit the requirement documents, the generated artifact, the baselines, the implementation and the tests as **one commit**, whose message names the requirement identifier. The procedure is complete when, at that commit, the check of REQ-TRACE-508 reports no violation and the comparison of REQ-TRACE-511 against the base reports no drift.

- **REQ-TRACE-190** — Hard authoring rules SHALL be: never hand-edit the generated artifact; never leave production code or a test untraced, authoring a technical requirement where no product requirement fits; never quiet a violation by stripping annotations, watering down the requirement text, or writing a fresh baseline entry; never reuse or renumber an identifier — deprecate instead of deleting anything ever referenced in code.

- **REQ-TRACE-191** — A requirement's flip to `approved` and the addition of its annotations SHALL land in the **same change**, because an approved requirement without annotations is a verification error unless baselined. When baselined debt is paid, it SHALL be pruned by the baseline-update action of REQ-TRACE-510.

- **REQ-TRACE-192** — New or materially changed **product** requirements SHALL model a test portfolio before implementation, as a table with columns for level, productive scenario, exercised boundary and planned or covering test, and rows for unit, integration and user-flow end-to-end. Every "not applicable" SHALL carry a reason. At least one hermetic end-to-end test through the real public product boundary SHALL carry the coverage annotation for the product requirement. One end-to-end flow MAY be counted as coverage for more than one requirement only where it asserts something substantive about each of them and names every one it claims. **Technical** requirements SHALL instead specify unit or integration coverage suited to the seam they sit on, reaching the originating product flow by way of their origin link; no separate end-to-end test is owed for them.

- **REQ-TRACE-193** — A requirement statement, its acceptance criteria and its scope SHALL be written in terms of observable behavior alone, and SHALL name no class, function, module, file path or other artifact of the implementation. It SHALL be possible to read a requirement without opening any source file and, from that reading alone, write a test that decides whether it holds.

- **REQ-TRACE-194** — An epic document SHALL itself be a requirement whose body contains a one-paragraph scope description, an index table of its children, and a history section preserving the description, implementation notes and acceptance criteria of any documents merged into it. The observed index columns SHALL be: identifier as a relative link, title, priority, lifecycle.

- **REQ-TRACE-195** — The epic index table SHALL be maintained by the authoring workflow and by the source write path (a deletion also removes the index row), but SHALL NOT be machine-checked by the verifier and MAY therefore drift from the actual documents without any tool complaining.

- **REQ-TRACE-196** — Human-readable reciprocal navigation lines between a derived requirement and its origin SHALL be treated as convention for readers only. The **forward** frontmatter link SHALL be the single source of truth for the derived relation; the reverse direction SHALL be computed so it cannot silently drift. No tool SHALL validate those navigation lines: a missing, stale or wrong reciprocal line SHALL produce no error and no warning from any operation, and their absence SHALL never affect the derived-from integrity checks of REQ-TRACE-098, which read the frontmatter link alone.

### Consumer Integration Contracts

- **REQ-TRACE-197** — There SHALL be exactly **one parser**: all requirement metadata — identifiers, lifecycle, type, obligation flags, origin links and content hash — SHALL come from the store's own parser. Any additional frontmatter reader would amount to a rival definition of the repository's requirement set, and the two definitions would diverge as soon as the document format changed. An adapter reading the store as a source SHALL add no second parse.

- **REQ-TRACE-198** — The metadata record SHALL deliberately **not** carry the requirement's prose. The documented extraction rule SHALL be: for a single-identifier document, the text between the top-level identifier heading and the first second-level section; for a multi-identifier document, the text of that identifier's own section.

- **REQ-TRACE-199** — The parent-epic relation SHALL be derived from the store layout, not from a frontmatter field: an index document at the store root owns the sibling directory of the same stem, and a requirement's epic is the lowest-numbered identifier declared by its index document — which for a multi-identifier document is the document itself. A document sitting directly in the store directory is its own index, and index documents are therefore parentless.

- **REQ-TRACE-200** — Requirement history SHALL be read from version control at an **explicit revision**, using read-only queries, so nothing about the working tree can change the answer. A revision the version-control system does not know SHALL NOT be an error — it means the artifact did not exist then, a real answer for a requirement added later. A store outside version control SHALL declare no history.

- **REQ-TRACE-201** — Every version-control call made by the consumer layer SHALL be bounded by a **30-second** timeout. A call that stalls SHALL therefore come back as a failure rather than blocking whichever refresh issued it.

- **REQ-TRACE-202** — Prose reads SHALL be keyed to the store's own content hash: where a document's hash is unchanged since the previous refresh, its text SHALL NOT be fetched a second time. A request naming particular artifacts SHALL fetch exactly those and nothing besides.

- **REQ-TRACE-203** — Incremental reading SHALL be an **optional** source capability: a source that can address artifacts individually lets a one-document change in a large store cost one document, while a source that cannot is still first-class and simply re-reads in full when the revision moves. Scanning is therefore not incremental by default.

- **REQ-TRACE-204** — All writes SHALL be performed under the store's own conventions. Three consequences SHALL hold: editing a document preserves frontmatter fields the model does not represent; a newly created requirement satisfies the project's own check without further hand-editing; and removing a requirement also strips its row from the owning epic's index table.

- **REQ-TRACE-205** — Where the store is read as a requirement source, the result SHALL satisfy: each declared identifier appears exactly once, carrying its identifier, title, lifecycle, type and content hash unchanged from the store; a document declaring several identifiers yields one requirement per identifier, each with that document's hash and with whatever lifecycle its own override block sets; and a workspace holding no store yields **no source at all, and not an error**.

- **REQ-TRACE-206** — A consuming surface SHALL acquire coverage by **calling the library directly** and receiving plain data back. No consuming surface SHALL launch the checking engine as a process, and none SHALL interpret rendered output in place of the data. On this path there is consequently no child process, no exit status to inspect and no text to parse.

- **REQ-TRACE-207** — A sweep performed for a consuming surface SHALL use **the project's own layout**, never the toolchain's built-in defaults, which name this repository's roots and would be wrong for every other one — without which every card in a foreign workspace would show no implementation and no covering test, and a re-derived worklist digest would find nothing and refuse every approval as "the sites have moved".

- **REQ-TRACE-208** — Where a consuming surface cannot read the layout configuration, it SHALL log a **warning** describing the failure and carry on with an **empty sweep result**, showing no coverage anywhere. It SHALL NOT report a read failure to the user and SHALL NOT decline to display.

- **REQ-TRACE-209** — Requirements with no sweep entry — an unknown number, or one with no annotations — SHALL yield empty implementation and covering-test collections, never an error.

### Pass Progress Reporting

- **REQ-TRACE-210** — A pass SHALL report phases drawn from this closed set, encountered in this order: `reading` (the requirement source is being read), `checks` (the workspace's own check suite is running), `coverage` (the repository is being swept), `recording` (one verification is written per requirement), `adopting` (candidates are being moved by the completion gate). A pass SHALL report no phase outside this set and SHALL report nothing about how it goes about a phase.

- **REQ-TRACE-211** — Phase sequences SHALL be: verification — `reading`, `checks`, `coverage`, `recording`; adoption — `reading`, `checks`, `coverage`, `adopting`, `recording`. Recording SHALL come last in the adoption sequence: the verification that justified each move is written down **once the moves have already been made**.

- **REQ-TRACE-212** — Every progress report SHALL name its phase outright. A consumer SHALL never have to deduce the phase in progress from the order, count or shape of the reports it has received.

- **REQ-TRACE-213** — Progress SHALL be reported as plain values, in two kinds of report:
  - a **phase report** carrying the phase and the number of items that phase will report, where **0** states that the phase is one indivisible step. It SHALL be delivered **before** that phase's first item report, so a consumer always holds the denominator before it receives a position;
  - an **item report** carrying the phase, a label naming the item (a check's name, a requirement's identifier), a **1-based** position, the phase total, an optional detail, and the deadline in seconds currently applying to the item in progress, from which a countdown can be drawn.
  Where the wait budget is unlimited the deadline field SHALL be **absent** rather than carrying zero, so that a consumer can tell "there is no countdown to draw" from "no time remains". The stored-value convention under which zero denotes an unlimited wait belongs to the configuration setting alone (REQ-CONFIG-126, REQ-TOOLS-055, cited here by REQ-TRACE-467) and SHALL NOT reach this protocol.

- **REQ-TRACE-214** — Both callbacks SHALL happen on the thread running the pass. A host that must touch a user interface SHALL marshal for itself.

- **REQ-TRACE-215** — Dispatch SHALL be defensive and absent-by-default: a missing hook is skipped; a hook that raises is logged naming the hook and stepped over; and a pass running without a host SHALL perform **no reporting work whatsoever**, yielding a byte-for-byte identical report, identical stored records and identical writes to a pass that never had a progress layer. Nothing in the progress layer may alter what a pass concludes: a measurement that perturbs its subject is not a measurement.

- **REQ-TRACE-216** — Item-level reporting SHALL be wired as follows: `reading` — phase only, no total; `checks` — phase with the suite length, then one item per check emitted **as the check begins** rather than as it completes, since the fact worth showing is which check is executing right now; completion SHALL carry the position forward, so the final check does not sit one short of the total while the pass moves on; `coverage` — phase only, **no per-item progress**, so the repository sweep is a single opaque step even to the protocol; `recording` — phase with the number of verifications, then one item per written record.

- **REQ-TRACE-217** — A workspace that declares no checks SHALL receive an empty suite **together with a stated reason**, never a fabricated pass. An absence of checking and a clean result are two different findings, and only the second one constitutes evidence.

- **REQ-TRACE-218** — The seam SHALL NOT be shaped like any one surface: it SHALL be a protocol of plain values consumed by **at least two** independent hosts — the desktop worker and the project's own test suite, which drives the seam directly and not through any surface. A seam with only one consumer degenerates, without anyone noticing, into that consumer's private implementation detail, and a test suite that can only reach it through the desktop worker is not a second consumer. This requirement formerly named a programmatic embedding of the engine as the second host; that is withdrawn, because the product offers no embedding surface and no programmatic entry point (REQ-EVENTS-178), and a host that cannot exist cannot keep a seam honest. The obligation is unchanged in strength: two independent consumers, at least one of which is not a product surface.

- **REQ-TRACE-219** — Existing hosts SHALL stay unchanged. The verification seam that a test substitutes for SHALL retain its existing signature, so that a progress-reporting pass and a pass driven by a test double remain one and the same pass. Per-check progress already produced by the lower-level suite runner SHALL be adapted into `checks` items instead of a parallel mechanism being introduced alongside it, and a pass with no host SHALL leave the suite runner on precisely its usual path.

### Cancellation

- **REQ-TRACE-220** — Cancellation SHALL be a token safe to set from another thread, exposing a cancel operation, a cancelled predicate, and a checkpoint operation that raises a dedicated error whose message states that a requirement index refresh was cancelled and, optionally, where.

- **REQ-TRACE-221** — Cancellation exists for two reasons: a second refresh trigger may arrive before the first refresh has finished, and the user may dismiss the view mid-pass.

- **REQ-TRACE-222** — Checkpoints SHALL be placed **between one source and the next, and between one artifact and the next**. The worst-case waste from cancelling a refresh is therefore a single artifact read, not a whole traversal of the store. A read already under way SHALL NOT be interrupted part-way.

- **REQ-TRACE-223** — A cancelled pass SHALL NEVER blank the last good state: the previously published index still stands.

- **REQ-TRACE-224** — A fresh token SHALL be minted for each pass and SHALL NOT be carried over to another. The underlying signal is one-way and never clears, so a shared token would leave every pass after the first one already cancelled the moment it began.

- **REQ-TRACE-225** — Two refresh kinds SHALL exist: a deterministic-rules-only kind that reaches no analyst and creates **no** cancellation token (cards still move, because one propagation rule is owed on every refresh and costs no model call); and an analysing kind that runs every rule including impact analysis, clarification, migration planning and removal analysis, which is the only one worth cancelling. The **analysing** kind SHALL be the default for a caller that says nothing. Neither kind SHALL place a wall-clock bound on the engine read that backs a refresh, and that SHALL be a deliberate decision: the read runs off the interface thread (REQ-TRACE-337) so the surface never blocks, the board states that a refresh is in progress for as long as one is, the last good board stays on screen throughout (REQ-TRACE-338), and every external call the read makes is itself bounded (REQ-TRACE-201). A deterministic refresh SHALL therefore offer no stop control and no timeout; its cost is bounded by the store and the repository it reads.

- **REQ-TRACE-226** — A request to cancel SHALL return false when there is nothing to stop — no token, or nothing in flight — and true after signalling the token.

- **REQ-TRACE-227** — Cancellation SHALL NEVER abandon the pass: deterministic rules that have already been applied are not rolled back, the projection is still computed, and the result is still delivered. What a stop changes is only whether the caller waits out the outstanding judgements; it SHALL NOT change whether a board is produced.

- **REQ-TRACE-228** — A pass SHALL state, in the outcome it returns, what stopping cost: one sentence for each thing the pass did; whether it halted because it was asked to; the requirements left unjudged, divided into those beyond the depth the pass would go, those excluded by policy and those it did not reach before being stopped; and whether this workspace permits the analysis at all. Those lists SHALL be reported only: they SHALL NOT alter what a later pass does, and a later full pass SHALL take the same requirements up again from what is already stored.

- **REQ-TRACE-229** — A pass SHALL run on a worker and SHALL NEVER block the caller. Starting one while another is in flight SHALL return false rather than queueing. A call with no workspace at all SHALL emit an "unavailable" reason distinct from "a workspace whose store went unread".

### Board Surface: Columns and Delivery States

- **REQ-TRACE-230** — The requirements board SHALL be a primary view in the application's navigation rail, reachable by the same keyboard path as every other primary view, restored as the active view after a restart, with a navigation glyph that renders at the same perceived size at 100 %, 125 % and 200 % display scaling. Its navigation entry SHALL carry an accessible name naming the view it opens.

- **REQ-TRACE-231** — Given a workspace with no requirement source, the view SHALL present an empty state that says what a requirement source is and describes how one is configured — **never a blank pane**.

- **REQ-TRACE-515** — Given a configured requirement source whose documents the store **rejected**, the view SHALL state that the source does not parse and SHALL distinguish that state from the empty state of REQ-TRACE-231, which says the source holds no documents; a store that will not parse is not a store nobody has written to, and a reader told the second of those about the first is told something false. It SHALL name **each** rejection in the engine's own words — the document and what was rejected in it (REQ-TRACE-022) — rather than a count alone, since the correction is made in the document named. Where the store parses only in **part** the board SHALL be drawn from what parsed **and** SHALL state, on the board itself, how many documents were rejected together with those same errors: REQ-TRACE-026 makes a rejected document contribute nothing at all, so a board silently missing a requirement is otherwise indistinguishable from a board carrying every one. Neither statement SHALL be offered as a substitute for the check of REQ-TRACE-508, which remains the whole report; what the board owes is that the condition is never silent where a person is looking for their requirements.

- **REQ-TRACE-232** — On the delivery axis the board SHALL render **one column per delivery state**, in this fixed order, with these column tokens: `backlog`, `ready`, `running`, `review`, `needs-update`, `done`. The order SHALL be fixed and SHALL NOT be derived from data.

- **REQ-TRACE-233** — A `blocked` column token SHALL exist, but SHALL deliberately **not** count as one of the delivery stages, because being blocked describes a condition rather than a point reached along the pipeline. Under the model a blocked requirement continues to belong to the state it occupied when it became blocked, and clearing the blocker SHALL send the card back to precisely that state and to no other — a round-trip invariant. Movement in each direction is a special case: every column may transition into `blocked`, and the only exit from `blocked` is a return to the origin state.

- **REQ-TRACE-234** — Each column header SHALL state its count, rendered as `<Label> · <count>`. Non-identifier column keys SHALL be title-cased by splitting on hyphens; keys that are project-supplied identifiers (epic, source) SHALL be printed as-is.

- **REQ-TRACE-235** — Every requirement the projection returns SHALL appear in **exactly one** column (partition invariant), and on every axis the sum of the column counts SHALL equal the number of visible cards.

- **REQ-TRACE-236** — A column holding nothing SHALL say what would belong in it rather than showing bare space. On the delivery axis the sentence SHALL be specific to the column; on every other axis a single sentence covering the axis SHALL serve each of its columns.

- **REQ-TRACE-237** — At the minimum window size REQ-SHELL-022 fixes — which this requirement relies on for the figure and does not restate — no column, card or header SHALL clip and no action SHALL become unreachable. The columns area SHALL scroll **horizontally** rather than clipping; each column SHALL scroll **vertically**.

- **REQ-TRACE-238** — Column widths SHALL be bounded: an open column SHALL be at least **276** points wide (a card's own minimum plus margins plus its scroll bar) and at most **340**. Spare width SHALL be spent up to the cap and no further, because a card title read across several hundred points is not a card anybody scans. At the minimum window size with every column unfolded, every column SHALL still be at least the minimum and the columns area SHALL report a positive horizontal scroll range.

- **REQ-TRACE-239** — A board carrying several hundred requirements SHALL be displayed without the interface ceasing to respond to input, and the work of displaying it SHALL be bounded by what is on screen rather than by how many requirements the store holds (REQ-TRACE-358). Putting a board on screen once the engine has answered SHALL occupy the interface thread for no more than **100 ms**, measured at the minimum supported window size under the reference conditions of REQ-TRACE-088, and that figure SHALL NOT grow with the size of the store.

- **REQ-TRACE-240** — The board SHALL surface a **blocked summary** reachable without scrolling any column — positioned above the columns scroll area. It SHALL:
  - carry a heading stating the number of blocked requirements;
  - list one row per blocked requirement, labelled by identifier followed by the engine's own reason, without repeating the word "blocked" that the heading already said;
  - carry every engine reason verbatim in its accessible description;
  - offer two controls per row — first the move that addresses the block (returning the requirement to the state it came from, which is its only legal move), then navigation to the card;
  - on navigation, open the target column if it is folded, select the card and give it focus.
  The heading SHALL always state the **true total**, however many rows are shown. At most **20** rows SHALL be listed; where more requirements are blocked, one final row SHALL state how many were not listed and SHALL, when activated, filter the board to the blocked requirements, so the remainder stay reachable in a single action. A strip that ran to hundreds of rows would push the columns off the screen it sits above.

- **REQ-TRACE-241** — Blocked presentation SHALL NOT rely on colour alone: text or a glyph SHALL carry the condition too. Whether blocked cards *also* gather into a column of their own SHALL be governed by a display preference; toggling it SHALL leave the delivery model untouched.

### Requirement Cards

- **REQ-TRACE-242** — Seven facts SHALL appear on every card, with no card omitting any of them: the identifier; the title; the lifecycle badge; the delivery condition, needs-update included; the evidence indicator; the number of execution units; and how long ago the most recent run happened.

- **REQ-TRACE-243** — A card SHALL show these facts when present and omit them cleanly when absent, with no empty placeholders, in this fixed order: priority, parent epic, source, dependencies, assigned agent, last change.
  - Priority SHALL be omitted when the engine's priority token means "none".
  - The dependency list SHALL join identifiers and cap the list at **4** before an "and N more" tail, so a card cannot grow with its dependency list.
  - Last change SHALL carry the relative age as its value and the absolute moment as an attached detail; a card that omitted the fact SHALL NOT be able to carry the moment anyway.
  - Source SHALL be on the **card**, not only in the detail view, because the source filter and the source grouping axis read it off the card; without it both dimensions would be present in the interface and permanently empty.

- **REQ-TRACE-244** — Exceptional facts SHALL be stated in words rather than encoded only in colour: that the specification changed, that the requirement is blocked, and that evidence is failing. "Specification changed" SHALL appear exactly when the requirement's current hash differs from its satisfied hash.

- **REQ-TRACE-245** — Card alerts SHALL be emitted in this fixed order: (1) the specification-changed sentence; (2) the delivery state's blocked reason, labelled as blocked; (3) one per recorded blocker, labelled as blocked with its kind; (4) one per blocking evidence obligation, distinguishing a failing obligation from a missing one; (5) an unavailability reason when availability is not "available" and a reason exists; (6) an awaiting-review sentence when a review exists and its specification moved while the run was in flight.

- **REQ-TRACE-246** — Alerts SHALL be de-duplicated **on the sentence, not on the line**: any leading blocked label SHALL be removed before two alerts are compared. One and the same engine sentence arrives at the projection along two routes — as the reason attached to the delivery state, and again as the reason held on the blocker record raised for it. Where the two differ in spelling, **the earlier one SHALL be kept**. De-duplication SHALL happen in the translation layer, ahead of both painting and announcement, so the painted alerts, the announced accessible description and the board's blocked summary agree by construction.

- **REQ-TRACE-247** — Each alert SHALL carry a severity glyph as well as a colour, from a three-value set distinguishing failure, stopped and attention, because the palette's "stopped" and "attention" hues read alike. Alert lines are **words** and SHALL therefore meet a **4.5:1** contrast floor, while saturated status marks owe **3:1**.

- **REQ-TRACE-248** — Every colour a card paints SHALL be the one the theme in force prescribes at the moment of painting. A card built before a theme was chosen, and a card already on screen when the theme changes, SHALL both show the current theme's colours without being rebuilt.

- **REQ-TRACE-249** — The execution line SHALL always be a sentence, never a blank: zero units states that there are none yet; one unit and N units are spelled distinctly. The last-run half SHALL read as the run's age with its outcome in parentheses, or state that it has never run; when the age is unavailable the space SHALL collapse rather than leaving a gap. The two halves SHALL be joined by a middot separator.

- **REQ-TRACE-250** — Relative age SHALL be rendered from an **injected** clock, never one read inside the renderer, and SHALL follow these thresholds: no timestamp yields an empty string; a missing reference time or a timestamp lacking zone information yields the absolute stamp instead; a negative delta or under **60 seconds** reads as "just now"; under **1 hour** in minutes; under **1 day** in hours; otherwise in days. Singular and plural SHALL be distinguished.

- **REQ-TRACE-251** — The absolute moment SHALL be rendered in **local** time with a minute-resolution date-and-time stamp followed by the UTC offset, the offset appended only when the timestamp carries zone information — a zone-naive timestamp is printed as-is, because inventing an offset would be a guess. The card SHALL paint the age and offer the moment through its tooltip and accessible description; the detail view and the revision-history panel SHALL print both.

- **REQ-TRACE-252** — Health SHALL be exactly one of seven words: `healthy`, `needs-update`, `incomplete-traceability`, `verification-failed`, `blocked`, `superseded`, `deprecated`. Each word SHALL be shown together with a plain-English gloss defining **that word**, not describing the requirement it has been applied to, and with a sentence stating that health is derived from three inputs — the requirement's lifecycle, its delivery state and its evidence — and is set by nobody directly.

- **REQ-TRACE-253** — The card SHALL additionally explain, in words: what the evidence counts mean and that "not applicable" means the requirement does not owe that kind of evidence at all; and what an execution unit is, noting that a requirement nobody has released has none. The source fact SHALL explain that it names the configured requirement source the requirement was read from.

- **REQ-TRACE-254** — Health, evidence state, delivery state and epic progress SHALL be displayed exactly as the projection supplied them. None of the four SHALL be recomputed, adjusted, rounded or defaulted before display, and the health shown on a card SHALL be identical, character for character, to the health the projection reports for that requirement.

- **REQ-TRACE-255** — Selection SHALL be stated in a **word** on the card, with an explanation that the board's controls act on this requirement — not carried by a tint alone, which is both a colour-only signal and genuinely hard to find by eye on a board of dozens of cards. Giving a card focus SHALL set the selected requirement: focus **is** selection.

- **REQ-TRACE-256** — A card value SHALL additionally carry, for the board's use without opening the requirement: the state to which a blocked requirement would return, which is the sole destination the user is permitted to drag a blocked card to; the specification hash as it currently stands, so that any action can record which version it operated on; and the identifiers of the dependencies currently holding it, which the drag-time release indicator needs.

- **REQ-TRACE-257** — Every card element SHALL have an accessible name; the card as a whole SHALL be keyboard focusable and reachable in logical order; and card text SHALL stay readable both at the minimum window size and at 200 % scaling.

### Evidence Indicator

- **REQ-TRACE-258** — Each card SHALL carry an indicator divided into one segment per evidence obligation the requirement owes, ordered as the projection orders them, each segment coloured for that obligation's state: satisfied and verified; recorded but stale or unverified; failing verification; or missing or not owed. The sequence of segment states SHALL equal the sequence of obligation states the projection reports, position for position. The set of obligation kinds SHALL be **closed** and SHALL be exactly these three, in this fixed order: `implementation-trace`, owed where the requirement declares `trace: required`; `covering-test`, owed where it declares `test: required`; and `verification`, owed where the requirement is approved and the workspace declares a check suite. A card therefore carries at most three segments, and how many it carries SHALL be predictable from that requirement's own obligation flags and lifecycle. A fourth kind added to the engine SHALL fail the presentation lookup immediately rather than quietly receiving a fallback segment, exactly as REQ-TRACE-446 requires of blocker kinds.

- **REQ-TRACE-259** — The indicator SHALL explicitly **not** be a count of annotations, because a count would read as complete for a requirement whose tests fail. A requirement with complete traces but a failing test SHALL render a failing segment, not a wholly satisfied indicator.

- **REQ-TRACE-260** — Where a requirement owes **no** evidence obligations at all, its indicator SHALL be drawn **empty**, accompanied by a stated reason, and SHALL never resemble a satisfied one. Of everything this widget could render, an indicator that looks complete when in fact nothing was ever owed would mislead the reader most.

- **REQ-TRACE-261** — The indicator's accessible description SHALL name **every segment and its state**, in the form `<Obligation>: <State>`, and the card SHALL print an equivalent summary beside it, so that someone who cannot separate the alert hues reads exactly the same facts. Every indicator colour SHALL meet a **3:1** contrast floor against the card ground. Segment colours SHALL be taken from the **theme's semantic status tokens** — the same tokens the alert severities of REQ-TRACE-247 draw on — and SHALL NEVER be written as literal colour values inside this widget, so that a change of theme reaches the indicator without it being rebuilt (REQ-TRACE-248). The normative constraints on those colours are this contrast floor and the rule that colour never carries a fact on its own; their concrete values belong to the design system rather than to this specification.

- **REQ-TRACE-262** — Each segment SHALL carry its obligation kind, label, state, state label, the obligation's reason when the engine gave one, and whether the obligation level is required. The kind SHALL be one of the three tokens enumerated in REQ-TRACE-258 and the state one of the four states named there.

- **REQ-TRACE-263** — The indicator's segments SHALL be arranged so that no segment overlaps its neighbour, so that the segments taken together close the ring, and so that an angular gap separates each from the next — several obligations reading as several segments rather than as one ring painted in several colours. The first segment SHALL begin at twelve o'clock. A clear margin SHALL be left between the segments and the edge of the indicator, wide enough that the focus indication never paints over a segment.

- **REQ-TRACE-264** — The indicator SHALL be its own tab stop with a strong focus policy; it SHALL NOT be a hover-only affordance.

### Evidence Detail

- **REQ-TRACE-265** — Activating the indicator SHALL open the evidence view for that requirement. It SHALL contain: each implementation site and each covering test given as a **file and a line**, together with that site's pass state; the most recent verification, reported with its **verdict**, the **commit** it ran against and the **requirement hash** it was taken over; and the records of execution and of integration. The site listing SHALL be **complete**: every implementation site and every covering test SHALL be listed, ordered by repository-relative path and then by line, beneath a stated count per kind, and the view SHALL **scroll rather than paginate or truncate** — a site the view declined to show is a site nobody checks.

- **REQ-TRACE-266** — Each listed site SHALL be activatable and SHALL open its file **at its line**, using the projection's own path and line rather than a reconstruction. Each listed run SHALL open the session that produced it. The governing design constraint SHALL be that no more than two actions separate noticing a problem on the board from having the offending file open in front of you.

- **REQ-TRACE-267** — The evidence view SHALL be openable with a pointer and from the keyboard while the card holds focus. Where a requirement's evidence is incomplete, the view SHALL **name what is missing** instead of presenting an empty list.

- **REQ-TRACE-268** — A site control's accessible name SHALL state the site kind, its address as path and line, and its state.

- **REQ-TRACE-269** — What the evidence view shows SHALL be determined entirely by two values the board already holds for that requirement: its card and its detail. The same two values SHALL always yield the same content, with no file read, no repository access and no engine call of its own. Activating a listed site or a listed run SHALL be reported as a request — open this file at this line, or open this session — and the navigation SHALL be carried out by the surrounding application rather than by the view.

- **REQ-TRACE-270** — Exactly three evidence states SHALL mean that something was actually recorded: `satisfied`, `stale` and `failed`. That distinction SHALL govern only what the evidence action offers to do, and SHALL never be used to decide whether a requirement passes.

### Requirement Detail View

- **REQ-TRACE-271** — Activating a card SHALL open a detail view carrying **exactly five** sections, every one of them always present and each with its own empty message:
  1. **Requirement** — the identifier and title, the description, which source it was read from and at what path within it, the hash it currently holds, its lifecycle and its delivery state.
  2. **Relations** — the parent epic, the children, the derived requirements, what it supersedes, what supersedes it, and its dependencies.
  3. **Execution** — the execution units, runs both active and completed, and the worktrees, branches and commits belonging to them.
  4. **Traceability** — implementation sites, test sites, missing evidence, stale evidence.
  5. **Verification** — test results, build results, the requirement-check result, and the last successful verification.

- **REQ-TRACE-272** — Each of the five sections SHALL be **built on every render, including when it holds nothing**: to a reader, a section that was omitted looks exactly like a section that was never written. A section counts as empty when it carries no facts, no links, no lines and no body text, and in that case SHALL display the empty message declared for it. Sections SHALL degrade individually, not as a whole view.

- **REQ-TRACE-273** — Every related requirement SHALL navigate to its own detail view. A **dangling** relation SHALL be shown as unresolved with its target identifier rather than hidden.

- **REQ-TRACE-274** — The relation vocabulary SHALL cover at least these twelve tokens with display labels: `parent`, `children`, `derived-from`, `derived-requirements`, `supersedes`, `superseded-by`, `depends-on`, `blocks`, `refines`, `refined-by`, `conflicts-with`, `related-to`.

- **REQ-TRACE-275** — The description SHALL be rendered **from the source**, never from a local copy: there is no second requirement repository.

- **REQ-TRACE-276** — A card and the detail view opened from it SHALL report the same lifecycle, the same delivery state, the same health and the same evidence values for that requirement; the two SHALL never disagree. The detail view SHALL additionally carry the description, whether the requirement can be edited, the source identifier and the path within it, the blockers, any outstanding change-work offer, the revisions, whether revision history is available and if not why, the priority, the epic, and whether the requirement is itself an epic.

- **REQ-TRACE-277** — The detail view SHALL be fully keyboard operable and SHALL close with the escape key, returning focus to the control it was opened from. Its accessible names SHALL include the source path and the current hash, and relation controls SHALL name the relation and its target.

- **REQ-TRACE-278** — The detail view SHALL present the requirement's revision history as an **ordered list, oldest to newest, with the current revision marked**. Each entry SHALL carry four things: that revision's hash; the run which implemented it; the commit in which it landed; and how delivery ended for it. A revision that was never delivered SHALL still appear, with its outcome stated rather than being left out. Activating a run SHALL reach its session; activating a commit SHALL reach the version-control view.

- **REQ-TRACE-279** — The revision history SHALL be produced by the engine, which joins the source's revisions against the locally recorded hashes and the delivery records. It SHALL NOT be reconstructed by the presentation layer: a card holds only two hashes and therefore cannot account for a requirement that has had three versions, and a surface that filled the gap by inference would give a different answer to "which version was actually built" than the agents give.

- **REQ-TRACE-280** — The history panel SHALL have **three** states, not two: available (the ordered list); unavailable, with a sentence stating that source history was not reported for this requirement, because only the engine can distinguish "this source keeps no history" from "this requirement has one revision"; and **pending**, with a sentence stating that the history is currently being read. The pending state is needed because the detail view opens against the board's projection, and revision history is not part of that projection; it is fetched off the interface thread, and reporting "unavailable" during that interval would be a false answer.

### Epic Cards

- **REQ-TRACE-281** — An epic SHALL be a requirement with children and SHALL behave on the board as a **grouping element**, not a work item someone could drag into a running state.

- **REQ-TRACE-282** — An epic card SHALL summarise its children on five counts: how many children it has; how those children are distributed across the delivery states; the proportion of them carrying an implementation trace; how many runs are executing beneath it; and how many blockers stand against them. Its progress line SHALL read `<done> of <total> requirements done`, the total counting only children that are not deprecated. Where the epic has deprecated children, the line SHALL carry a suffix stating how many were left out, so the child count and the progress total can be reconciled. The traced proportion SHALL be computed over the **same population** as the progress total — the children that are not deprecated — so that the two figures printed on one card always describe the same set of requirements.

- **REQ-TRACE-283** — An epic card SHALL expand to its children or filter the board to them, reaching them **without leaving the board**. Filtering to an epic SHALL leave on screen the children **plus the epic itself** as context and nothing from outside the epic, and the filter summary SHALL state that an epic filter is active and name it.

- **REQ-TRACE-284** — An epic card SHALL offer **no delivery action of its own**, and the container that would hold such actions SHALL be **omitted entirely rather than rendered in a disabled form**. That way a test can assert against the seam itself instead of asserting that one particular control happens not to be there. An epic's own state SHALL be derived from the states of its children.

- **REQ-TRACE-285** — An epic with **no children** SHALL state that rather than reporting complete progress.

- **REQ-TRACE-286** — An epic card SHALL be a distinct widget kind from a requirement card.

### Sorting, Filtering and Grouping

- **REQ-TRACE-287** — Three sort orders SHALL be offered, the first being the default: priority then identifier; identifier; health then identifier.

- **REQ-TRACE-288** — The priority order SHALL be exactly `Critical`, `High`, `Normal`, `Low`, and a card whose priority is not one of those SHALL rank **after** the last of them, deterministically — never randomly.

- **REQ-TRACE-289** — Identifier ordering SHALL be digit-run aware, so that `<PREFIX>-9` sorts before `<PREFIX>-10`, which lexicographic ordering gets wrong. There SHALL be **one** implementation of this ordering shared by the engine and the board rather than two that agree by luck.

- **REQ-TRACE-290** — Filtering SHALL offer exactly six dimensions: free text, epic, source, lifecycle, health and priority. A filter is active when any dimension is non-empty.
  - Free text SHALL match case-insensitively as a **substring** of either the identifier or the title.
  - The epic dimension SHALL match either a card's epic fact **or**, for an epic card, its own identifier.
  - Source, lifecycle, health and priority SHALL match by **exact** equality against the card's displayed value.

- **REQ-TRACE-291** — The active filter SHALL be described in a fixed part order — text, epic, source, lifecycle, health, priority — and SHALL emit a clearly distinguishable statement when no dimension is set, so that a board narrowed by a filter can never be read as a board with nothing on it.

- **REQ-TRACE-292** — Sorting, filtering and grouping SHALL be **display-only**: they change no delivery state, no scheduling order, and they write nothing. An active filter SHALL be visible and clearable in one action, and a filter matching nothing SHALL say so and offer to clear itself.

- **REQ-TRACE-293** — Six grouping axes SHALL be offered: `delivery` (the default), `health`, `lifecycle`, `epic`, `priority`, `source`. On every one of them the board SHALL emit a column for each distinct value and put that column's count in its header, in the same manner as the delivery axis.

- **REQ-TRACE-294** — The **set of columns SHALL be supplied by the projection** and SHALL never be read from a duplicate table maintained inside the presentation layer, which makes it impossible for an axis to contradict the values printed on the cards. Changing the axis SHALL redistribute the existing cards; it SHALL NOT re-query the engine and SHALL NOT write anything.

- **REQ-TRACE-295** — Closed axes SHALL emit **every** value, populated or not. Open axes — those whose values the project invents, namely epic and source — SHALL emit only the values the project actually has, sorted by identifier ordering, with an **unset** bucket appended **last** and only when something needs it. A requirement with no value for the chosen axis SHALL land in that stated column rather than disappearing.

- **REQ-TRACE-296** — Axis value derivation per card SHALL be: delivery axis, the card's delivery state; health axis, its health; lifecycle axis, its lifecycle; priority axis, its priority fact case-folded or a literal "none" when absent; source axis, its source fact; epic axis, the card's own identifier when it is an epic, else its epic fact. Each derived value SHALL be assertably equal to the value the engine computes for that card on the same axis over the same projection, so that no axis change can place a card in a column the engine would not have chosen. It follows — and SHALL be stated as intended behaviour rather than left as a consequence of the rule — that on the epic axis an epic card lands in the column named by its **own** identifier, alongside its own children.

- **REQ-TRACE-297** — **Drag-and-drop SHALL remain a delivery-state action.** On any non-delivery axis a card SHALL NOT be draggable between columns, and the refusal SHALL be **stated rather than silent**. The keyboard move control SHALL keep working on every axis, since it targets delivery states directly. The axis definition SHALL carry a draggable flag encoding this, because dragging into a column of a non-draggable axis would promise a write that cannot happen.

- **REQ-TRACE-298** — The blocked value SHALL keep a **pinned column on the delivery axis** and SHALL be an ordinary value elsewhere.

- **REQ-TRACE-299** — Filters and sort order SHALL compose with every axis unchanged. That composition SHALL hold in the degenerate case too: switching the grouping axis to a dimension a filter is already narrowing SHALL **preserve** the filter rather than clearing it, so that the board shows the one populated column that filtered value produces, together with whatever empty columns the axis rules of REQ-TRACE-295 require, and the filter summary SHALL continue to state that a filter is in force. Changing the axis writes nothing and SHALL NEVER alter a filter.

- **REQ-TRACE-300** — Grouping axes whose values the project supplies SHALL stay usable at the column counts a real store produces: over a store of roughly 1500 requirements the epic axis yields on the order of several dozen populated columns, while a closed axis can yield no more than its own vocabulary. The board SHALL therefore remain scrollable, foldable and keyboard-operable with several dozen populated columns on screen. The supported bound SHALL be **100** populated columns: up to that number every guarantee stated in this document holds unchanged. Beyond it the board SHALL still render correctly and remain operable, but no responsiveness budget SHALL be claimed, and the board SHALL NEVER truncate, hide or refuse a column on account of how many there are.

- **REQ-TRACE-301** — Persistence scope SHALL be split deliberately: filter, sort order, grouping axis and the blocked-column display setting are **global** (a property of the person); **column folds are per workspace** (a property of the project); permission and wait preferences are a property of this installation and MUST NOT be written into repository-carried configuration.

- **REQ-TRACE-302** — Where the stored sort order or grouping axis names something this build no longer offers, the board SHALL revert to the default for that setting instead of attempting to group by a value it has no renderer for.

### Collapsible Columns

- **REQ-TRACE-303** — A column holding no cards SHALL be **folded**, meaning it collapses to a narrow rail that still bears the column's heading and its count. Folding SHALL additionally be available as a deliberate user choice for any column, on **every** grouping axis, the delivery axis included.

- **REQ-TRACE-304** — Fold precedence SHALL be, in order:
  1. **An explicit user decision takes priority over the emptiness rule**, whichever way it points, and stands until that user revises it: a column folded by hand remains folded even after cards arrive in it, and a column unfolded by hand remains unfolded even while it holds nothing.
  2. Failing that, a column SHALL be folded **for precisely as long as it holds nothing**, and this condition SHALL be re-evaluated at **every** board update. Invariant: no card may land in a column that remains collapsed.
  3. **First-run exception**: where no card has yet moved out of the pipeline-entry columns — the first column together with the blocked condition, being where a requirement sits before anything at all has been done with it — the board SHALL open showing the pipeline **in full** rather than collapsing every downstream column to a rail. As soon as one card enters the pipeline proper, rule 2 takes over again. A deliberate fold by the user outranks this exception as well.

- **REQ-TRACE-305** — The rationale to be preserved: automatic folding pays for itself only when the distribution of cards is genuinely uneven. A board on which no column holds anything is not uneven — it is a project that has not begun — and the shape of a pipeline nobody has started is precisely what a first-time reader needs to be able to see.

- **REQ-TRACE-306** — The fold decision SHALL be a pure function of the column model and a flag controlling whether emptiness folds: a recorded user decision returns that decision; otherwise the column is folded when the flag is set and the column holds nothing.

- **REQ-TRACE-307** — Clicking a column's **heading** SHALL fold it and clicking the folded **rail** SHALL unfold it. There SHALL be **no separate control** and **no gesture only a mouse can make**. Neither action SHALL write a delivery record. Unfolding SHALL realise the column's visible band (REQ-TRACE-358) **within the same update that unfolds it**, never deferred to a later repaint, so that an expanded column is never observable empty or half-painted; folding SHALL release that column's card widgets in the same update, since a folded column holds none (REQ-TRACE-311).

- **REQ-TRACE-308** — A folded rail SHALL display the **heading and count that the open column would show**, and, where the column is empty, the very same sentence describing what belongs in it — carried on the rail's tooltip and on its accessible description. What folding removes is the cards, never the information.

- **REQ-TRACE-309** — Text on a folded rail SHALL be painted **upright and never rotated**. A heading too long for the rail SHALL wrap onto at most **2** lines and then elide, and the complete untruncated text SHALL remain available through both the rail's tooltip and its accessible name.

- **REQ-TRACE-310** — Rail width SHALL be measured in **average characters of the rail's own font** — **8** of them, that being the width at which the longest of the ordinary delivery labels still fits on a single line — rather than in points, so that raising the display scale or applying a screen magnifier enlarges the rail in step with the text inside it. A folded column's margin SHALL be **4** points, against an open column's margins of **10** on every side, because an open column's margin would be most of a rail's width.

- **REQ-TRACE-311** — A folded column SHALL hold **no realised card widget**. Folding a board the size of a whole store SHALL therefore cost strictly less than rendering that board open.

- **REQ-TRACE-312** — Folds SHALL be remembered **per workspace**, keyed by the workspace's resolved absolute path with a literal fallback key when the board has no workspace. A fold recorded in one workspace SHALL NOT reach another.

- **REQ-TRACE-313** — The persisted fold value SHALL be a **single JSON object string** whose sorted keys map a column key to a boolean. Storing one settings entry per column is not viable: the settings backend reads a path separator as a nesting delimiter, and a column key on the epic or source axis is an arbitrary project-supplied string that may contain one. Because the value is written whole, concurrent writers SHALL be resolved by **last writer wins**, with no merge, no locking and no reconciliation: a reader SHALL always observe one window's complete set of decisions and never a blend of two. Two windows open on one workspace are therefore expected to overwrite one another's fold decisions, which costs a fold and can never corrupt the stored value.

- **REQ-TRACE-314** — **Only the user's decisions SHALL be stored**, never the resulting fold set — that is what lets both rules coexist.

- **REQ-TRACE-315** — Reading stored fold state SHALL never raise. A stored value that cannot be parsed, or that is not an object, SHALL yield **no folds at all**; a member whose value is not a boolean SHALL be dropped on its own while the rest are kept. A board whose stored value came from a later build SHALL therefore open under the emptiness rule rather than fail to draw.

- **REQ-TRACE-316** — The stored fold set SHALL be **pruned** to the columns the board still has, so a workspace does not accumulate a dead entry per epic or source anybody ever renamed. Pruning SHALL be confined to columns whose keys are **project-supplied** — those of the epic and source axes — since that is the only place entries accumulate without bound. A decision recorded against a column of a **closed** vocabulary SHALL be retained even while that column is absent from the board, so that a column withdrawn by a display preference — the blocked column, whose presence the blocked-column setting governs, being the concrete case — comes back carrying the decision the user last made about it.

- **REQ-TRACE-317** — While a dragged card **hovers** a folded column, that column SHALL open, exposing both the drop target itself and the statement of whether it can be reached and why. It SHALL return to its folded form once the drag finishes.

- **REQ-TRACE-318** — From the moment a card is lifted out of its column, **every** rail on the board — not merely the one beneath the pointer — SHALL state its own answer **using the engine's wording unaltered**, and SHALL claim enough width to display that wording for the duration of the drag. A glyph on its own refuses without giving a reason, and putting the reason in a tooltip would confine it to users with a pointer or a screen reader. For the duration of a drag each rail SHALL grow by **1.5** lines of height and SHALL expand to the minimum width of an open column; when the drag finishes the borrowed width SHALL be surrendered **in full**. That widening SHALL NOT be animated: it SHALL take effect in the update that begins the drag and be surrendered in the update that ends it, so the reason is legible for the whole of the drag rather than arriving part-way through it.

- **REQ-TRACE-319** — A folded rail SHALL paint a first-line glyph distinguishing three situations: idle; drag in progress with this column reachable; drag in progress with this column refused. A visible hint label SHALL carry the **full sentence** alongside; the glyph SHALL NOT be allowed to stand alone. On drag cancellation the glyph SHALL return to idle and the rail's accessible description SHALL return to the empty-column sentence.

- **REQ-TRACE-320** — The column heading SHALL be a control whose accessible name states the label, the count and the fold action; the folded rail's accessible name SHALL state the unfold action and name the column. The rail SHALL take keyboard focus and unfold from the keyboard. Folding a column that contains the focused widget SHALL move focus to the rail: focus left inside a folded column is a defect.

- **REQ-TRACE-321** — Acceptance: on any axis, once at least one card has moved beyond the pipeline-entry columns, a board whose middle columns hold nothing SHALL open with exactly those columns folded and the remainder open; a folded column receiving its **first card SHALL be open by the next board update**, except where the user folded it deliberately; at the minimum window size the board SHALL stay usable with no rail text clipped; and reopening a workspace SHALL restore the fold state the user left there, while a different workspace SHALL open with whatever fold state was left in it.

### Relationship Graph

- **REQ-TRACE-322** — The board SHALL offer a **graph presentation** centred on one requirement and covering what surrounds it: its relations to other requirements, its implementation sites and its covering tests. **Every node SHALL display its own health**, and the whole graph SHALL be drawn from the projection and nothing else. The rationale to be preserved: during impact analysis, during an audit and on any large or inherited codebase, the question being asked is what depends on this requirement, not which column it currently occupies.

- **REQ-TRACE-323** — Node depth SHALL be **bounded and the bound stated**, never silently truncated. The depth SHALL be clamped to a floor of **1** and a ceiling of **3**, with a default of **2**. The depth control SHALL have that range and initial value, an accessible name naming it as the graph depth, and an accessible description stating how many relation steps around the centre are shown and the maximum. The depth selection SHALL **not** be persisted: the graph SHALL open at the default depth every time it is opened, depth being a property of the question being asked at that moment rather than of the person, and the persisted display settings of REQ-TRACE-301 SHALL NOT be extended to cover it.

- **REQ-TRACE-324** — The bound SHALL be stated in one of two forms: when nothing is left unexpanded, that the current depth of the maximum has everything in view fully expanded; otherwise, the current depth of the maximum followed by the identifiers whose relations are not expanded here and an instruction to select one to re-centre on it. That list SHALL name at most **four** identifiers before an "and N more" tail.

- **REQ-TRACE-325** — The unexpanded set SHALL be computed as: nodes at exactly the bound depth, resolved, that have relations, at least one of whose targets is not already in the node set.

- **REQ-TRACE-326** — Four node kinds SHALL exist: requirement, epic, implementation and test. A node SHALL be **navigable** — selecting it re-centres the graph — only when its kind is requirement or epic **and** it is resolved. A node SHALL carry its identifier, kind, label, depth, health label, state label, whether it is resolved, and, for evidence nodes, its path and line.

- **REQ-TRACE-327** — The graph SHALL be **navigable**: selecting a node re-centres on it and **restates what is now in view** — a summary naming the centre and the counts of requirements (requirement and epic nodes summed), implementations and tests, plus the current depth.

- **REQ-TRACE-328** — The graph SHALL be reachable and operable by keyboard, with node controls as focusable elements laid out in depth columns, and SHALL carry a **textual alternative** listing exactly the same edges in the same order the columns show them, stated as such in the list's accessible description. Node sentences SHALL name the label, mark an unresolved node as unresolved, and append the health label, falling back to the state label. Edge sentences SHALL read as source, relation, target.

- **REQ-TRACE-329** — The centre's relations SHALL come from its **detail** — the projection's complete answer for one requirement, dangling edges included. Deeper levels SHALL use the epic relation the board's own cards carry — the parent epic fact, plus children found among cards whose epic fact names this identifier — which is exact but narrow. **Nothing SHALL be inferred from a truncated summary.**

- **REQ-TRACE-330** — A relation target with no card SHALL be rendered as an unresolved node whose label is the bare identifier and whose health label states that it is not in this requirement store. It SHALL be **shown, not hidden**.

- **REQ-TRACE-331** — Implementation and test nodes SHALL be attached **only at depth 1**, **only for the centre**, and **only when a detail is present**. A node identifier SHALL be composed of the site kind and its address; the edge's relation label SHALL be the site's own label.

- **REQ-TRACE-332** — Traversal SHALL be breadth-first from the centre, one level per iteration up to the bound, with **first-seen depth winning** (a node already placed is not re-added at a deeper level), duplicate edges suppressed, and the walk stopping early when a level reaches nothing new.

- **REQ-TRACE-333** — The graph surface SHALL carry accessible names for the graph itself, for the contents summary, for the statement of the depth bound, for the node area and for the edge list, together with a control back to the board that names the board as its destination. No graph content and no contents summary SHALL be presented before a centre has been chosen, a change of theme included.

- **REQ-TRACE-505** — The graph SHALL be bounded by **node count** as well as by depth, and that bound SHALL be stated rather than silently applied. At most **50** neighbours SHALL be admitted for any one node at any one level, taken in the identifier order of REQ-TRACE-289 so the selection is deterministic and identical on every read of an unchanged project. A node whose neighbours were cut off in this way SHALL be reported among the unexpanded set of REQ-TRACE-324, and the statement of the bound SHALL additionally say how many neighbours were left out and that re-centring on that node brings them into view. Evidence nodes (REQ-TRACE-331) SHALL be admitted under the same per-node bound, implementation sites and covering tests each taken in path-then-line order.

### Live Refresh and Refresh Kinds

- **REQ-TRACE-334** — The board SHALL subscribe to the engine's evaluation results and repaint **only the cards those results touch**, in place. No manual refresh SHALL be required and **the board as a whole SHALL NOT be reconstructed**. An evaluation whose outcome differs for exactly one requirement SHALL cause exactly one card to change.

- **REQ-TRACE-335** — Four things SHALL survive an update untouched: which card is selected, where each column is scrolled to, what is expanded, and any detail view currently open. Where an evaluation completes while the detail view is showing, that view SHALL be refreshed where it stands rather than closed and reopened.

- **REQ-TRACE-336** — The board SHALL **state when it last evaluated** and offer an explicit refresh, printing the absolute moment behind the relative age.

- **REQ-TRACE-337** — **Evaluation and projection work SHALL NEVER run on the interface event loop**; the board SHALL stay responsive during a full re-evaluation.

- **REQ-TRACE-338** — A **failed evaluation** SHALL show a persistent, actionable notice, SHALL keep the last good board, and SHALL never blank or fall back to a locally computed board. The retry action SHALL take its name from the operation it performs, not from the notice or banner that hosts it.

- **REQ-TRACE-339** — Every board refresh runs a propagation pass containing two kinds of work a user experiences as nothing alike: **deterministic rules** — arithmetic over files, done before the interaction finishes — and **analyses** that each wait on a language model, which on a store of any size is **minutes**. The surface SHALL distinguish them.

- **REQ-TRACE-340** — **Every refresh SHALL apply the deterministic rules.** Where a rule relocates a card, that relocation SHALL happen on every refresh no matter how cheap the refresh was meant to be: what a caller may economise on is judgement, never fact.

- **REQ-TRACE-341** — **A refresh the user initiates SHALL consult no model.** Exactly four triggers SHALL be cheap in this sense: re-evaluating by hand; the refresh that follows an accepted action; the refresh that follows a requirement being written; and opening the view for the first time. Each corresponding control SHALL describe that behaviour in wording consistent with what it actually does.

- **REQ-TRACE-342** — There SHALL be **one** control for the plain re-evaluation, stating that it re-reads the sources and stores and applies the propagation rules, that it consults no model and measures nothing, and that cards a rule moves will move. Two controls in different words for the same action are a defect.

- **REQ-TRACE-343** — Where a refresh **might reach a model**, it SHALL announce that fact for the duration, using **a sentence written for this case** rather than the generic loading indication; it SHALL say that the operation may run for minutes; and it SHALL provide a **stop**. Before it runs, the control SHALL explain that the refresh records an analysis and puts work on offer without commencing any of it. While it runs, the control SHALL turn into a stop, which SHALL explain that stopping takes effect once the judgement currently in progress concludes, that the board is still delivered with every rule-driven card movement intact, and that anything the pass did not judge is taken up by the next full evaluation.

- **REQ-TRACE-344** — **Stopping SHALL still deliver a complete board.** Rules that already fired remain in effect, the projection is still computed, and any requirement the pass did not get to judge is left for the next full pass to handle. Where no analysis is under way, a stop request SHALL answer that there is nothing to stop.

- **REQ-TRACE-345** — Requirements **still awaiting a judgement SHALL be listed by identifier and counted** on the surface, and requesting a judgement SHALL launch a full pass. Leaving work outstanding is the intended consequence of a cheap refresh; if that outstanding work goes unnamed, a card that has yet to be judged looks exactly like a card with no work owed.

- **REQ-TRACE-346** — Where the workspace's settings disable change analysis, the board SHALL **state that fact** rather than presenting an action that would accomplish nothing. That fact SHALL be reported **by the pass**, and the board SHALL NOT deduce it from the shape of the results it received: a failed analysis leaves behind an identical absence of judgements, so treating a malfunctioning provider as a deliberate configuration would send the user off to correct something that is not broken. Any control that is incapable of having an effect SHALL explain why instead of merely appearing disabled.

- **REQ-TRACE-347** — The declared repository events SHALL remain the moments at which judgement happens automatically; they become legible and interruptible, not disabled.

- **REQ-TRACE-348** — A board pass SHALL be held in **one value** so a reader can never observe half an update, and a detail read during a pass SHALL describe **one generation** of the board. A finished pass SHALL retire itself and never the pass that replaced it.

- **REQ-TRACE-349** — Two threads opening a cold board SHALL read the workspace source **once**: the first open coalesces concurrent reads.

- **REQ-TRACE-350** — Where a batch of due evaluations arrives while a read is already running, the batch SHALL be re-attempted **150 ms** later. This delay is explicitly **not** a debounce window: the triggering events have already fired and are queued, and the wait exists only so the request can be repeated once the in-flight pass has cleared.

- **REQ-TRACE-351** — Progress publication from a running pass SHALL be throttled **only when a phase reports more than 20 items**. A check suite consists of a handful of checks separated by minutes, and discarding one of those signals would leave the banner naming the previous check for the entire duration of the next; a phase that emits one signal per requirement in the store is the opposite situation. The minimum interval between publications SHALL be **0.1 s**: a per-requirement phase over a store-sized project emits signals faster than the interface loop can consume them, which lengthens the queue and postpones the very repaint the signals exist to trigger. Two signals SHALL be published **regardless of the throttle clock — a change of phase, and the final item within a phase** — so the narration never comes to rest on an out-of-date item.

- **REQ-TRACE-352** — The elapsed reading of a running pass SHALL be redrawn every **1000 ms** from a timestamp the pass set once — the value is not re-sent, only the reading recomputed — so that a check producing no output for minutes still reads as alive. The reading SHALL advance while no new progress value arrives and SHALL stop when the pass ends.

- **REQ-TRACE-353** — **Progress reporting is commentary; it SHALL carry no authority.** Which controls are live SHALL be decided solely by whether a pass is currently running. A progress value that arrives late, that the throttle discarded, or that never arrived at all SHALL NEVER be what enables a control or relocates a card.

- **REQ-TRACE-354** — A progress update SHALL change nothing except what the progress display shows. It SHALL never bring a card into existence, reuse one for another card, or repaint one, and the set of cards on the board together with their contents SHALL be identical before and after it.

- **REQ-TRACE-355** — Progress raised by a pass running away from the interface SHALL reach the interface only once it has been handed to the interface's own thread; nothing on screen SHALL be touched from the pass itself. Reporting progress SHALL not make the board unresponsive and SHALL not produce a threading fault.

- **REQ-TRACE-356** — A pass SHALL survive a re-evaluation of the board that happens beneath it: where a repository event arrives while the pass is in flight, the pass SHALL keep running and the board's statements about that pass SHALL remain in place.

- **REQ-TRACE-357** — Progress presentation SHALL obey these rules:
  - the phase SHALL be labelled with wording describing the work being done, and its **position within the pass's fixed phase sequence** SHALL be given beside that label;
  - a position SHALL be shown wherever a real denominator exists — this check of the suite, this requirement of the store — and every such figure SHALL be **printed together with the unit it counts**;
  - **no overall percentage SHALL be shown**, and where a phase reports no denominator **no bar SHALL be drawn at all** rather than one invented for the occasion;
  - every control and every meter SHALL carry an accessible name, SHALL state its value as text and not by fill level alone, and SHALL fit within the minimum supported window size.

- **REQ-TRACE-507** — The live-refresh subscription SHALL be a supervised resource. Where it ends, fails, or reports that the repository watcher behind it has stopped delivering, the board SHALL raise a **persistent, actionable notice** naming what stopped and carrying a re-subscribe action named after what it does, SHALL keep the last good board on screen, and SHALL go on stating when it last evaluated (REQ-TRACE-336) so that the age of what is displayed stays visible. The board SHALL NOT poll in place of a subscription, and SHALL NOT infer a dead watcher from silence: an idle repository and a stopped watcher present the identical absence of events, and a board that guessed between them would either cry wolf over a quiet project or conceal a real failure. Re-subscription SHALL be attempted only when asked for — no automatic retry schedule and no backoff — and the explicit re-evaluation control of REQ-TRACE-342 SHALL remain the guaranteed route to a current board, its availability never depending on the subscription being healthy.

### Board Scaling and Virtualisation

- **REQ-TRACE-358** — The board SHALL construct card widgets **only for cards currently on screen**. Each column SHALL retain the full ordered membership from its model but SHALL build widgets only for the cards lying within its own scroll viewport, extended by a small overscan margin, using the scroll position the column already tracks. Scrolling SHALL **reuse** the existing widgets instead of allocating additional ones.

- **REQ-TRACE-359** — A widget SHALL be **reused rather than torn down and reconstructed**. When one card leaves the realised band, the widget it occupied SHALL be repainted where it stands to show the card that has entered the band, going through **the identical update path** that live refresh uses.

- **REQ-TRACE-360** — A column SHALL keep cards realised for a fixed margin above and below its viewport, so that a wheel step, a page key or a card taller than expected lands on a card that already exists rather than on a gap. Until real measurements exist the column SHALL size its scroll range from an estimate and SHALL adopt the measurements once they do, so that the scroll range and the realised band agree. The number of card widgets the board holds SHALL stay bounded by what the viewport and that margin require: after a filter is widened so that a column's membership grows and then narrowed again, the board SHALL hold no more card widgets than it held before the filter was widened. The margin SHALL be **5** cards above and **5** below the viewport band, and the pool of released widgets a column retains for reuse SHALL be capped at **20**; a widget released beyond that cap SHALL be discarded rather than held.

- **REQ-TRACE-361** — Until at least one card in a column has genuinely completed layout, the column SHALL continue to use its height estimate.

- **REQ-TRACE-362** — A **filter change SHALL recompute membership and repaint the bands**. Nothing SHALL be torn down: the existing column widgets and card widgets SHALL persist, and the current selection, each column's scroll offset and any open pane SHALL be carried through a filter change just as they are carried through a re-evaluation. Even a filter that matches almost nothing SHALL leave every column standing, simply with fewer members.

- **REQ-TRACE-363** — Text typed into the search box SHALL be applied only after **150 ms** have passed without a further keystroke, so that a burst of typing produces **one** recomputation and one repaint rather than one per character. While that pause is outstanding the box SHALL hold the typed text, the board SHALL report itself as populating, and the filter in force SHALL be unchanged. Once the text is applied the board SHALL report itself as no longer populating.

- **REQ-TRACE-364** — Since **no widget exists** for a card the user has never scrolled into view, the board SHALL expose an explicit operation that forces a named card to be realised. Returning to the board and focusing the current selection SHALL use it, as SHALL any other caller that needs one particular card to exist. It SHALL scroll the column to the card, return the now-visible widget, **not** realise everything on the way there, and return nothing for an unknown identifier and for an empty identifier.

- **REQ-TRACE-365** — For a column of 300 cards in a viewport of about 1000 × 640 the following SHALL hold: the column reports all 300 as members; fewer than a quarter of them have widgets, and that count does not grow with the column's length; the pending count equals the membership minus the realised count; the board reports itself finished populating by the time the update call returns; and the realised cards form one **contiguous band beginning at the top** rather than a scattering. Scrolling the column from end to end in ten steps SHALL leave the realised count bounded by the viewport band and its margin, SHALL make the set of cards visible at the bottom **disjoint** from the set visible at the top, and SHALL leave the last card reachable. **Every realised widget SHALL paint the card it is currently filed under**; a reused widget SHALL never go on showing the card it previously held. Revealing a named card SHALL realise that card and the band around it and SHALL NOT realise the cards passed over on the way.

- **REQ-TRACE-366** — The board SHALL publish a **readiness flag** and a **pending count** as observable state, so that a caller can wait for the bands to finish realising.

- **REQ-TRACE-367** — The cost of putting a board on screen SHALL be governed by how much of it is visible, not by how many requirements the store holds. Spreading the construction of every card across successive turns of the event loop SHALL NOT be accepted as satisfying this, since it leaves the total work unchanged. Typing a character into the search box SHALL NOT discard and rebuild the board's cards. One keystroke SHALL cost no board work beyond restarting the debounce timer of REQ-TRACE-363 and painting the character typed, and the recomputation that follows the debounce pause SHALL occupy the interface thread for no more than **100 ms** under the same reference conditions.

### Surface Composition and Staging

- **REQ-TRACE-368** — The requirements feature SHALL be attached to a window exactly once, however many times the view is opened. Opening the view SHALL require nothing of the caller, and an action performed once on the board SHALL take effect once — never twice, and never in two views at the same time.

- **REQ-TRACE-369** — The requirements area SHALL install **its own default surfaces**. Staging SHALL differ by surface: the **board** SHALL be installed the first time the area is opened, and again on refresh; each **pane** — review, queue, editor, creation, blockers — SHALL instead be **constructed the first time it is actually needed**, so that a board opened only to be read does not pay the cost of surfaces nobody opens. A second use SHALL **reuse** the pane rather than building a second.

- **REQ-TRACE-370** — **No stage SHALL displace a surface a caller attached first**: a test's composition or another window's SHALL survive untouched. The attachment point SHALL stay an extension point, but SHALL now ship **with a default implementation**; an extension point that has no default leaves nothing behind it for a user to actually run.

- **REQ-TRACE-371** — Constructing the window SHALL build no board and read no requirement store: the area is lazy. Selecting the requirements view SHALL then yield a board carrying the project's requirements without any caller having attached a view.

- **REQ-TRACE-372** — Once the board is installed, **every control it presents as live SHALL do what it offers when it is operated**, and **every request its default surfaces can raise SHALL be answered** — no control on the board may be enabled and inert. It SHALL be possible to sweep the board's controls and demonstrate that each has an effect.

- **REQ-TRACE-373** — A board view MAY offer only part of the interaction surface the rest of the application is able to drive. Installing such a partial view SHALL succeed rather than fail: whatever the view does not offer SHALL be reported as not connected, whatever it does offer SHALL be reported as connected, and a capability the view lacks SHALL simply be absent rather than raising an error when something asks for it. The interaction surface SHALL cover, at minimum: the reading requests a user makes of the board without changing anything; every state-changing action in the closed set of REQ-TRACE-382; the board state, pending actions and feedback, queue, pass progress and move options handed back to the view; and navigation between the board, a requirement's detail and the panes of REQ-TRACE-375.

- **REQ-TRACE-374** — A state update handed to the board MAY name which requirements it affects. Where it does, **only the cards for those requirements SHALL change**, and every other card, the current selection, each column's scroll offset and any open pane SHALL be left exactly as they were. Where it does not, the board SHALL still come to show the same state it would have shown had the affected requirements been named.

- **REQ-TRACE-375** — The pane-key namespace SHALL be stable and closed: review, queue, editor, creation, blockers. Whether a given pane is already installed SHALL be answerable for any of those keys at any time, and asking SHALL neither construct that pane nor load anything the pane needs in order to run — so the question can be put to a board on which no pane has ever been opened, and asking it SHALL leave the board exactly as REQ-TRACE-369 leaves an unopened pane.

- **REQ-TRACE-376** — With **every** surface installed, nothing in the area SHALL clip at the minimum window size; every pane SHALL share one stack with the board.

- **REQ-TRACE-377** — **No module of the desktop application SHALL** launch a requirement-checking or verifier process, parse rendered output in place of the data, or re-compute evidence health, requirement health or epic progress. A guard test SHALL assert that no desktop module spawns such a process, and the health values rendered on cards SHALL be asserted identical to the projection's.

- **REQ-TRACE-378** — A board surface SHALL take every engine-derived value already translated, through the bridge and from no other route, and SHALL NOT load the requirement engine while running. Ordering of identifiers on the board SHALL produce, for any set of identifiers, exactly the order the engine produces for that same set.

- **REQ-TRACE-379** — Given the projection is unavailable, the view SHALL degrade to a **stated error** and SHALL NEVER fall back to a locally computed board.

- **REQ-TRACE-380** — Turning projection values into what the board displays SHALL be a pure mapping: every input it uses, **the current time included**, SHALL be supplied to it, and the same inputs SHALL always produce the same displayed values. That mapping SHALL read no file, consult no repository, reach no engine and require no user-interface toolkit.

- **REQ-TRACE-381** — The application as shipped SHALL open the requirements view onto a working board: the board, the detail view, the evidence view and the graph SHALL all be available without a caller supplying them, the review and queue panes SHALL be reachable, and the scheduling limits SHALL be in force. A status placeholder carrying no board SHALL NOT be an acceptable shipped state.

### Write-Back: The Closed Action Set

- **REQ-TRACE-382** — The board SHALL have exactly **one write path**, carrying a **closed** set of fourteen actions, closed deliberately so that a completeness sweep over the action set is possible: `release`, `return`, `accept`, `rerun`, `send-back`, `reject`, `hold`, `resume`, `answer-blocker`, `edit`, `create`, `accept-proposal`, `accept-change-work`, `keep-worktree`. Labels SHALL be rendered by replacing hyphens with spaces and capitalising as a sentence.

- **REQ-TRACE-383** — Action classification SHALL be:
  - **changes state** — all fourteen except `keep-worktree`, which explicitly does nothing and reports as much; each of the other thirteen writes a record;
  - **transitions** — the nine that are routed through the engine's transition function instead of straight into the audit trail: `release`, `return`, `accept`, `rerun`, `send-back`, `reject`, `hold`, `resume`, `answer-blocker`;
  - **starts a run** — the three that always start agent work: `release`, `rerun`, `send-back`;
  - **requires confirmation** — the three run-starting actions **together with** `accept`, `accept-proposal` and `accept-change-work`. What these six have in common is that dragging the card back where it came from does not undo their cost: a result recorded as delivered, a requirement permanently added to the project's own store, or agent runs dispatched for the work a change was found to need.

- **REQ-TRACE-384** — Transition targets SHALL be: `release` and `rerun` and `send-back` and `reject` to the ready column; `return` to the first column; `accept` to the terminal column; `hold` to the blocked column. `resume` and `answer-blocker` SHALL deliberately carry **no** target: a blocked requirement goes back to whichever state it was blocked out of, and that destination is read from the stored record rather than nominated by whoever invokes the action.

- **REQ-TRACE-385** — The moves a **user** may make SHALL be exactly: first column to ready = release; needs-update to ready = release; ready to first column = return; review to terminal = accept; review to ready = send back. Two rules SHALL override that table: **any column to blocked = hold**, and **blocked to any column = resume**. A move whose source or target is empty, whose source and target are equal, or whose pair means nothing this board does, SHALL yield **no action** — which is **not** the same as the engine refusing it; an engine refusal and its reason come back from the move itself.

- **REQ-TRACE-386** — There SHALL be exactly **one** place that decides whether an action starts agent work: true for the three run-starting actions unconditionally; true for `resume` **only when the target column is the ready column**; false otherwise, so a requirement blocked out of the first column or out of review returns there and nothing is dispatched. The target SHALL be handed over as a column token already resolved by the caller.

- **REQ-TRACE-387** — Dropping a card onto a column SHALL call the engine's delivery transition, attributing it **to the user as the acting party**, and **whatever the transition entails technically SHALL then execute**: a release begins the execution flow, and an acceptance stores the specification hash that has now been satisfied.

- **REQ-TRACE-388** — The card SHALL show the action **in progress** with a per-action progress label naming what is happening, and then its outcome. **No card SHALL ever come to rest in a state the engine has not agreed to**: an optimistic rendering is permitted while the action is in flight, never as the settled result. A refused or failed transition SHALL return the card to its origin column and change nothing. At most **one** state-changing action per requirement SHALL be in flight at a time: a second action requested for a requirement that already has one pending SHALL be **refused with a stated reason** and SHALL write nothing, rather than being queued behind the first or racing it. No further bound SHALL be placed on how many actions may be in flight across **different** requirements, each being independent and each already adjudicated by the engine.

- **REQ-TRACE-389** — For every action in the confirmation set the **consequence SHALL be stated before it happens**. Each action SHALL have exactly one consequence sentence, naming what it does to the requirement, to the branch and to the worktree, including: that releasing takes a snapshot of the specification, splits it into execution units and begins work inside a worktree of its own; that returning discards nothing already run; that accepting records the delivered specification version and is refused unless every completion condition holds; that re-running starts from the current specification on a new branch and keeps the previous branch and worktree; that sending the agent back places whatever the user wrote into the context given to the following run; that rejecting returns the requirement to ready while keeping unit branches and worktrees for inspection; that holding blocks with the user's stated reason and schedules nothing until it clears; that resuming puts the requirement back into whichever state it was blocked out of — or, where that was a running state, into the released state instead, because asserting that a run is under way is something only the system may do — and that returning to the released state starts the work again with the queue deciding when; that answering a blocker stores the answer, hands it back to the engine and allows the flow to pick up at the point it halted; that editing writes back into the project's own artifact and a delivered requirement then needs an update; that creating follows the chosen source's own identifier and location conventions; that accepting a proposal creates a **permanent** technical requirement in the project's own store with its origin link, unlike an execution unit which outlives nothing; that accepting change-work carries out what the analysis concluded and that nothing runs until the user accepts; and that keeping the worktree leaves the requirement where it is.

- **REQ-TRACE-390** — Every move that can be made by dropping a card SHALL also be available from the keyboard, through a move control reachable by a key chord. The chord SHALL do nothing but place focus on that control; the control itself SHALL **aim at the first delivery state the engine reports as reachable** for the selected requirement and SHALL name which that is. The chord SHALL be the platform's primary modifier together with `M`. It SHALL be registered through the application's own keybinding surface rather than bound privately by this view, so that a collision with an application-wide binding is settled in one place and the chord stays re-bindable by the user; every sentence that names the chord SHALL name whichever chord is actually in force rather than a fixed one written into the text.

- **REQ-TRACE-391** — The move control SHALL state **one** column, not a list:
  - reachable — a sentence naming the requirement, its source column and the target column, **with the consequence in the sentence itself**, not only behind a hover, and with the label's accessible description equal to its visible text;
  - refused — a sentence naming the requirement, its source column and the target column as unreachable, followed by **the engine's own words unchanged**, including its enumeration of what the source column can reach. The control's tooltip SHALL be a substring of the on-screen sentence, so the reason sits on screen beside the dead control rather than only in a tooltip a user would have to suspect exists;
  - nothing selected — a prompt telling the user to select a requirement on the board to move it, **naming the chord**.
  In the refused case the control's tooltip and accessible description SHALL be identical, so the two can never disagree. In the enabled case the accessible name SHALL state the move and name the requirement and the target column, and the tooltip SHALL carry the consequence.

- **REQ-TRACE-392** — Each entry in the move picker SHALL be prefixed with the **reachability glyph the engine supplies**, in preference to an independently authored sentence that could contradict it, and each refused entry SHALL carry the engine's reason as its tooltip. Where the running column is refused, the reason SHALL identify the system as the sole actor permitted to place a requirement into a run.

- **REQ-TRACE-393** — A drop-target option SHALL exist per delivery column, carrying the target, a label and whether it is reachable; when reachable it SHALL carry the consequence and the confirmation flag; when unreachable it SHALL carry both a **written reason and a glyph**, so that the refusal remains legible to a reader who cannot tell apart the two colours used to paint reachable and unreachable columns.

- **REQ-TRACE-394** — For every delivery state, whether a move is offered SHALL be decided by asking the engine about that source, that target and an acting party of `user`. The board SHALL offer no move the engine reports as unreachable and SHALL withhold none it reports as reachable, and SHALL hold no table of its own describing which transitions are permitted.

- **REQ-TRACE-395** — A card blocked out of a run SHALL be offered exactly **one** target — the state it was blocked in — derived from the card's recorded return state.

- **REQ-TRACE-396** — The drag payload SHALL travel under a **private transfer type** rather than as plain text, so that material dragged from any other part of the application cannot be misread as a requirement and accepted by a delivery column.

### Refusals, Guards and Attribution

- **REQ-TRACE-397** — Where a delivery transition is refused, **the reason the engine gave** SHALL be shown as **inline feedback that persists and can be acted on**, identifying which precondition is unmet and what would meet it. It SHALL NOT take the form of a transient notification, and the card SHALL NEVER simply spring back with no explanation. The reason shown SHALL be the engine's, never a locally worded guess. Feedback SHALL persist until dismissed or resolved. Refusal lines SHALL name each unmet condition **separately**, not as one merged paragraph.

- **REQ-TRACE-398** — A refused transition SHALL NOT put the board into an error state: a refusal is an answer, not a malfunction. **While a card is being dragged**, a column it cannot reach SHALL be identified in words as well as by a glyph, and never by colour alone.

- **REQ-TRACE-399** — **No path anywhere in the application SHALL persist a delivery state except by calling the engine's transition function**, and **none SHALL install the terminal state while circumventing the completion conditions** — not via a drop, not via a context menu, and not via a bulk operation. A guard test SHALL assert that no module writes the delivery store directly. The terminal state SHALL be unreachable in the interface while the engine reports it cannot be reached, and unreachable without the delivering run's snapshot.

- **REQ-TRACE-400** — The absence of a forcing control SHALL be documented as a decision rather than an oversight. Entry to the terminal state is granted by completion conditions that the engine evaluates as the transition is attempted; this surface only produces the evidence those conditions consult and adjudicates none of them. A forcing control here would require a completion gate of its own, and any gate the interface owns is a gate the interface is free to relax.

- **REQ-TRACE-401** — Where an override is offered at all, it SHALL require a deliberate confirmed act together with a stated reason, and an override submitted without a reason SHALL be refused. The record written SHALL mark the act **as an override** and SHALL name who performed it and on what grounds, and that record SHALL stay visible both on the requirement and in the audit trail.

- **REQ-TRACE-402** — A requirement whose text has changed since the snapshot its run was taken against SHALL NOT be recordable as delivered by any route. Where the application is assembled with a delivery-state writer that does not make that comparison, it SHALL **refuse to start** and SHALL name the comparison that is missing, rather than starting and admitting transitions that were never checked.

- **REQ-TRACE-403** — **Reading and writing SHALL be separately grantable.** A component given only the ability to read requirement data SHALL have no route by which to change a delivery state, write an audit record or start a run, and a guard test SHALL assert that a component composed with read access alone offers no state-changing operation at all.

- **REQ-TRACE-404** — **A bulk action SHALL evaluate the ordinary conditions separately for each requirement it covers and SHALL report its outcome separately for each.** Accepting three requirements at once SHALL therefore accept whichever of them qualify and, for any that does not, name the condition it failed.

- **REQ-TRACE-405** — Every action in the closed set that changes state SHALL write a record carrying four things: **who performed it**, **when**, **which requirement** it applied to, and **that requirement's hash at that instant**. The record SHALL appear in the requirement's history, interleaved there with runs and verifications. An action taken by the scheduler or by an agent SHALL be recorded as such and SHALL be **distinguishable from one taken by a person**. No state-changing action SHALL complete without leaving such a record.

  A requirement's history is retained only up to the limit REQ-CONFIG-192's `history_limit` fixes, and older entries are pruned. **Where that retention has dropped entries for a requirement, the store SHALL retain enough to say that it has and how many**, because a count taken over the entries that remain describes what is still stored rather than what was recorded, and the export of REQ-TRACE-514 must be able to state it. What is retained SHALL be enough to state the number dropped, not the dropped entries themselves: this obligation does not defeat retention, and it is not a second copy of the history. It SHALL be kept in the same durable operation that records the entry and applies the retention, so no reader can observe a stated number that disagrees with the entries it describes; a number maintained apart from the entries can drift from them, and an export that misstates how much is missing is worse than one that says it does not know.

- **REQ-TRACE-406** — The board state SHALL be one value carrying the columns, the queue and the pending and feedback action lists together.

- **REQ-TRACE-506** — Where the requirement an open confirmation prompt refers to leaves the board while that prompt stands — a live refresh having removed it, or another actor having moved it out of the state the action was offered from — the prompt SHALL be **withdrawn without the action being performed**, and a stated notice SHALL name the requirement and say that it is no longer in the state the action was offered for. Nothing SHALL be written, no record SHALL be made and no run SHALL be dispatched. Confirming SHALL NEVER act on a requirement the board no longer holds, and the action SHALL become available again only by being invoked afresh against the requirement as it now stands.

### Offer Discipline

- **REQ-TRACE-407** — The governing principle SHALL be: **withdrawing a claim happens by itself; making one is only ever offered.** A pass MAY, on its own, move a requirement **out of** the terminal state and **into** the blocked condition; in both cases the system is conceding that it no longer knows something, and in both cases the move costs nothing more than a comparison. A pass SHALL **never** move a requirement **into** the terminal state or into the released state, because each of those asserts something, and each is paid for either in minutes of a check suite or in model spend.

- **REQ-TRACE-408** — Showing an offer, dismissing one, opening the board, reading it and changing the grouping axis SHALL each **write nothing**. Reading a board in a workspace with offers outstanding SHALL create no execution unit and SHALL move no requirement into the released or the terminal state. The single exception is the maintenance of the index REQ-TRACE-089 permits, on that requirement's terms and on no others, and it is stated there rather than restated here. Because that maintenance is observably inert, each of these five actions still leaves the repository, the delivery store and every other record a user or another tool can read exactly as it found it, and REQ-TRACE-497's rule that no write produced by rendering, dismissing, opening, reading or re-grouping is ever observable holds exactly as written.

- **REQ-TRACE-409** — Where a workspace has **delivered nothing so far** and yet its repository already carries evidence, the board SHALL report that and **offer** adoption. The offer SHALL:
  - quote figures taken from the projection — how many requirements carry an implementation trace, out of how many in total — and never an approximation or an unquantified invitation;
  - state **before it is accepted** what adoption does: it runs the workspace's verification and moves only the requirements that pass;
  - present the cheaper alternative alongside it, namely grouping by health, which shows the same information at once and writes nothing;
  - be dismissible, and dismissal SHALL write **no** delivery record;
  - stop being offered once anything at all has been delivered or adopted;
  - leave the board usable while adoption runs, and say so, and on completion report **for each requirement separately** whether it was adopted, naming the unmet condition where it was not;
  - be attributed to whoever accepted it and produce the same records as any other action.
  Adoption SHALL NEVER be carried out on its own initiative, and in particular not on opening the view.

- **REQ-TRACE-410** — A user SHALL be able to **ask the system to verify**, with the board recording what the verification found. The verify action SHALL:
  - be presented as an option and never carried out on its own initiative: opening a workspace, viewing the board, and changing the grouping axis SHALL each verify nothing;
  - **ahead of starting**, declare that it executes the check suite this workspace has configured, **one time**, and give an approximate cost, so that an action lasting several minutes never comes as a surprise;
  - report **for each requirement individually** whether a result was recorded, with the reason where it was not;
  - **record a verification** while writing **no delivery record** and **relocating no card**: a passing suite constitutes evidence, and evidence is not the same thing as a decision;
  - run off the interface thread and leave the board usable, with a failure reported and the previous evidence left in place;
  - be offered for a requirement sitting in **any** delivery state, the first column not excepted, since running it there is precisely how a user discovers that something is in fact already complete and worth adopting; verifying a requirement in the first column SHALL update its evidence indicator and SHALL leave it in that column.
  While a pass runs, its control SHALL read as verifying and state that the board stays usable and that the indicators update when it finishes.

- **REQ-TRACE-411** — Once a change has been analysed, the board SHALL state the cost of acting on it and **offer** the resulting work; nothing SHALL execute until a user accepts. The offer SHALL report the analyst's verdict together with what acceptance would bring into being — naming the execution units, or stating that the outcome would be a verification rather than an implementation, or that a split would be planned first — and SHALL never be an unqualified invitation. **Acceptance SHALL be a single action travelling the board's one write path**, credited to the person who performed it, and SHALL be the only route by which units are created or the requirement is released.

- **REQ-TRACE-412** — A **staleness guard** SHALL decline, with its reason stated, to execute an offer whose analysis no longer corresponds to the requirement as it now stands. Absent that guard, a requirement rewritten in the interval between the analysis being read and the offer being accepted would end up with execution units scoped against a version of the text that no longer exists anywhere.

- **REQ-TRACE-413** — A workspace declaring automatic scheduling mode SHALL have the change-work offer **accepted for it**. The mode key SHALL default to manual, and nothing SHALL change for a project that did not ask.

- **REQ-TRACE-414** — A clarification SHALL NOT be presented as an offer. It SHALL block the requirement as soon as it is raised, and the only act available to the user SHALL be **answering it**.

- **REQ-TRACE-415** — A report naming refused requirements SHALL be bounded at **20** entries before it stops naming them. Every refused requirement SHALL still be refused and SHALL still say why on its own card; the bound constrains the notice alone. A details box running to hundreds of lines stops functioning as a report, because nobody reads it.

- **REQ-TRACE-416** — Named notices the controller raises SHALL include: re-evaluate the board; adopt a discovered source mapping; a repository with no commit, with a re-check action; store-level problems, with a re-read action; a folder that is not a version-controlled repository, stating that a run has nothing to branch from and offering to set it up; and an evaluation failure with a named retry. A notice-banner action SHALL be named after what it does, because it carries no label of its own.

### Review Surface

- **REQ-TRACE-417** — Opening a requirement in review SHALL show all of the following: the requirement together with the snapshot version the work was taken against; each execution unit and how it ended; the files the work modified; the traceability changes it produced; the results of the tests and the checks; the summary the agent wrote; the risks the agent flagged; and the branch and worktree holding the work. A modified file SHALL open as a difference view, and the branch and the worktree SHALL both navigate to the version-control view.

- **REQ-TRACE-418** — Each element in that list SHALL either be **shown, or explicitly reported as unavailable**. The specification version displayed SHALL be the one captured in **the snapshot the run was taken against**, and any divergence between it and the requirement's current version SHALL be called out. File differences SHALL remain legible at the minimum supported window size.

- **REQ-TRACE-419** — The review SHALL make an explicit presentational split between **what the agent claimed** and **what the system measured**. Two heading constants SHALL be used for the headings, for the accessible name of **every** row, and for a sweep asserting both exist. Under each heading SHALL sit an attribution written out rather than encoded in colour: that the claim side is the agent's own words and nothing there was measured, and that the measurement side was run by the system and nothing there is the agent's word. Where an agent claims completion, a top-of-surface sentence SHALL state either that the claim stands unmeasured or that measurement contradicted it.

- **REQ-TRACE-420** — The review SHALL carry **twelve** elements in a fixed order, each with its **own** empty message, across three sides:
  - claim: agent summary; reported risks; completion claim (always states something);
  - measurement: checks run; verification (always states something); changed files; traceability changes; unmet completion conditions;
  - work: specification version (always states something); execution units; branch and worktree; technical requirements this run proposes.
  The twelfth element SHALL be filed under **work** rather than under either side of the claim/measurement division, since it belongs to neither: it records what the run reports as newly necessary over and above the requirement it set out to implement, and it is an offer only — at that point nothing has been committed to the store.

- **REQ-TRACE-421** — Every review element's accessible description SHALL state exactly the content that element displays, including its own empty message where it has nothing to show. For each of the elements of REQ-TRACE-420, in the populated case and in the empty case alike, what is read out and what is on screen SHALL be the same words.

- **REQ-TRACE-422** — The review SHALL expose exactly **six** decisions, held as data in this fixed order so that the surface cannot acquire a seventh for which no action, no stated consequence and no record exist: accepting the delivered result; re-running the unit; returning the agent to the work with fresh instructions; editing the requirement; rejecting the integration; and retaining the worktree in order to continue by hand. Before any of the six is taken it SHALL state what it does to the branch and to the worktree, and each SHALL be written to the record together with its actor.

- **REQ-TRACE-423** — Accepting SHALL be subject to the completion conditions; accepting with unmet conditions SHALL be **refused with the conditions named**. Rejecting an integration SHALL leave every unit branch and worktree intact. Sending the agent back SHALL place the user's written instructions into the context handed to the following run, and SHALL refuse an empty instruction, explaining that the text is what the next run will receive and that submitting nothing would simply repeat the previous run unaltered.

- **REQ-TRACE-424** — Refusal and unavailability messages SHALL be: a requirement not awaiting a review decision, naming the state it is in instead; and a requirement awaiting review for which no finished run was recorded, stating that there is nothing to review yet.

- **REQ-TRACE-425** — While a review is being read the surface SHALL **state that it is reading** and SHALL keep responding to input rather than freezing. A second read asked for while one is outstanding SHALL be **refused rather than started**.

- **REQ-TRACE-426** — The notice shown after a decision SHALL offer exactly **one** action, namely reloading the review. Any decision relocates the requirement, which means the payload the decision was made against becomes out of date as soon as the decision is applied.

### Derived Technical Requirement Proposals

- **REQ-TRACE-427** — A technical requirement a run proposes SHALL be **put to the reviewer, and SHALL NOT be written into the store unless the reviewer accepts it**. Proposals from a completed run SHALL be shown on the review of the requirement whose run produced them, alongside the claim side and the measurement side, and SHALL be carried from the run to the review in a file on disk. That file SHALL be named `proposed-requirements.json`, SHALL sit in the run's own artifact directory alongside the requirement's recorded source, and SHALL hold one JSON array of proposal objects, each carrying the proposed title, the proposed description, the origin identifier the proposal derives from, and the execution unit that raised it. It SHALL be written once by the run as it finishes and SHALL be **read and never written** by the review. A file that is absent, empty or unreadable SHALL be reported as the run having put forward no proposals (REQ-TRACE-430) and SHALL NEVER fail the run or the review.

- **REQ-TRACE-428** — The offer SHALL give the proposed title, name its origin, and spell out **in prose** how the two kinds of artifact differ: an execution unit exists only to divide up work and is discarded afterwards, whereas a technical requirement is durable and becomes part of the project's own store.

- **REQ-TRACE-429** — The reviewer SHALL accept proposals **individually, one at a time**, using the review's own decision set. **The act of acceptance SHALL be what causes the write**, and that write SHALL travel the board's single write path so that it is attributed and recorded exactly as any other board action is. Accepting SHALL bring the technical requirement into existence in the project's own store, carrying the technical type and an origin link that names the requirement it derives from.

- **REQ-TRACE-430** — **Taking no action SHALL constitute declining.** A proposal that nobody accepts is simply never written to the store, and a run SHALL NEVER be marked as failed on that account. Where a run put forward no proposals at all, that SHALL be said in words rather than rendered as an element with nothing in it.

- **REQ-TRACE-431** — Accepting a proposed technical requirement SHALL **not** consult `requirements.human_in_the_loop.confirm_source_writes`. That setting SHALL keep its full effect on every *other* write into a requirement source.

- **REQ-TRACE-432** — Where the write is refused — because the source is read-only, or because the store will not take the draft — the refusal SHALL be surfaced on the review **in the wording the engine supplied**, and the requirement SHALL stay exactly where it was.

- **REQ-TRACE-433** — A technical requirement a run proposes SHALL reach a person: it SHALL NOT be written into the store without having been shown and accepted, and it SHALL NOT be discarded without having been shown. Reporting a proposal only into a log SHALL NOT satisfy this.

### Editing and Creating Requirements

- **REQ-TRACE-434** — A requirement backed by a **writable** source SHALL be editable in the detail view. Saving SHALL write through the adapter into the **original artifact** — the project's own file, never a local copy — and the board SHALL pick up the resulting hash change through evaluation.

- **REQ-TRACE-435** — Where a requirement's source cannot be written to, the view SHALL say the source is read-only, name that source, and offer to open the underlying artifact **in place of** an edit control. A disabled field with no explanation SHALL NOT be presented. One sentence SHALL carry that statement, and the notice, the tooltip and the accessible description SHALL all use it unchanged.

- **REQ-TRACE-436** — A **failed write SHALL preserve the user's input** and state the failure. The controls on the failure notice SHALL be named explicitly — the retry naming the operation it repeats and the dismissal naming what it clears — since the moment a write fails is precisely when a screen-reader user must be able to locate the dismissal.

- **REQ-TRACE-437** — An edit to a delivered requirement SHALL produce the needs-update transition **through the normal evaluation path**, not as a special case.

- **REQ-TRACE-438** — The editing surface SHALL have two distinct forms rather than a single form rendered inert. Against a writable source it SHALL present the editable fields, the save control and **an indication of which version the edit applies to**. Against a read-only source it SHALL present the read-only notice, the name of the underlying artifact and a control that opens it. The enabled state of the save control SHALL track the current contents of the fields.

- **REQ-TRACE-439** — The editing panel SHALL carry out **no write of its own**. Its responsibility is limited to reporting the text the user entered and displaying the result that came back; a distinct editing service SHALL own the write itself. This division is what keeps file-system access off the interface event loop and out of any widget's constructor.

- **REQ-TRACE-440** — The editing surface SHALL raise exactly three intents: that the user asked for an edit to be saved, carrying the requirement, title and description; that the artifact a read-only requirement lives in should be opened; and that the user left without saving.

- **REQ-TRACE-441** — Editor controls SHALL carry accessible names for the title field, the description field, save, cancel, the read-only escape hatch, the notice retry and the notice dismiss, plus a stated empty-state heading when no requirement is open.

- **REQ-TRACE-442** — The board SHALL support **creating** a requirement. The creation form SHALL let the user pick which source to write into, which epic it belongs under, whether it is a product or a technical requirement, and — where technical — which requirement it derives from. The new requirement's identifier, its location on disk and the format of its artifact SHALL all be determined by **the conventions of the chosen source**.

- **REQ-TRACE-443** — The location shown for a requirement about to be created SHALL be the location the creation actually writes to; the two SHALL never name different files. Where the chosen source cannot say in advance where the requirement will land, it SHALL report that it cannot, and the form SHALL show that report rather than a path it has guessed at.

- **REQ-TRACE-444** — Creation SHALL offer **only** sources declaring the create capability. A technical requirement SHALL NOT be creatable without an origin. The created requirement SHALL pass the project's own requirement check unedited, SHALL appear on the board in the first column, and SHALL be releasable immediately. A workspace with no writable store SHALL get a board and no editor.

### Blockers

- **REQ-TRACE-445** — A blocked requirement SHALL display the blocker holding it: **why it is blocked, what choices are available, and what each choice would lead to**. Whatever the user chooses SHALL be written to the record and handed back to the engine, which then continues the flow **without restarting it**.

- **REQ-TRACE-446** — Blocker kinds SHALL be a **closed** set of five, held so that a completeness sweep is over a closed set: `dependency`, `conflict`, `decision`, `run-failure`, `stated`. A sixth kind added to the engine SHALL fail the presentation lookup immediately rather than quietly receiving a fallback presentation.

- **REQ-TRACE-447** — Each kind SHALL have a heading and a lead sentence, plus a fallback pair: a dependency waits for another requirement to be delivered; a conflict states that this requirement and another cannot both be satisfied as written; a decision states that the engine halted and put the question to the user because the choice is not one the engine may make; a run failure states that the run did not succeed and no retries remain, leaving the requirement waiting on a human; a stated block says that a person blocked it and gives the reason they supplied; the fallback pair reports that progress has halted and reproduces whatever explanation the engine supplied. Where no blocker exists, the surface SHALL assert as a positive fact about that requirement that nothing is holding it — and SHALL NOT render an empty pane.

- **REQ-TRACE-448** — Exactly **four** answer paths SHALL exist, and there SHALL deliberately be **no "no way forward" path**: choose among the engine's named options; navigate to the requirement that blocks this one; clear the blocker; open the run that failed. Each SHALL carry a named control.

- **REQ-TRACE-449** — Path selection SHALL follow this precedence, which lets explicit engine options outrank the blocker's kind; where the engine has enumerated named alternatives it has already declared what answering means, no matter which kind produced the block: (1) the blocker carries choices → choose; (2) otherwise it carries identifiers of blocking requirements → navigate; (3) otherwise its kind is a run failure → inspect; (4) otherwise → clear.

- **REQ-TRACE-450** — Two presentation flags SHALL derive directly: navigability, when the blocker carries blocking identifiers; and side-by-side presentation, when the kind is a conflict — which is exactly the requirement that a conflict presents **both requirements side by side** with the decision the user must take.

- **REQ-TRACE-451** — The run-failure path SHALL open the run that failed so the user can examine what occurred, and SHALL explicitly **not** offer to retry it. By the time this blocker exists the retry budget has already been exhausted, so a retry control here would have the board promising an operation the engine would decline.

- **REQ-TRACE-452** — How a blocker is presented SHALL be a function of **the blocker value alone**, so that the same blocker reads identically on the card, in the detail view and in the blocker panel, and so that the entire mapping can be tested with no widget present. Option labels, reasons, questions and the **consequence** attached to each option SHALL be taken from the engine's fields unchanged; where an option supplies no label, a title-cased rendering of its key SHALL be used instead. Were the board to compose blocker wording of its own, it would be presenting an answer the engine never undertook to accept.

- **REQ-TRACE-453** — An answer to a blocker SHALL carry **only** what belongs to that blocker or to the stored record. In particular the delivery state a cleared blocker resumes to SHALL be **the state recorded when the requirement was blocked**, and SHALL never be chosen by the surface presenting the answer.

- **REQ-TRACE-454** — Answering SHALL reach the engine with the option that was chosen. An engine that refuses the answer SHALL be **quoted rather than paraphrased**. A blocker with no stored question SHALL still be answerable through the transition. Every blocker type SHALL have a presentation and an answer path.

### Release Gate and Blocker Chain

- **REQ-TRACE-455** — A release begins an agent run that is unattended and holds full permissions. Where a move into the released state would dispatch such a run, that move SHALL first be **put back to the user for a decision** if — and **only** if — the dependency gate is currently holding the requirement.

- **REQ-TRACE-456** — The board SHALL identify **each requirement standing in the way and the reason it blocks, reproducing the gate's text exactly**, and SHALL never substitute wording of its own. It SHALL then present **three** courses of action: proceed with the release regardless, in which case the release runs as it normally would; jump to one of the blocking requirements, which SHALL open that requirement's column, scroll it into view and give its card focus while **relocating no card**; or deal with the dependency chain first.

- **REQ-TRACE-457** — Cancelling, dismissing the prompt included, SHALL **write nothing** and SHALL leave the card in the column it was dragged from.

- **REQ-TRACE-458** — **Visibility before the gesture completes**: while a card the gate is **holding** is under drag, the drop indicator on the released column SHALL list the dependencies still undelivered in place of the ordinary release-consequence text.

- **REQ-TRACE-459** — Where a release is held, the system SHALL compute the **complete chain** of unsatisfied dependency ancestors as a **transitive closure**, sort it **topologically** so that no entry appears ahead of something it depends on, and yield **an identical ordering on every read of an unchanged project**. It SHALL then offer to release the chain's **root** — that being the requirement which is itself waiting on nothing.

- **REQ-TRACE-460** — **The control that performs the release SHALL identify the root by name while it is still unactivated**, not once the release has happened. Activating it SHALL transition that root requirement into the released state and launch its run, and **the requirement the user originally dragged SHALL stay where it is**.

- **REQ-TRACE-461** — Where a chain has **no root at all**, the surface SHALL report that fact instead of nominating one arbitrarily. A dependency **cycle** SHALL hold every requirement in it and SHALL be presented as a loop that the user must break somewhere. A dependency pointing at something outside the known requirement set SHALL be **flagged as unknown**. Where the root is already in the released, running, review or blocked state, its **current state SHALL be reported** rather than a second release being issued. And once the requirement the user set aside is no longer held, the user SHALL be informed.

- **REQ-TRACE-462** — The gate's plan SHALL be reproduced from the engine field by field: the requirement itself; the held-by list, each entry of which names a requirement, a reason and a kind; the chain; the root; and the root's current state. Were the board to author its own explanation of why a requirement is not moving, it would be proposing a way forward that the engine never undertook to accept.

- **REQ-TRACE-463** — Where a requirement was blocked **while a run was under way**, clearing that blocker SHALL return it to the **released** state and not to the running state, since occupying the running state asserts that a run is executing and that assertion is not one a person may make. It follows that:
  - where clearing a blocker returns a requirement to the released state, the run SHALL be **dispatched by that same act**: no second action SHALL be required of the user, and the card SHALL NOT have to pass back through the first column;
  - where the requirement returns to any other state — blocked out of the first column, review, needs-update or the terminal state — **nothing SHALL be dispatched**; the blocker clears and no more;
  - **when the work begins SHALL remain the scheduler's decision**: where the queue is stopped, the concurrency limit is already reached or a dependency is still outstanding, the release SHALL be queued and that SHALL be reported **in the scheduler's own words**, the requirement starting of its own accord once the hold lifts;
  - **a failure to dispatch SHALL NEVER stop the blocker clearing**: even in a workspace that cannot host a run the card SHALL still be permitted to leave the blocked state, and the reason nothing started SHALL be **reported on the result of the action rather than dropped**;
  - the **consequence stated beforehand SHALL match what happens**, naming the restarted run where the requirement returns to the released state.

### Runs Started from the Board

- **REQ-TRACE-464** — A unit run launched from the board SHALL be driven by the **same run coordinator** that drives a session the user starts by hand. From the instant it begins it SHALL have a **live handle**, so that the workspace's stop, pause and steer controls operate on it. Approvals and questions it raises SHALL be routed to a person. Closing the application SHALL **cancel** the run rather than leave it orphaned. While the run is still executing, its **session identifier SHALL already have been stored on the run record kept for that requirement** — that being the window in which the board actually needs to be able to open the session — and the identifier SHALL survive an application restart. The run SHALL take over the worktree already provisioned for it and SHALL never provision a second one. A composition assembled without a coordinator — a test supplying its own agent, which is the case this clause exists for — SHALL nonetheless execute the unit and report on it exactly as before. The clause formerly also named a programmatic embedding of the engine; that is withdrawn, because the product offers no embedding surface (REQ-EVENTS-178). The guarantee is unchanged: it is about a composition lacking a coordinator, and it holds for any such composition whether or not this document names it.

- **REQ-TRACE-465** — A run started from the board SHALL stay under the user's control for the whole of its life: **pause, steer, stop and answer SHALL each operate on it** from the moment it begins until it ends. Stopping SHALL end the run there and then; a board-started run SHALL NEVER be one that can only be brought to an end by waiting for it to finish of its own accord or by closing the application.

- **REQ-TRACE-466** — While a run is **waiting on a person**, every surface showing that requirement SHALL **state that fact and offer the way in**: the card, the requirement's detail view, its row in the queue and its session row in the workspace. Acting on the statement SHALL **bring that session into focus**, which is where the question is answered; the answering interaction itself SHALL NOT be duplicated on the board. The statement SHALL be withdrawn once the run is no longer waiting, whether the wait ended in an answer, a cancellation or a timeout. Its announced form SHALL identify the run to be opened and, where that is known, the unit.

- **REQ-TRACE-467** — The maximum time a run started from the board may wait SHALL be governed by the single setting the configuration surface registers for this purpose, `runtime.approval_timeout_seconds` (REQ-CONFIG-126). This domain relies on that setting for four things and restates none of them: that one budget covers approvals and user questions alike; the value space and the validation applied to it; the value in force when nothing has been configured; and the reading under which a stored zero denotes a wait with no limit (REQ-TOOLS-055, REQ-TOOLS-178). This domain SHALL declare no second setting, no second default, and no value space of its own — in particular no fixed list of stops — so a run started from the board and a run started from the composer can never be given different budgets.

- **REQ-TRACE-468** — What the board does with that budget SHALL be exactly this. It SHALL read the **effective** configured value — the value the layered configuration resolves, which is the registered default where no layer states one (REQ-CONFIG-126) — and SHALL apply no fallback, no clamp and no substitution of its own; a value the configuration surface has already rejected never reaches the board, because rejection happens while configuration is loaded (REQ-TOOLS-055). Where any surface of this domain displays the budget it SHALL render an unlimited wait as an unlimited wait rather than as the number zero, so a reader is never shown "0 seconds" for a wait that has no limit. A change SHALL apply to the **next** run started and SHALL NOT affect runs already under way.

- **REQ-TRACE-469** — **An unlimited wait SHALL remain cancellable.** Stopping the run SHALL immediately release whatever it was blocked on, rather than leaving the caller to sit out the remaining budget.

- **REQ-TRACE-470** — A run started from the board SHALL receive the permissive permission preset **and** the unsandboxed opt-in **together, and both SHALL be confined to that run**. Granting only the preset SHALL NOT count as satisfying this: a run so configured still stops at the first tool that needs approval. The grant SHALL leave the workspace's stored configuration as it stands, and **any other run started from the same process — before it, alongside it or after it — SHALL receive exactly the permissions its own configuration specifies**, the composer's next run included.

- **REQ-TRACE-471** — The elevation SHALL apply **exclusively to runs launched from the board**. A run begun from the composer, or from any other surface of the application, SHALL retain whichever permission mode its own configuration specifies, and the workspace's stored agent configuration SHALL be left unmodified.

- **REQ-TRACE-472** — **The elevation SHALL never happen without disclosure.** The **first action within a launch that would result in a run starting** SHALL declare what permissions the run receives, identify the worktree the run is confined to, and provide a way to abandon the operation. **Declining that disclosure SHALL cause nothing whatsoever to happen**: no delivery state written, no flow dispatched, the card untouched in its original column. **Accepting SHALL suppress the disclosure for the remainder of that launch**, and accepting it permanently SHALL suppress it in subsequent launches too. A user who has suppressed it SHALL still be able to find the behaviour described in settings and switch it off there; with it switched off, a board-started run SHALL adopt the workspace's own permission mode exactly as any other run does. **The permissions the run was actually granted SHALL be written onto its session record**, which makes it impossible for the disclosure and the audit trail to tell different stories.

- **REQ-TRACE-473** — The default SHALL remain enabled, and the reasoning SHALL be recorded. A release is unsupervised, which is not the same claim as the user being unavailable, and a run the user has stepped away from ought to run to completion rather than sit parked at a prompt. Given a live handle, a host able to serve approvals, and the waiting-on-a-person statement all in place, disabling the elevation SHALL produce a run that pauses, poses its question, and proceeds once it has an answer.

- **REQ-TRACE-474** — A release SHALL state when the run will be denied its tools in a default workspace, and SHALL say **nothing** where the workspace already opted in to unattended work — no redundant disclosure.

- **REQ-TRACE-475** — An execution unit, whether still running or already finished, SHALL link out to whichever surface already owns each aspect of it: the workspace view for its session, the mission view for its agents, and the version-control view for its branch and its worktree. Each such navigation SHALL **carry the session identifier**, and the destination view SHALL bring that session into focus. In the other direction, wherever sessions are enumerated, a session that originated from a requirement SHALL declare which requirement and which unit it serves. The requirements view SHALL **build no transcript, no agent tree and no worktree listing of its own**, and this navigation SHALL work for sessions that have already ended as well as for live ones. A navigation target that no application answered SHALL be reported and SHALL leave the surface where it is.

- **REQ-TRACE-476** — Following a restart the board SHALL rebuild, **out of what was persisted**, the delivery state of every requirement, its execution units, the runs that were queued or running, and the worktrees belonging to them. Where a run's process is no longer alive, that SHALL be detected and the run SHALL be reported as **interrupted, with its work retained** — never displayed as still running — and its worktree, its branch and its partial output SHALL all be kept. The queue SHALL resume where it stopped **without re-running completed units**, and **no requirement SHALL be silently reset** to the first column by a restart.

- **REQ-TRACE-477** — Flow lifecycle across a board pass SHALL hold: a flow that terminates on its worker SHALL deliver its ending to the same surface that was told it began; a flow this process has only just launched SHALL survive a re-evaluation arriving beneath it; a flow arriving at review SHALL report an ending that displaces no earlier ending and SHALL NOT be classified among the flows that failed to complete; a flow still executing SHALL name the stage it is on before it terminates; a flow that dies SHALL overwrite its own acceptance entry rather than accumulating a second one beneath it, whereas a flow reaching review SHALL leave whatever acceptance the user is currently reading undisturbed.

### Delivery Queue

- **REQ-TRACE-478** — The board SHALL display the delivery queue, covering three things: **which units are executing now**, **which candidate the scheduler will take next**, and, for every deferred candidate, **the engine's stated reason for deferring it, quoted unaltered**. The queue SHALL be shown in the order the scheduler will apply and SHALL NOT be re-sorted for display.

- **REQ-TRACE-479** — The queue SHALL expose a **closed** set of four controls, which prevents the surface from acquiring a control that nothing acts on and nothing stores: turning automatic scheduling on or off; setting the concurrency limit; holding or releasing one particular requirement; and stopping the queue.

- **REQ-TRACE-480** — Of those four controls exactly **two** — automatic scheduling and the concurrency limit — SHALL be written into the **workspace configuration**. **A stop SHALL NOT be persisted**, so a restart never begins with the queue stopped. A change to either persisted control SHALL take effect **without a restart**.

- **REQ-TRACE-481** — The concurrency control SHALL cap its own input at **64**. That ceiling constrains the widget, not the scheduler: an input widget needs some upper bound, and a figure no machine could actually service is of no use to anyone. Enforcement of the effective limit SHALL belong to the **engine**; the configured value SHALL NOT be merely shown on screen.

- **REQ-TRACE-482** — Control wording SHALL be explicit. For automatic scheduling it SHALL say that, when enabled, the system itself picks up the next candidate as capacity becomes available, and that, when disabled, nothing begins until the user releases it. For the stop control it SHALL say that stopping prevents anything new from beginning while work already dispatched continues and completes as usual — and this SHALL be stated **both before the control is used and afterwards**. An empty queue SHALL report that nothing is queued and nothing is executing, together with a hint naming the two ways to put something into it.

- **REQ-TRACE-483** — A workspace that sets none of the queue keys SHALL take the defaults declared by the configuration schema, `requirements.scheduling.mode` taking `manual` and the concurrency limit taking **2**. Two is chosen because a release dispatches an unattended run holding full permissions inside a worktree of its own, and two such runs are as many as one person can follow, while a third would mostly compete for the same reviewer's attention. A project wanting more SHALL say so explicitly, and the **engine** — never the control — SHALL enforce whatever it says (REQ-TRACE-481).

### Keyboard Operability and Accessibility

- **REQ-TRACE-484** — **Every** interaction the board supports SHALL be operable from the keyboard, with focus always visibly indicated and the tab sequence following the layout's reading order. This SHALL cover at least: shifting focus among columns and among cards; opening a card; opening the evidence indicator; transitioning a card between delivery states; and filtering. Dragging SHALL have a keyboard counterpart.

- **REQ-TRACE-485** — Cards and columns SHALL carry accessible names and descriptions that **communicate state through text rather than colour**. A column's accessible name SHALL identify the column, and its accessible description SHALL include the delivery-state word. A card's accessible description SHALL include the delivery-state word, the token for its health, and the card's rendered health label.

- **REQ-TRACE-486** — On a focused card, the activation key SHALL open the detail view and a stated chord — the platform's primary modifier together with `E`, registered and re-bindable exactly as REQ-TRACE-390's is — SHALL open the evidence view for that requirement. Card controls SHALL carry accessible names for opening the requirement and for opening its evidence, each naming the requirement.

- **REQ-TRACE-487** — **Escape SHALL close a pane** and return focus to the control it was opened from. **No pane SHALL strand the focus when it closes**, and focus SHALL never be stranded in a collapsed filter row, a closed detail view or a folded column.

- **REQ-TRACE-488** — The filter row SHALL be toggled by a control whose accessible name alternates between showing and hiding the filters. On hide, the hidden controls SHALL **leave the tab sequence** — invisible, not merely disabled — and focus SHALL return to the toggle.

- **REQ-TRACE-489** — The requirements view SHALL satisfy the repository's accessibility rules **with no exemption written for it**. Specifically: **every** control on a populated board SHALL announce a name; **no** rendered label on the board, the evidence pane or the graph pane SHALL fall below the AA contrast ratio for its size; and in each of the analysis control's **four** conditions — nothing owed, work owed, analysis switched off, and analysing — no control SHALL be unnamed, the header row SHALL demand no more than **1000** points of width, and every visible header control SHALL lie wholly inside the supported window.

- **REQ-TRACE-490** — A drop-down SHALL be bounded in width by the kind of vocabulary it offers: **240** points where the vocabulary is closed, as it is for sort order, grouping axis and move target, and **150** points where the values come from the project. A value wider than its bound SHALL be elided, and the whole value SHALL remain available through both the tooltip and the accessible description. Where no bound is stated for a drop-down, the open column's maximum width SHALL serve as its ceiling.

- **REQ-TRACE-491** — Exactly one control on the screen SHALL be presented as the primary action. It SHALL be **32** points high while every other control is **24**, so that the two are told apart without being compared side by side. That position SHALL be held by the board's **plain re-evaluation control** (REQ-TRACE-342) — the one action that is always available, always meaningful and never destructive on a surface whose other writes are made per card. While an analysing refresh is in flight, the **stop** that control has turned into (REQ-TRACE-343) SHALL hold the position in its place, so that exactly one control occupies it at every moment.

- **REQ-TRACE-492** — A complete keyboard-only path SHALL be possible end to end through the real controller, bridge and projection: focus a card (which updates the selected requirement, because focus is selection); open its evidence with the chord; reach the failing test as a keyboard-reachable control whose accessible name states the covering test with its path and line; and return to the board with escape.

- **REQ-TRACE-493** — Fold-specific accessibility SHALL hold: an accessible name SHALL be present on both the column heading and the folded rail; the rail SHALL be focusable and fully operable without a pointer; and no fold operation SHALL leave focus stranded.

### Ordering Constraints and Global Invariants

- **REQ-TRACE-494** — Ordering SHALL be deterministic everywhere. Every ordered output SHALL be explicitly sorted: requirements by number; store and source scans by POSIX path string; orphan lists sorted; debt baseline entries numerically and the two path baselines lexicographically; retired identifiers by number; change-comparison entries by number; coverage-map keys ascending.

- **REQ-TRACE-495** — Every artifact SHALL be written **UTF-8 with LF** endings on every platform, and CR and CRLF SHALL be normalized to LF on read before hashing, so all artifacts are byte-stable across platforms.

- **REQ-TRACE-496** — Ordering constraints on the board SHALL be: the delivery-axis column order is fixed and not derived from data; closed axes emit every value while open axes emit only present values with the unset bucket last; cards within a column follow the chosen sort order; revision history runs oldest to newest with the current marked; the blocker chain is topologically ordered and stable across reads; review decisions render in their fixed order; card alerts render in their fixed order with first-spelling-wins de-duplication; optional card facts render in their fixed order; pass phases run in their fixed sequence per pass kind with adoption's recording phase last; and surface installation is staged — board on first open or refresh, every pane on first use, never over a caller-attached surface.

- **REQ-TRACE-497** — None of the following SHALL ever be observable:
  - a requirement shown in two columns at once, or in no column at all;
  - a column count that disagrees with the number of cards visible in that column;
  - a card resting in a delivery state the engine did not grant;
  - the terminal state reached while the engine's completion conditions did not hold;
  - a state-changing action for which no record was written;
  - a write produced by rendering, dismissing, opening, reading or re-grouping;
  - a verification that moved a card or wrote a delivery record;
  - a card that has arrived in a column which remains folded;
  - a fold made in one workspace taking effect in another;
  - a health, evidence-health or epic-progress value on screen that differs from the projection's;
  - a requirement-checking or verifier process launched by the application;
  - a board assembled locally in place of an unavailable projection;
  - evaluation or projection work blocking the interface event loop;
  - a progress report that brings a card into existence, reuses one for another card, repaints one, or enables a control;
  - focus left inside a hidden filter row, a closed pane or a folded column;
  - rotated text on a folded rail;
  - a previewed create location differing from the path the write produces;
  - a run started while its disclosure was due and had not been accepted;
  - a run in flight whose record carries no session identifier;
  - a card that can be dragged between columns on an axis other than delivery;
  - an epic card offering a delivery action.

- **REQ-TRACE-498** — Every one of these failures SHALL be visible to the user and stated in words, with the behavior given here:

  | Failure | Required observable behavior |
  | --- | --- |
  | Projection unavailable | an error is stated; the last good board stays on screen; no board is assembled locally |
  | Evaluation failed | a notice that persists and can be acted on; the last good board stays; the retry names what it retries |
  | Fold settings unreadable, or written by a later build | nothing is folded; the board opens under the emptiness rule |
  | Stored sort order or axis unknown to this build | the default for that setting is used |
  | Source read-only | the read-only sentence is shown, the source is named, and opening the artifact is offered — no disabled field |
  | Write to source failed | what the user typed is kept; the failure is stated |
  | Create location cannot be previewed | the inability is reported and shown in the form; no path is invented |
  | No revision history | an "unavailable" sentence, worded differently from the pending "reading" sentence |
  | Requirement not awaiting review | the state it is actually in is named |
  | Awaiting review with no finished run | it is stated that there is nothing to review yet |
  | Workspace is not a version-controlled repository | it is stated that a run has nothing to branch from, and setting one up is offered |
  | Repository holds no commit | a notice carrying a re-check action; the release is refused before any card moves, quoting the engine |
  | Composition assembled without a run coordinator | the unit executes and reports exactly as it otherwise would |
  | A progress consumer raises | the failure is logged and stepped over; the pass's report is unaffected |
  | Analysis switched off | the control explains why instead of merely appearing disabled |
  | Workspace cannot host a run when a blocker is cleared | the blocker clears regardless; the reason nothing started is reported on the action's result |
  | Layout configuration unreadable on a consuming path | a warning and an empty sweep; never a reported read failure |
  | Layout configuration unreadable on a traceability operation | the failure is stated in the terms of REQ-TRACE-046, naming the configuration path and the cause; no operation is performed and nothing is written |

- **REQ-TRACE-499** — A single end-to-end path over the **shipped composition** SHALL be exercisable with no caller-supplied wiring: release, run, review, accept, and notice a subsequent edit.

- **REQ-TRACE-500** — **A trace that no longer holds SHALL break the build.** A reference naming a requirement that has been deleted SHALL fail compilation, and a requirement whose obligations are unmet SHALL fail the meta-tests the project's own test suite runs (REQ-TRACE-183) and SHALL be stated as a violation by the check of REQ-TRACE-508. Keeping requirements and code aligned SHALL rest on no manual coordination step between people: every trigger for propagation SHALL be a build, a test run, or a change the board observes for itself (REQ-TRACE-334, REQ-TRACE-347).

## Data & Formats

Every artifact described below is a **file in the user's own repository** and stays one; REQ-TRACE-513 states that boundary and the grounds that reach it, and REQ-TRACE-089 fixes the only terms on which an index over these files may exist.

### Requirement document

```
---
req-id: <PREFIX>-<number>              # or a bracketed list: [<PREFIX>-<a>, <PREFIX>-<b>]
status: draft | approved | deprecated
trace: required | optional             # default required
test: required | optional              # default required
title: <free text>
type: product | technical              # default product
derived-from: <PREFIX>-<n>             # or a bracketed list; technical only, mandatory there
legacy-id: <legacy identifier>         # optional provenance, NOT unique across documents
priority: <token>                      # optional provenance
epic: <PREFIX>-<n>                     # optional provenance; parent epic is derived from layout
date: <YYYY-MM-DD>                     # optional provenance
source: <original document path>       # optional provenance
---

# <PREFIX>-<n> - <Title>

<prose>
```

- The frontmatter delimiters are lines that strip to exactly three hyphens; the opening one must be line 1.
- A field line opens with a letter, continues with letters, digits, underscores or hyphens, and then carries a colon; any other line continues the field above it, joined with one space.
- A value is the text after the first colon, stripped, with one matching outer quote pair removed.
- A multi-identifier document adds, per declared identifier, a heading of level 2 to 6 beginning with that identifier, optionally followed by an override block whose keys are a lowercase letter, any run of lowercase letters and hyphens, and a colon.
- Prose extraction: for a single-identifier document, the text between the top-level identifier heading and the first second-level section; for a multi-identifier document, the text of that identifier's own section.

### Identifier format

- `<PREFIX>-<digits>` and nothing else, where `<PREFIX>` is one uppercase token fixed for the project, declared by the layout key `id_prefix` and defaulting to `REQ`. No leading zeros, no upper bound on the number.
- `x00` is an epic; `x01` upward are that epic's requirements; one hundreds-block per epic.
- Maps to a generated integer-valued symbol whose value equals the number.
- Transitional coverage comment: the case-insensitive token `covers:` followed by one or more identifiers separated by commas, whitespace, or both, recognized to the end of that line. Each token is either a canonical identifier or a run of one or more hyphen-separated alphanumeric segments; a non-canonical token resolves only through the `legacy-id` alias table, and there is no hard-coded list of legacy prefixes.

### Hashes

- Store content hash: the first **16** hexadecimal characters of a SHA-256 over the whole normalized document text.
- Global fingerprint: a full SHA-256 (64 hexadecimal characters) over the newline-joined per-requirement payload `identifier|status|int(trace)|int(test)|title|source_path|content_hash|type|comma-joined derived-from`, requirements in ascending number order.
- Canonical hash: the first **32** hexadecimal characters of a SHA-256 over the LF-joined payload `identifier`, `status`, `trace`, `test`, `type`, comma-joined `derived-from`, `title`, and that identifier's own prose — each line stripped and its interior whitespace collapsed to single spaces. Frontmatter-order and formatting independent, distinct per declared identifier, and not interchangeable with the store hash; the two are told apart by length.

### Generated requirement-symbol artifact

The artifact is a source file in the host language. Its contents appear in this fixed order:

1. A documentation header stating that the file is generated and must not be hand-edited, naming the store directory it was compiled from, and stating how it is regenerated.
2. A suppression directive for the linter, then one for the formatter.
3. A comment line carrying a labelled fingerprint whose value is 64 hexadecimal characters (a full, untruncated SHA-256).
4. Whatever the host language requires in order for the items below to resolve: the integer-enumeration base the enumeration is built on, and the metadata record together with the lifecycle enumeration, both of which the hand-written declarations module defines and this artifact only refers to. The artifact declares no type of its own here; what a reader can observe is that those names resolve to the hand-written declarations and to nothing this file introduced.
5. One integer-valued enumeration, holding one member per requirement in ascending number order. Each member's name is the requirement identifier with its separator replaced by an underscore, its value is the requirement number, and it is followed by a documentation string reading `[<status marker>] <title> - <source path>` and then a blank line.
6. A constant holding the frozen set of deprecated members. It is emitted even when nothing is deprecated, in which case it is an empty set; otherwise it spans several lines.
7. A constant holding a mapping from requirement number to a metadata record. Each record is built by a positional call whose arguments are, in order: identifier, number, lifecycle, title, source path, trace-required flag, test-required flag, content hash, type, and the derived-from tuple.

Members appear in ascending number order. The file is written UTF-8 with LF line endings and a trailing newline, and is replaced atomically. The status marker used for a deprecated requirement is the longer, explicit wording that forbids adding new references.

### Debt baseline

```
# <header: shrink-only; the line shape; how to pay debt; the pruning action;
#  never add entries for new work>
<PREFIX>-<n> trace
<PREFIX>-<n> test
<PREFIX>-<n> test trace
```

Flags sorted and space-joined; entries ascending numerically; blank lines and comment lines skipped; malformed lines reported with a 1-based line number counted over the raw file.

### Orphan-module baseline

```
# <header: shrink-only; the remedies; the pruning action; quoting the configured exempt marker>
<repository-relative source path>
```

One path per line; the basename must contain a dot and the line must contain no space; rendered sorted lexicographically.

### Orphan-test baseline

```
# <header: shrink-only; the remedies; the pruning action; quoting the configured exempt marker>
path/to/test_file.<ext>::test_function
path/to/test_file.<ext>::ClassName::test_method
```

A path with an extension, zero or more `::`-separated class segments, and a final `::`-prefixed test segment; rendered sorted.

### Retired-identifier log

```
# <header: append-only; a tombstone is the only record a deleted identifier existed;
#  reusing a tombstoned identifier is rejected; identifiers are never reassigned>
<PREFIX>-<n><TAB><YYYY-MM-DD><TAB><last known title>
```

Records ascending by number; at least two tab-separated fields required; the title field optional; malformed lines skipped silently; the write is atomic, with the retry ladder, on the terms REQ-TRACE-061 fixes (temporary file in the same parent directory, then an atomic replace).

### Layout configuration (`rotaris-traceability.json`, at the repository root — REQ-TRACE-040)

```json
{
  "layout": {
    "requirements_dir": "docs/requirements",
    "id_prefix": "REQ",
    "generated_path": "src/requirement_ids.<ext>",
    "impl_roots": ["src"],
    "test_roots": ["tests"],
    "excused_test_roots": [],
    "baseline_path": "docs/requirements/debt-baseline.txt",
    "orphan_baseline_path": "docs/requirements/orphan-modules.txt",
    "test_orphan_baseline_path": "docs/requirements/orphan-tests.txt",
    "tombstone_path": "docs/requirements/retired-identifiers.tsv",
    "exempt_marker": "trace-exempt",
    "skip_parts": ["<generated-cache directory>", "<installed-dependency directory>", "fixtures"],
    "annotation_conventions": [
      {
        "name": "<convention name>",
        "extensions": [".<ext>", "..."],
        "reference_pattern": "<expression capturing one identifier or number>",
        "annotation_pattern": "<expression matching a whole annotation site>",
        "test_pattern": "<expression capturing a collectable test function name>",
        "exempt_module_pattern": "<expression matching an excused module>"
      }
    ]
  }
}
```

The values shown are the defaults; a repository that configures nothing behaves exactly as one that writes all thirteen of them. The two placeholder entries in `skip_parts`, like the source extension in `generated_path`, stand for names REQ-TRACE-039 leaves to the implementation language's toolchain; `fixtures` is the one component name that requirement fixes. Keys may also sit at the top level. Unknown keys are an error listing offenders and accepted keys, both sorted. Path values must be non-empty, relative, free of `..`, and are normalized to forward slashes. List-valued keys reject a bare string. `id_prefix` must be uppercase letters and digits, beginning with a letter and carrying no hyphen. `annotation_conventions` is an ordered list of objects carrying exactly the six keys shown, registered after the built-in convention; an expression that does not compile is a configuration error.

### Toolchain operations

The toolchain offers exactly four operations, every one of them reached from the desktop application and none of them from a shell. There is no invocation, no flag, no stream and no exit status.

| Operation | What it reports | Writes |
| --- | --- | --- |
| Check (REQ-TRACE-508) | errors and warnings grouped and ordered by REQ-TRACE-091, each located per REQ-TRACE-100; the statistics of REQ-TRACE-101; a stated "no violations" result; parse errors alone where the store will not parse | nothing |
| Regenerate (REQ-TRACE-509) | the artifact path, which of "regenerated" or "already up to date" was observed, the requirement count; parse errors where the store will not parse | the generated artifact and the retired-identifier log |
| Update baselines (REQ-TRACE-510) | per baseline, the file written and the resulting entry count | the three baselines |
| Compare against a base (REQ-TRACE-511) | one entry per change with its sites; the drift finding; "no base artifact"; "no requirement changes" | nothing |

| Aspect | Value |
| --- | --- |
| Repository root | the open workspace's, resolved by the discovery walk; never nominated by the user |
| Layout configuration | `rotaris-traceability.json` at that root (REQ-TRACE-040); no override path exists |
| Base revision default | the revision the working tree sits on |
| Combined order | regenerate, then rewrite the baselines against the fresh parse, then verify |
| Enforcement | the check gates nothing by itself; no control and no configuration key suppresses a finding |
| Concurrency | at most one operation of a kind per workspace in flight; a second request is refused with a stated reason |

Distinct results a surface must be able to state, each of them required by the operation named in the table above and none of them fixed here: no violations; a violation count; an error; a warning; a parse error; a configuration error naming the configuration path and its cause (REQ-TRACE-046, REQ-TRACE-512); an unanticipated failure naming what failed (REQ-TRACE-512); a regeneration outcome naming the artifact path and which of "regenerated" or "already up to date" was observed together with the requirement count (REQ-TRACE-509); the three baselines written, each with a path and an entry count (REQ-TRACE-510); the statistics (REQ-TRACE-101); "no base artifact to compare against" (REQ-TRACE-158); "no requirement changes" (REQ-TRACE-167); the per-change entries (REQ-TRACE-164); the count of unpropagated requirements; and the empty-store warning naming the store directory and which of the three empty findings holds.

Statistics fields (REQ-TRACE-101): total requirements; approved, traced and test-covered counts; and the four baseline-debt counts labelled trace, test, orphan and orphan-test.

Change-comparison entry, whose fields are REQ-TRACE-164's, whose obligation text per kind is REQ-TRACE-165's, and whose empty-site cases are REQ-TRACE-166's:

```
<KIND> <identifier> '<title>'[ (<from> -> <to>)]: <obligation text>[  <drift marker>]
    <file>:<line> (<kind>)
    ...
```

with a single "no annotation sites yet" placeholder for an added or modified change that has none, and no site entries at all for a removed or status change that has none.

### Progress protocol

Each line below is fixed by the requirement named beside it; this summary fixes nothing of its own.

- Phases: `reading`, `checks`, `coverage`, `recording`, `adopting` — the closed set of REQ-TRACE-210.
- Sequences: verification is `reading` then `checks` then `coverage` then `recording`; adoption is `reading` then `checks` then `coverage` then `adopting` then `recording` (REQ-TRACE-211).
- Phase report: the phase and the number of items it will report, a total of **0** meaning one indivisible step. It always precedes that phase's first item report (REQ-TRACE-213).
- Item report: the phase, a label, a **1-based** position, the phase total, an optional detail, and the deadline in seconds applying to the item in progress — the deadline being **absent** where the wait is unlimited, never zero (REQ-TRACE-213).
- Both are delivered on the pass's own thread (REQ-TRACE-214). With no consumer: no reporting work at all, and an identical report, identical records and identical writes (REQ-TRACE-215).
- Throttling: only above **20** items in a phase; minimum publication interval **0.1 s**; a phase change and a phase's last item are always published (REQ-TRACE-351).

### Board tokens

Each vocabulary below is closed by the requirement named beside it; this list holds no second copy of
any of them and adds nothing to any of them.

- Delivery columns: `backlog`, `ready`, `running`, `review`, `needs-update`, `done` (REQ-TRACE-232); plus `blocked`, which is a condition rather than a stage of progress (REQ-TRACE-241).
- Grouping axes: `delivery` (default), `health`, `lifecycle`, `epic`, `priority`, `source` (REQ-TRACE-293).
- Sort orders: priority-then-identifier (default), identifier, health-then-identifier (REQ-TRACE-287).
- Priority order: `Critical`, `High`, `Normal`, `Low`, then everything else (REQ-TRACE-288).
- Health tokens: `healthy`, `needs-update`, `incomplete-traceability`, `verification-failed`, `blocked`, `superseded`, `deprecated` (REQ-TRACE-252).
- Board actions: `release`, `return`, `accept`, `rerun`, `send-back`, `reject`, `hold`, `resume`, `answer-blocker`, `edit`, `create`, `accept-proposal`, `accept-change-work`, `keep-worktree` (REQ-TRACE-382).
- Blocker kinds: `dependency`, `conflict`, `decision`, `run-failure`, `stated` (REQ-TRACE-446).
- Blocker answer paths: choose, navigate, `resume` (the path described as clearing the blocker), inspect (REQ-TRACE-448).
- Relation tokens: `parent`, `children`, `derived-from`, `derived-requirements`, `supersedes`, `superseded-by`, `depends-on`, `blocks`, `refines`, `refined-by`, `conflicts-with`, `related-to` (REQ-TRACE-274).
- Detail sections: `requirement`, `relations`, `execution`, `traceability`, `verification` (REQ-TRACE-271).
- Review element keys, in order: agent summary; reported risks; completion claim; checks run; verification; changed files; traceability changes; unmet completion conditions; specification version; execution units; branch and worktree; proposals. Sides: claim, measurement, work (REQ-TRACE-420).
- Review decision order: accept, rerun, send-back, edit, reject, keep-worktree (REQ-TRACE-422).
- Queue controls: automatic, concurrency, stop, start (REQ-TRACE-479).
- Pane keys: `review`, `queue`, `editor`, `create`, `blockers` (REQ-TRACE-375); view identifier `requirements`; cross-view navigation targets: the workspace view and the version-control view (REQ-TRACE-475).
- Graph node kinds: `requirement`, `epic`, `implementation`, `test` (REQ-TRACE-326); an evidence node identifier is `<site kind>:<address>` (REQ-TRACE-331).
- Column header text: `<Label> · <count>`. Column keys that are project-supplied identifiers print as-is; other keys are title-cased by splitting on hyphens (REQ-TRACE-234).
- Test node identifiers: `path::function` or `path::Class::function` (REQ-TRACE-111).
- Evidence obligation kinds, in indicator order: `implementation-trace`, `covering-test`, `verification` (REQ-TRACE-258).
- Recorded-evidence states: `satisfied`, `stale`, `failed` (REQ-TRACE-270).
- Drag payload: a private application-specific transfer type, never plain text (REQ-TRACE-396).
- Run branch naming: the branch a unit run occupies is named by the requirement-execution `branch_template` REQ-GIT-074 defines, which is normative for the template, its placeholders and its default; this document restates neither and observes only that a unit's branch is derived from the requirement identifier and the unit id.
- Named on-disk files carried between a run and its review: the requirement's recorded source, and the run's proposed technical requirements — `proposed-requirements.json`, a JSON array of proposal objects in the run's artifact directory.

### Persisted state

Workspace configuration (travels with the repository). Every key below is registered by the settings
domain, which fixes its name, type and default; this table holds no second copy of any of them and
names only what this domain relies on each for. The scheduling keys are REQ-CONFIG-196's, the
human-in-the-loop and change-analysis keys REQ-CONFIG-198's, `permission_mode` REQ-CONFIG-122's and
`allow_unsandboxed_autonomous` REQ-CONFIG-124's, with the two together forming the elevation
REQ-CONFIG-411 defines:

| Key | Values | What this domain relies on it for |
| --- | --- | --- |
| `requirements.scheduling.mode` | `manual` / `automatic` | whether the queue picks the next candidate up on its own (REQ-TRACE-483) |
| `requirements.scheduling.*` (concurrency limit) | integer | how many units run at once; the control's own input ceiling of 64 is REQ-TRACE-481's and is not this key's |
| `requirements.change.analyze_changes` | boolean | when off, the board states why change analysis produced nothing |
| `requirements.human_in_the_loop.confirm_source_writes` | boolean | never consulted for an accepted derived-requirement proposal |
| `runtime.permission_mode` | e.g. `ask` / `autonomous` | board runs receive the permissive value for that run only |
| `runtime.allow_unsandboxed_autonomous` | boolean | the second half of the board-run elevation |
| requirement source configuration | — | which sources exist, which declare the create capability, which are writable |

Person- and installation-level preferences (stay on this machine). They live in the per-user desktop preference store, whose key set REQ-SHELL-006 registers. This domain owns what each of them means; the type and default of `requirements/fullPermissionRuns`, `requirements/fullPermissionNoticeSuppressed` and `requirements/answerWaitSeconds` are registered by REQ-CONFIG-405 and are repeated below only as the values this domain relies on:

| Key | Default |
| --- | --- |
| `requirements/filter/{text,epic,source,lifecycle,health,priority}` | `""` |
| `requirements/sort` | `priority` |
| `requirements/blocked_column` | `true` — any value other than the string `false`, case-insensitively, reads as true |
| `requirements/axis` | `delivery` |
| `workspaces/<resolved absolute path, or the literal default key>/requirementColumnFolds` | `{}` — one JSON object string, keys sorted, mapping column key to boolean |
| `requirements/fullPermissionRuns` | on |
| `requirements/fullPermissionNoticeSuppressed` | off |
| `requirements/answerWaitSeconds` | `0`, meaning indefinitely |

Boolean reads MUST tolerate however the settings backend wrote them: a text backend round-trips a boolean as a string, a native backend does not.

### Numeric constants

Every figure below is fixed by the requirement named beside it and is gathered here only so the whole
set can be checked at once; this table fixes nothing of its own, and where it and a defining
requirement differ, the requirement governs.

| Constant | Value | Defined by |
| --- | --- | --- |
| Content hash length | 16 hexadecimal characters | REQ-TRACE-036, REQ-TRACE-037 |
| Canonical hash length | 32 hexadecimal characters | REQ-TRACE-037 |
| Global fingerprint length | 64 hexadecimal characters | REQ-TRACE-052, REQ-TRACE-058 — the length of an untruncated SHA-256 in hexadecimal, which is what those two require |
| Deprecated-reference site cap | 5, then an "and N more" tail | REQ-TRACE-095 |
| Orphan-test annotation window slack above the span | 2 lines | REQ-TRACE-112 |
| Whole-file replacement retry ladder | 5 attempts in total; delays of 0.05 / 0.1 / 0.2 / 0.4 s before the four retries; the last attempt within 0.75 s of the first | REQ-TRACE-061 — the only replacement ladder this domain states, covering the generated artifact, the baselines, the retired-identifier log and the export destination, and cited by REQ-LIBRARY-176 |
| Consumer-layer version-control timeout | 30 s | REQ-TRACE-201 |
| Change-comparison version-control timeout | 30 s | REQ-TRACE-170 |
| Minimum supported window | 1000 × 680 | REQ-SHELL-022, which fixes the figure; REQ-TRACE-237 states what this domain guarantees at it |
| Open column width | minimum 276, maximum 340; margins 10 on every side | REQ-TRACE-238 (the two widths), REQ-TRACE-310 (the margin) |
| Folded rail | 8 characters of its own font wide; 2 heading lines; margin 4 | REQ-TRACE-310 (width and margin), REQ-TRACE-309 (heading lines) |
| Folded rail extra height during a drag | 1.5 lines | REQ-TRACE-318 |
| Folded column width during a drag | the open-column minimum, 276 | REQ-TRACE-318, over the minimum REQ-TRACE-238 fixes |
| Realised card widgets | the viewport band plus a margin of 5 cards above and 5 below; up to 20 released widgets retained per column for reuse | REQ-TRACE-360 |
| Search debounce | 150 ms | REQ-TRACE-363 |
| Evaluation retry while a read is in flight | 150 ms | REQ-TRACE-350 |
| Elapsed-clock redraw interval | 1000 ms | REQ-TRACE-352 |
| Progress throttle threshold / minimum publication interval | above 20 items / 0.1 s | REQ-TRACE-351 |
| Graph depth | floor 1, default 2, ceiling 3; not persisted | REQ-TRACE-323 |
| Graph neighbours admitted per node per level | 50, in identifier order, with the omitted count stated | REQ-TRACE-505 |
| Graph unexpanded-identifier list cap | 4, then an "and N more" tail | REQ-TRACE-324 |
| Blocked summary rows listed | 20, then a row stating how many more and filtering the board to them | REQ-TRACE-240 |
| Card dependency list cap | 4, then an "and N more" tail | REQ-TRACE-243 |
| Refusal-report cap inside a notice | 20 | REQ-TRACE-415 |
| Concurrency control ceiling | 64 | REQ-TRACE-481 |
| Default concurrency limit | 2 | REQ-CONFIG-196, which registers the key and its default; REQ-TRACE-483 states that a workspace setting none of the queue keys takes it |
| Supported populated-column bound on an open axis | 100 | REQ-TRACE-300 |
| Interface responsiveness budget | 100 ms to put a board on screen once the engine has answered, and 100 ms for the post-debounce filter recomputation | REQ-TRACE-239 (board on screen), REQ-TRACE-367 (post-debounce recomputation) |
| Primary action height / other control height | 32 / 24 | REQ-TRACE-491 |
| Closed-vocabulary / open-vocabulary drop-down width | 240 / 150 | REQ-TRACE-490 |
| Contrast floors | 3:1 for status marks against the card ground; 4.5:1 for alert text | REQ-TRACE-261 (status marks), REQ-TRACE-247 (alert text) |
| Relative-age thresholds | under 60 s, under 1 hour, under 1 day, otherwise days | REQ-TRACE-250 |
| Wait budget | not fixed here — `runtime.approval_timeout_seconds` (REQ-CONFIG-126, REQ-TOOLS-055), cited by REQ-TRACE-467 | REQ-CONFIG-126 |
| Sweep scale expectation | order 10^4 annotation sites over order 10^3 files in about 1 s | REQ-TRACE-088, whose reference conditions are part of the figure |
| Virtualisation acceptance | a 300-card column realises fewer than a quarter of its members; the realised count does not grow with column length; revealing a named card realises that card and its band only | REQ-TRACE-365 |

## Open Questions

None outstanding. Every open question raised in the draft was resolved; see [`resolutions/08-requirements-traceability.md`](resolutions/08-requirements-traceability.md).
