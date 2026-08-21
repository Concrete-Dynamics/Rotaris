---
req-id: SWR-3123
status: draft
trace: required
test: required
title: "A generated parser reads a store no configuration can describe"
epic: SWR-3100
date: 2026-08-17
---

# SWR-3123 — A generated parser reads a store no configuration can describe

SWR-3106 already models this outcome and calls it a `programmatic` proposal —
the answer discovery gives when a field mapping cannot express a source — and
gates it behind a stated reason. It has never had an implementation. Discovery
can therefore *say* "this repository needs a parser" and nothing can act on it,
which makes the honest answer also the useless one.

Extending the configuration language instead is a losing race. Sections today,
tables tomorrow, then a CSV, a spreadsheet export, an issue tracker dump: each
shape is a grammar extension, a reader, and a test portfolio, and the set is not
enumerable. A parser is bounded work once, for every shape at once.

What it costs is the thing a configuration never costs: Rotaris executes code it
did not write, on every read, for as long as the workspace is configured. The
cost is not avoidable by care — it is avoidable only by constraining what such a
parser may be, which is what this requirement does.

Requirement: where no declarative configuration can express a source, the
discovery agent may write a **parser**, which becomes an artefact of the user's
own repository and which Rotaris runs under a fixed, enforced contract to read
requirements and their state.

### It belongs to the project, not to Rotaris

The parser is written into the workspace's own tree, in the open, to be
committed like any other file the project owns. This is the difference between
"Rotaris executes model-written code" and "the agent wrote your project a
parser, which you reviewed and committed" — the trust the project already
extends to its own `conftest.py` or pre-commit hook.

Consequences, all of them load-bearing: the parser is diffable and reviewable by
the team, a change to it is a visible commit rather than a silent mutation of
Rotaris' private state, and it survives without Rotaris. The accepted
configuration records the parser's content hash; a parser whose hash has moved
is not run until it is accepted again.

### It is a pure function, and admissible before it is run

The contract is narrow enough to state completely: repository root in,
requirements out on stdout as canonical JSON. No network, no writes, no
subprocess, no shell, no clock, no environment. Bounded by a timeout and killed
on it.

Because the contract is that narrow, **admissibility is decided statically,
before the parser is ever executed** — the import surface and the calls it makes
are read from its syntax tree and anything outside the contract is a refusal
naming the construct and its line. This is what stands in for an OS sandbox
where there is none (SWR-2507 probes unavailable on native Windows), and it is
not a substitute dressed up as one: it is a smaller permitted language, checked
deterministically, rather than a boundary enforced at runtime.

### It runs the same on every operating system

A parser that reads a store correctly on the machine it was generated on and
misreads it on a colleague's is worse than no parser, because the two disagree
silently about what the project requires.

- **The standard library only, and the interpreter is Rotaris' own.** No
  third-party import, so the parser needs no environment the workspace happens
  to have, and a distributed Rotaris can run it with nothing installed. This is
  the constraint ReqToCode's own parser already accepts for the same reason.
- **No path, separator or line-ending assumption.** Locations are emitted as
  repository-relative POSIX paths on every host, and CRLF and LF inputs produce
  identical output — which is what keeps SWR-3107's hashes equal across a team.
- **Ordering is stated, never inherited.** Directory iteration order, filesystem
  case-sensitivity and locale collation differ per host, so the parser sorts
  explicitly and its output order is a property of the content.
- **No dependence on the working directory** or on any absolute path: the
  repository root is an input.

### It says what it did not read

A configuration that stops matching fails loudly at a named field. A parser that
stops matching returns sixty-one of sixty-two requirements and nobody notices —
the silent partial read is the failure this whole area exists to prevent, and it
is the one a parser makes easy.

So the contract carries a second output beside the requirements: every document
the parser considered and did not claim. An unclaimed count that moves is
surfaced against the source, not discarded, so a store whose format drifted is
visible as drift rather than as requirements that quietly ceased to exist.

### Everything SWR-3106 guarantees still holds

The parser is a proposal: validated by running it, shown before it is written,
persisted only on acceptance. Validation runs it **twice** and compares the
output byte for byte, because non-determinism is the characteristic defect of
generated code — iteration order, dict ordering, a stray timestamp — and it is
invisible in a single run. Ids must be found in the artefacts, never invented
(SWR-3121). The parser reads; it declares no write capability (SWR-3105), so
the board offers no edit it cannot perform.

A declarative configuration is preferred wherever one is possible. This path is
reached only with the stated reason SWR-3106 already requires.

## Acceptance criteria

- A repository no declarative configuration can express is read through a
  generated parser, and its requirements appear on the board with their state.
- The parser is written into the workspace tree and is a normal, committable
  file; nothing executable is kept in Rotaris' private state.
- A parser importing outside the standard library, or making a network, write,
  subprocess or clock call, is refused before execution with the construct and
  line named.
- The same parser and the same tree produce byte-identical output on Windows,
  macOS and Linux, under CRLF and LF checkouts alike, and emit
  repository-relative POSIX locations on all of them.
- A parser whose output differs between two runs over an unchanged tree fails
  validation and is not persisted.
- A parser whose content hash has changed since acceptance is not run until it
  is accepted again.
- Documents the parser did not claim are reported and counted against the
  source, never dropped silently.
- A parser that exceeds its timeout is killed and reported, and the board keeps
  its last good state.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Admissibility refuses each forbidden construct with its line; a hash mismatch refuses to run; a two-run comparison catches a parser whose output depends on iteration order | The parser contract and its static check | `tests/unit/requirements/test_generated_parser.py` |
| Unit | A fixture parser over a fixture tree emits identical bytes for CRLF and LF inputs and POSIX locations regardless of host separator | OS independence of the contract | `tests/unit/requirements/test_generated_parser_portability.py` |
| Integration | A synthetic repository whose layout no configuration expresses is discovered, its parser validated, persisted and re-read through the registry with unclaimed documents reported | Discovery + parser + registry | `tests/integration/test_requirement_source_discovery.py` |
| User-flow E2E | A user opens a project with an unmappable requirement layout, reviews and accepts the generated parser, and the requirements appear on the board | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_source_offer.py` |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
