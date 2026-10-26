# Requirements Board and Traceability — Requirement Store: Layout and Discovery

Part 1 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-001 – REQ-TRACE-050.

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
