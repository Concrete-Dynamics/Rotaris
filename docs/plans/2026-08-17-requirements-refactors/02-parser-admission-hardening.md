# Plan 02 — Harden the generated-parser admission check

**Status:** Wave 1 done (2026-08-17); waves 2–3 deferred · **Date:** 2026-08-17 · **Source:** review finding F3 (Medium), § 6.2
**Size:** S · **Risk:** Low (engine-only; the check can only get stricter)
**Depends on:** the SWR-3123 branch (`feat/swr-3123-generated-parser-runtime`)
being merged — or land these waves on that branch before merge.
**Touches:** `src/rotaris_core/requirements/sources/generated.py`,
`tests/unit/requirements/test_generated_parser.py`,
`docs/requirements/3100-requirement-sources/SWR-3123-generated-requirement-parser.md`,
the source-proposal offer surface (wave 2)

> Line references below are from the pre-merge worktree state of
> `generated.py`; re-verify after the merge.

---

## 1. Problem

SWR-3123's acceptance criteria promise:

> "A parser importing outside the standard library, or making a network,
> write, subprocess or clock call, is refused before execution with the
> construct and line named."

The static admission (`admit_parser`, `generated.py:282–320`) judges literal
names only (`_check_call`, `252–279`: `ast.Name` and `ast.Attribute` heads;
bare-name references at `315–316`; `__globals__`/`__builtins__` attributes at
`317–318`). Concrete constructs that **pass admission today and break the
promise**:

1. **`getattr` indirection.** `getattr(path, "write_text")("…")` performs a
   refused write — the outer call's `func` is a `Call` node, which
   `_check_call` never inspects. `getattr(x, "__globals__")` likewise bypasses
   the banned-attribute check. `g = getattr` aliasing works the same way.
2. **`sys.modules` reach.** `sys.modules["os"].system("…")` contains no banned
   name: `modules` is an ordinary attribute, `system` is in neither
   `_BANNED_NAMES` (`117–129`) nor `_WRITE_METHODS` (`139–153`). The module
   comment at `generated.py:92–93` — "its dangerous reach (``sys.modules``
   tricks) requires calls the banned-name check refuses" — is **not true as
   written**; `os` is inevitably imported in the child before the parser runs.
3. **`__builtins__` as a bare name.** `exec` injects `__builtins__` into the
   parser's globals; `__builtins__` is only refused as an *attribute*, so
   `__builtins__` → subscript/attribute chains are reachable as a `Name`.
4. **The class-hierarchy escape.** `().__class__.__mro__[…].__subclasses__()`
   — the standard route to `os` without an import. `__class__` is common and
   harmless alone; `__mro__`/`__subclasses__`/`__bases__` after it are the
   load-bearing links and are not banned.

The trust model still holds — the parser is reviewed, committed, and
hash-pinned, and the child re-admits before executing
(`parser_host.py:72–104`), so this is defense-in-depth rather than an open
door. But the spec's stated guarantee and the shipped wall disagree, and a
*generated* parser can stumble into `getattr` forms innocently. Either the
wall moves or the claim does; this plan moves the wall (and keeps the claim).

## 2. Goal / non-goals

**Goal.** The four constructs above (and their aliases) are refused before
execution, with construct and line named; every comment and docstring in the
module states what the check actually does; the acceptance dialog shows the
admission verdict, not only the code.

**Non-goals.** Turning the admission into a sandbox — it is, per the spec's own
words, "a smaller permitted language, checked deterministically, rather than a
boundary enforced at runtime". Runtime enforcement (audit hooks, OS sandbox)
stays out of scope (SWR-2507's constraint stands). Changing the parser
*contract* (stdout, `sys.argv`) is wave 3 and optional.

## 3. Design

### 3.1 Extend the banned-names set

```python
_BANNED_NAMES = frozenset({
    "__import__", "breakpoint", "compile", "eval", "exec",
    "globals", "input", "memoryview", "vars",
    # additions:
    "getattr", "setattr", "delattr", "locals", "__builtins__",
})
```

Because `admit_parser` refuses a banned name **wherever it appears** — call
(`262–263`), attribute (`268–269`), bare reference (`315–316`) — banning
`getattr` also kills `g = getattr` aliasing and `getattr` passed as an
argument. That property is why the fix is a set extension rather than new
traversal logic; preserve it (add a test asserting the bare-reference case).

*Considered and rejected:* admitting literal-string `getattr(x, "name")` and
routing `"name"` through the attribute judgement. It is more permissive and
more code for a construct a parser has no need of — reading files and matching
patterns never requires reflective attribute access. A refusal message that
says "use the attribute directly" costs the parser author one edit.

### 3.2 A banned-attributes set

Generalise the hard-coded pair at `317–318` into:

```python
#: Attributes whose *reach* is refused on any receiver. The receiver is opaque
#: to a static read; each of these is a link in an escape chain and none has a
#: place in reading files and emitting JSON.
_BANNED_ATTRIBUTES = frozenset({
    "__globals__", "__builtins__", "__subclasses__", "__mro__", "__bases__",
    "__code__", "__closure__", "mro", "modules",
})
```

`modules` refuses the `sys.modules` route (and any `x.modules` — a harmless
spelling refused, exactly the error direction `_check_call`'s docstring already
claims at `256–259`). `mro`/`__mro__`/`__subclasses__`/`__bases__` cut the
class-hierarchy escape. `__code__`/`__closure__` close function-object
introspection.

### 3.3 Truthful comments

- Rewrite `generated.py:89–93`: `sys` stays allowed for `sys.argv` /
  `sys.stdout` (the contract's channel); its dangerous reach is refused **by
  attribute name** (`modules`) and the reflective escapes **by banned names** —
  not, as currently claimed, by the banned-name check alone.
- Extend `admit_parser`'s docstring with one sentence naming the model: the
  admission refuses the constructs a parser plausibly produces *and the known
  cheap escapes*; the pin, the review and the child-side re-admission are the
  trust anchor.

### 3.4 What stays possible, stated

After this change the remaining reflective residue (`__class__` alone,
`type()`, `__dict__` reads) leads nowhere the banned sets don't cut, but
admission is still a static check and Rice's theorem is not repealed. The spec
already carries the honest framing ("what stands in for an OS sandbox where
there is none… not a substitute dressed up as one" — SWR-3123 § "admissible
before it is run"); wave 2 makes sure the module says the same.

## 4. Waves

### Wave 1 — close the gaps

1. Extend `_BANNED_NAMES` and add `_BANNED_ATTRIBUTES`; generalise the
   attribute check in `admit_parser`; keep refusal wording per-construct
   ("call to 'getattr' is refused", "reaching 'modules' is refused") with line
   numbers.
2. Fix the two comments (3.3).
3. Tests, one refusal case per construct, asserting **message and line**:
   `getattr` call / bare reference / alias; `setattr`; `delattr`;
   `sys.modules[...]` chain; `x.modules` attribute; `__builtins__` bare name;
   `().__class__.__mro__` chain; `type(x).mro()`; plus a **still-admissible
   corpus**: a realistic parser (pathlib walk + `re` + `json.dumps` +
   `sys.stdout.write` + `open(p, encoding="utf-8")` + `str.replace(a, b)`)
   must remain admissible — the check may not creep into refusing the language
   it exists to permit.
4. Gate: `rtk pytest tests/unit/requirements -n auto` green; the two-run
   determinism and hash-pin tests untouched and green; `reqtocode check`.

### Wave 2 — the verdict is part of the review

1. Surface `ParserAdmission.describe()` in the source-proposal acceptance
   flow (the `SourceProposalOffer` rendering), so "reviewed and accepted"
   means the user saw the verdict alongside the code. Locate the render site
   at implementation (`describe_proposal` / the offer widget); keep the
   verdict text the engine's own — the desktop derives nothing (SWR-3311).
2. Spec touch-up in `SWR-3123-…md`: no criterion changes (wave 1 makes the
   promise true for the named constructs); add the verdict-visibility sentence
   to the acceptance flow paragraph if absent. Re-run the spec's test
   portfolio mapping.
3. Gate: desktop suite green including the offer-surface test
   (`apps/rotaris/tests/test_requirements_source_offer.py` per the spec's
   portfolio table).

### Wave 3 (optional, decision required) — narrow the contract itself

Drop `sys` from `ALLOWED_IMPORTS` by injecting the repository root as a plain
namespace variable and reading output from the namespace instead of stdout.
**Recommendation: defer.** It is a contract change (spec § "pure function"
names stdout as the channel; `parser_host._child_main` sets `sys.argv`,
`91–93`), it invalidates any parser generated in the meantime, and wave 1
already refuses the dangerous reach of `sys`. Revisit only if generated
parsers in the wild remain zero when the next hardening pass happens. If
taken: spec edit + `parser_host` + discovery's parser-generation prompt +
migration note, one slice.

## 4a. What landed, and why waves 2–3 did not

**Wave 1 is in**, on master's merged `generated.py`. `_BANNED_NAMES` gained
`getattr`, `setattr`, `delattr`, `locals` and `__builtins__`; the inline
`("__globals__", "__builtins__")` tuple became `_BANNED_ATTRIBUTES`, carrying
`modules`, `mro`, `__mro__`, `__bases__`, `__subclasses__`, `__code__` and
`__closure__` besides. The three comments now describe the mechanism that exists.

**The gap was live, not theoretical.** Measured against the pre-change check, a
parser spelling its write as `getattr(Path("ran.marker"), "write_text")("ran")`
was *admitted, spawned and executed* — `source.read()` reached
`ParserRunError: the parser's output is not JSON`, which is the error of a parser
that ran. The write had already happened. That case is now a row of
`test_an_inadmissible_parser_is_never_executed`, so the promise it proves is the
criterion's own ("refused *before execution*"), not merely that a construct gets
named.

Every one of the 16 new assertions fails against the pre-change check and passes
after; the admissible corpus passes against both, which is what makes it a guard
against the wall creeping rather than decoration.

**Wave 2 (the verdict in the acceptance dialog) is deferred into SWR-3123 phase
2, because it has nothing to attach to today.** A `PROGRAMMATIC` proposal carries
no parser — only a `rationale` and a `declarative_blocker`
(`discovery.py:332–360`, built at `:711–724`). `validate_proposal` short-circuits
every programmatic proposal with `ValidationIssueKind.NOT_DECLARATIVE`
(`discovery.py:806–825`) and `accept_proposal` raises whenever `config is None`
(`:1092–1109`), so such a proposal can never reach an offer surface; the desktop
offer renders a declarative config document and is empty for one
(`requirements_controller.py:1697–1699`). Building that path *is* phase 2, and
this requirement's own portfolio already names its covering E2E — an
`apps/rotaris/tests/test_requirements_source_offer.py` test that does not exist
yet. Note the verdict is already visible on the path that does exist:
`GeneratedParserSource.read()` raises with `admission.describe()` embedded
(`generated.py:581–586`). What is missing is the verdict at *acceptance* time.

**Wave 3 (drop `sys` from `ALLOWED_IMPORTS`) stays deferred**, as § 4 recommends.
Wave 1 refuses `sys`'s dangerous reach by attribute name, which was the reason to
consider it.

**Explicitly not done, and not an oversight:** restricting `__builtins__` in the
child's exec namespace (`parser_host.py:91,96`). That is runtime enforcement,
which § 2's non-goals exclude and which SWR-3123 deliberately does not claim.

## 5. Specification & traceability impact

- SWR-3123 stays `draft` until its own implementation slice completes; wave 1
  lands under its existing id (`@traces(SWR.SWR_3123)` already marks the
  functions). No new SWR id needed — this is the requirement's own acceptance
  criterion being made true.
- Wave 2's verdict-visibility sentence is an edit inside SWR-3123's body, not
  a new requirement.

## 6. Test strategy

The refusal corpus (wave 1.3) is the durable artefact: every documented bypass
becomes a named test that can never silently regress. Keep it table-driven
(construct → expected message fragment → expected line) so the next gap found
is one row. The admissible corpus guards the other direction.

## 7. Risks & rollback

- **False refusals** of legitimate parser spellings — mitigated by the
  admissible corpus; the design accepts refusing harmless spellings
  (`x.modules`) by explicit precedent.
- **Drift against the merged branch** — if SWR-3123 merges with these
  functions changed, re-verify line refs and re-run the bypass corpus first;
  the corpus, not the line numbers, is the specification of this plan.
- **Rollback:** revert the two frozensets; nothing downstream depends on the
  new refusals.

## 8. Acceptance criteria

- [ ] Every construct in § 1 is refused with construct and line named, by test.
- [ ] The realistic-parser corpus stays admissible, by test.
- [ ] `generated.py`'s comments describe the actual mechanism (no claim about
      `sys.modules` that the code does not enforce).
- [ ] The acceptance dialog shows the admission verdict.
- [ ] SWR-3123's acceptance criterion holds as written against the corpus.
