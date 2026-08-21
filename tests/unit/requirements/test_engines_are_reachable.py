"""Nothing in this epic is `approved` while only tests can reach it.

This is the test slice 7 exists for, and it is worth saying plainly why it was
not written earlier. Every gate before it asked whether the code was *correct*.
None asked whether the code was *reached*. So five model-judgement Protocols
shipped with no implementation, three engines were constructed only by their own
tests, and every one of the requirements behind them stood at ``approved`` — the
status that tells ReqToCode, and therefore everybody reading ``swr.py``, that the
behaviour is delivered and enforced.

A test that a stub satisfies is a test that proves nothing. So is a requirement
whose only caller is the test that verifies it. This file is the second half of
what ``@traces`` and ``@verifies`` already do: they prove a requirement has code
and a test, and this proves the code is on a path a user can reach.

It is deliberately blunt. It reads the shipped source, not the test suite, and
it names what it could not find.
"""

from __future__ import annotations

import ast
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, NamedTuple

import pytest

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


class _Site(NamedTuple):
    """One call: where it is, the module-level function it sits in, how it is spelled."""

    module: str
    line: int
    #: The enclosing module-level function, ``""`` at module level or in a method.
    enclosing: str
    #: ``True`` for ``thing(...)``, ``False`` for ``obj.thing(...)``.
    bare: bool

    def __str__(self) -> str:
        return f"{self.module}:{self.line}"


REPO_ROOT = Path(__file__).resolve().parents[3]
SHIPPED = (REPO_ROOT / "src", REPO_ROOT / "apps" / "rotaris" / "src")

#: Engine -> (the names that count as reaching it, the requirement it carries).
#:
#: Alternatives rather than one name, because two of these are reachable more
#: than one way: the scheduling decision is either taken by constructing
#: :class:`DeliveryScheduler` or by calling the pure :func:`schedule` it wraps,
#: and either is a real path. Naming both is also what keeps this table honest —
#: its first draft demanded a ``RequirementScheduler`` that has never existed
#: under that name, which would have failed forever for the wrong reason.
#: The third element is the module that *declares* the engine. Calls from inside
#: it do not count: ``DeliveryScheduler.decide`` calling its own ``schedule()``
#: is the engine talking to itself, and treating that as a consumer is how this
#: test reported scheduling as reachable while nothing outside the module had
#: ever asked it anything.
ENGINES = {
    "impact analysis": (
        ("ImpactAnalyzer",),
        "src/rotaris_core/requirements/change/impact.py",
        "SWR-3503 (agentic impact analysis)",
    ),
    "decomposition": (
        ("Decomposer",),
        "src/rotaris_core/requirements/execution/decomposition.py",
        "SWR-3404 (automatic decomposition)",
    ),
    "scheduling": (
        ("DeliveryScheduler", "schedule"),
        "src/rotaris_core/requirements/execution/scheduler.py",
        "SWR-3412 (requirement scheduling)",
    ),
    "technical derivation": (
        ("RequirementDerivation",),
        "src/rotaris_core/requirements/execution/derivation.py",
        "SWR-3411 (derived technical requirements)",
    ),
    "verification": (
        ("plan_verifications",),
        "src/rotaris_core/requirements/delivery/verification_pass.py",
        "SWR-3221 (the verification pass)",
    ),
    "evidence propagation": (
        ("EvidencePropagator",),
        "src/rotaris_core/requirements/change/propagation.py",
        "SWR-3513 (stale evidence propagates)",
    ),
    "re-verification after a reword": (
        ("NoImpactResolver",),
        "src/rotaris_core/requirements/change/outcomes.py",
        "SWR-3504 (no behavioural impact)",
    ),
    "outcome to units": (
        ("plan_outcome",),
        "src/rotaris_core/requirements/change/outcomes.py",
        "SWR-3505 (impact outcomes create the right execution units)",
    ),
    "clarification": (
        ("ClarificationDesk",),
        "src/rotaris_core/requirements/change/outcomes.py",
        "SWR-3506 (an unclear change asks rather than guesses)",
    ),
    "conflicts": (
        ("evaluate_conflicts",),
        "src/rotaris_core/requirements/change/conflicts.py",
        "SWR-3511 (conflicting requirements block)",
    ),
    "dependency cycles": (
        ("find_cycles",),
        "src/rotaris_core/requirements/change/dependencies.py",
        "SWR-3510 (dependency gating)",
    ),
    "unit integration": (
        ("RequirementIntegrator",),
        "src/rotaris_core/requirements/execution/integration.py",
        "SWR-3409 (multi-unit integration)",
    ),
    "removal analysis": (
        ("RemovalAnalyzer",),
        "src/rotaris_core/requirements/change/removal.py",
        "SWR-3509 (what a removed requirement leaves behind)",
    ),
    "migration execution": (
        ("MigrationExecutor",),
        "src/rotaris_core/requirements/change/superseding.py",
        "SWR-3507 (executing the migration worklist)",
    ),
    "superseded deprecation": (
        ("SupersedingCompletion",),
        "src/rotaris_core/requirements/change/superseding.py",
        "SWR-3508 (a superseded requirement is deprecated)",
    ),
    "trace rewriting": (
        ("SourceTraceEditor",),
        "src/rotaris_core/requirements/change/trace_editor.py",
        "SWR-3507 (the annotation edits a worklist asks for)",
    ),
    "migration plans": (
        ("MigrationPlanStore",),
        "src/rotaris_core/requirements/change/migration_store.py",
        "SWR-3518 (the worklist survives the read that planned it)",
    ),
    # Not a class, and that is exactly why it needed an entry: the reachability
    # rule below walks *constructions*, so the whole migration lane could ship
    # complete with its one entry point called by nothing — which is the state
    # this lane found it in.
    "migration approval": (
        ("accept_migration", "answer_decision"),
        "src/rotaris_core/requirements/change_host.py",
        "SWR-3507 (the only path from a planned worklist to changed code)",
    ),
}

#: **This table is empty, and that is the outcome it was built for.**
#:
#: It held the engines this guard found unreachable, as ``xfail(strict=True)``
#: rather than as omissions — because leaving them out would have made the
#: guard's silence mean "everything is reachable", which is exactly the reading
#: that let SWR-3409 and SWR-3504 stand at ``approved`` with nothing behind them.
#:
#: Its first version listed four, and the four were the ones Slice 7 happened to
#: be repairing; nothing chose them as *the* engines a user can cause. Extending
#: the table for SWR-3221 found two more that no shipped code constructed. The
#: propagation lane wired ``NoImpactResolver``, which turned the test red and
#: forced that entry out. The landing lane wired ``RequirementIntegrator``
#: — ``integration_for`` in ``execution/cli_host.py``, passed as ``integrate=``
#: by both the desktop's ``_flow`` and the headless ``run_requirement`` — and
#: forced out the last one.
#:
#: ``strict=True`` is the only mechanism here that makes a table shrink rather
#: than rot, and it is why this one is a comment now instead of a list of two.
#: **Re-add it, with the xfail, the next time this guard finds an engine nothing
#: reaches.** An entry deleted quietly is worse than no table at all.
UNREACHED_ENGINES: dict[str, tuple[tuple[str, ...], str, str]] = {}


#: Protocol -> the requirement it carries. The signature is **not** written here.
#:
#: Three drafts of this table hand-copied the signature, and each one passed for
#: a reason that had nothing to do with the code being reachable. First it named
#: only the method — but ``classify`` also belongs to ``CircuitBreaker``, so all
#: five looked implemented. Then it added "the file mentions the protocol", which
#: is weaker than it sounds: all six analysts live in one module whose docstring
#: names all five protocols, and three of the five declare ``propose``, so
#: ``DecompositionAnalyst`` satisfied ``DerivationModel``. Then it added the
#: argument type, which killed that bleed but let the *consumer* in: both
#: ``ImpactAnalyzer.analyse(request: ImpactRequest)`` and
#: ``RequirementDerivation.propose(request: DerivationRequest)`` match their own
#: protocol's argument exactly, because an engine is written against the very
#: judgement it consumes.
#:
#: So the table stopped carrying the signature. :func:`_protocol_signature` reads
#: it off the ``Protocol`` declaration, and a provider must match method,
#: argument *and return type*. That last one is the discriminator the earlier
#: drafts lacked and is not a trick: an implementation hands back the raw payload
#: the protocol promises (``Mapping[str, object]``), while a consumer hands back
#: its own domain object (``ImpactAnalysis``,
#: ``tuple[TechnicalRequirementProposal, ...]``). The division of labour this
#: epic is built on — analysts stop at "JSON to mapping", engines own the
#: tolerant reader — is exactly what tells the two apart.
#:
#: A copied fact can drift from its source; a read one cannot.
PROTOCOLS = {
    "SourceAnalyst": "SWR-3106 (agent-assisted source discovery)",
    "DecompositionModel": "SWR-3404 (automatic decomposition)",
    "DerivationModel": "SWR-3411 (derived technical requirements)",
    "ImpactModel": "SWR-3503 (agentic impact analysis)",
    "MigrationAnalyst": "SWR-3507 (superseding migration)",
}


@lru_cache(maxsize=1)
def _sources() -> tuple[tuple[str, str, ast.Module], ...]:
    """Every shipped module, parsed once.

    Parsed once because it is parsed a lot: fourteen parametrised cases over two
    package trees, and a unit test that costs a minute is a unit test people
    stop running.
    """
    parsed: list[tuple[str, str, ast.Module]] = []
    for root in SHIPPED:
        for path in root.rglob("*.py"):
            source = path.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source)
            except (SyntaxError, UnicodeDecodeError):  # pragma: no cover
                continue
            parsed.append((path.relative_to(REPO_ROOT).as_posix(), source, tree))
    return tuple(parsed)


@lru_cache(maxsize=1)
def _call_index() -> dict[str, tuple[_Site, ...]]:
    """Every name the shipped source calls, mapped to where it calls it.

    One walk over everything, not one walk per name asked about. The earlier
    shape — a cached lookup that re-walked all 777k nodes for each new name —
    was cached in the wrong place: the fourteen parametrised cases below ask
    about a dozen distinct names, and the two protocol tests ask again for every
    provider they discover, so the walk ran twenty times for facts that do not
    change between questions. That cost more than the rest of this directory's
    tests put together, and a guard nobody wants to run guards nothing.
    """
    index: dict[str, list[_Site]] = {}
    for relative, _source, tree in _sources():
        for enclosing, node in _calls_in(tree):
            func = node.func
            names: set[str] = set()
            bare = isinstance(func, ast.Name)
            if isinstance(func, ast.Name):
                names.add(func.id)
            elif isinstance(func, ast.Attribute):
                names.add(func.attr)
                factory = _factory_owner(func.value)
                if factory:
                    names.add(factory)
            for name in names:
                index.setdefault(name, []).append(
                    _Site(relative, node.lineno, enclosing, bare),
                )
    return {name: tuple(sites) for name, sites in index.items()}


@lru_cache(maxsize=1)
def _branch_attribute_index() -> dict[str, frozenset[str]]:
    """Attribute names the shipped source *branches on*, mapped to the modules doing it.

    Same reasoning as :func:`_call_index`, for the same reason: the switch guards below
    are parametrised, and each case re-walked every module -- and re-walked each
    ``if``/``or``/``not`` subtree inside it -- to answer one question about one name.
    Six cases spending 1.5s apiece on a walk whose answer is identical every time.
    """
    index: dict[str, set[str]] = {}
    for relative, _source, tree in _sources():
        for parent in ast.walk(tree):
            if not isinstance(parent, ast.IfExp | ast.If | ast.BoolOp | ast.UnaryOp):
                continue
            for node in ast.walk(parent):
                if isinstance(node, ast.Attribute):
                    index.setdefault(node.attr, set()).add(relative)
    return {attr: frozenset(modules) for attr, modules in index.items()}


def _modules_branching_on(switch: str) -> list[str]:
    """Shipped modules that decide something on *switch*, declarations excluded.

    ``config/schema.py`` and ``config/defaults.py`` are where a switch is *declared*;
    a branch there is the setting describing itself, not the product behaving
    differently because of it.
    """
    return sorted(
        relative
        for relative in _branch_attribute_index().get(switch, frozenset())
        if not relative.endswith(("config/schema.py", "config/defaults.py"))
    )


def _calls_in(tree: ast.Module) -> Iterator[tuple[str, ast.Call]]:
    """Every call in *tree*, paired with the module-level function it sits in.

    ``ast.walk`` forgets where it has been, and that is the one thing needed to
    follow a factory: ``SourceDiscoveryAnalyst`` is built at ``analysts.py:1075``
    *inside* ``source_analyst_for``, so the question "does anything outside this
    module build one" is really "does anything outside this module call
    ``source_analyst_for``". A flat list of call sites cannot ask that.

    **Methods are recorded as enclosed by nothing, and that restriction is the
    whole point.** :func:`_reached_from_outside` hops on this name, and it hops
    into :func:`_constructor_sites`, which indexes attribute calls by attribute
    name. ``super().__init__(...)`` is an attribute call, so ``__init__`` has 147
    call sites across 81 shipped modules; ``run`` has 62 across 40. A provider
    whose only in-module construction sat inside a method called ``__init__``
    would therefore be "reached" from eighty-one unrelated places — green, and
    about nothing. That is this file's original defect (identified by a name
    other things also have) in the one helper the signature-matching hardening
    does not cover. A factory is a module-level function by nature; refusing to
    hop through methods costs nothing real and closes the whole surface.
    """

    def descend(node: ast.AST, enclosing: str, in_class: bool) -> Iterator[tuple[str, ast.Call]]:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef):
                yield from descend(child, enclosing, True)
                continue
            if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
                yield from descend(child, "" if in_class else child.name, in_class)
                continue
            if isinstance(child, ast.Call):
                yield enclosing, child
            yield from descend(child, enclosing, in_class)

    return descend(tree, "", False)


def _factory_owner(value: ast.expr) -> str:
    """The class in ``Thing.of(...)`` or ``module.Thing.of(...)``, if that is one.

    A classmethod factory builds the thing just as surely as its constructor
    does, and missing it would report a reachable engine as unreachable — the
    mirror of the false positives above, and the more insidious one, because a
    red test gets investigated and a green one does not.

    Restricted to names that *look* like classes, which is the whole reason this
    is a separate function. Without that, ``schedule`` — a bare function name in
    the alternatives below — would count any ``schedule.anything(...)`` on a
    local variable as reaching the scheduling engine. The convention is the only
    signal available at this level, and it is one this repository keeps.
    """
    owner = (
        value.id
        if isinstance(value, ast.Name)
        else value.attr
        if isinstance(value, ast.Attribute)
        else ""
    )
    return owner if owner[:1].isupper() else ""


def _constructor_sites(name: str) -> tuple[_Site, ...]:
    """Every place the shipped source calls ``name(...)`` or ``name.something(...)``.

    What this cannot see, stated so that green is read for what it is: a class
    reached through a variable or a registry — ``ANALYSTS[job](...)`` over a dict
    that merely *mentions* the class — is a call on a subscript, not on a name,
    and counts as unreachable here. That error points the safe way (a red test
    gets investigated, a green one does not), and a composition written that way
    should say so at the site rather than have this guess.
    """
    return _call_index().get(name, ())


def _reached_from_outside(
    name: str,
    home: str,
    _seen: frozenset[str] = frozenset(),
    *,
    _as_function: bool = False,
) -> _Site | None:
    """Where *name* is built by something that is not ``home``, following factories.

    Two ways count, and the second is the one a flat site list misses. Either
    something in another module builds it directly, or something in *home* builds
    it inside a function that another module calls — which is what a factory is.
    Every ``SourceAnalyst`` in this repository is built at ``analysts.py:1073-1082``
    inside ``source_analyst_for``, so without following that one hop, SWR-3106
    would read as reachable purely because a module builds its own analysts, and
    would keep reading that way if the last real caller were deleted.

    *_seen* stops mutual factories from recursing forever; it is not a public
    parameter. Returning the *site* rather than a bool is deliberate — a failure
    message that names where the chain died is worth the wider return type.

    *_as_function* is the second half of the "identified by a name other things
    also have" defence. Refusing to hop through methods removed the worst of it
    (``__init__`` alone had 147 call sites across 81 modules), but a module-level
    function can still be called ``run``, and ``run`` is spoken 62 times in this
    tree — nearly all of them ``something.run(...)`` on an unrelated object. A
    factory is *imported* and called by its bare name, so once the chain is
    following a function rather than a constructor, attribute calls stop
    counting. Neither restriction is live today; both close a shape that this
    file has already been wrong about three times.
    """
    sites = _constructor_sites(name)
    if _as_function:
        sites = tuple(site for site in sites if site.bare)
    for site in sites:
        if site.module != home:
            return site
        if site.enclosing and site.enclosing not in _seen:
            hop = _reached_from_outside(
                site.enclosing,
                home,
                _seen | {name},
                _as_function=True,
            )
            if hop is not None:
                return hop
    return None


def _is_protocol(node: ast.ClassDef) -> bool:
    """A Protocol declares the contract; it is never an implementation of it."""
    return any(
        (isinstance(base, ast.Name) and base.id == "Protocol")
        or (isinstance(base, ast.Attribute) and base.attr == "Protocol")
        for base in node.bases
    )


class _Signature(NamedTuple):
    """A method reduced to what identifies it across classes."""

    method: str
    argument: str
    returns: str


def _signature_of(func: ast.FunctionDef | ast.AsyncFunctionDef) -> _Signature:
    """*func* as ``(name, first-argument annotation, return annotation)``, as written.

    Annotations are compared as their own source text, via ``ast.unparse``, so
    ``Sequence[Mapping[str, object]]`` and ``ImpactRequest | None`` survive
    intact. An earlier extractor reduced every annotation to a bare identifier
    and returned ``""`` for anything with a subscript — which quietly made two
    unannotated methods look like the same method. Text is blunter and honest:
    a provider that spells the same type differently reads as *not* implementing
    the protocol, which is red, which gets looked at.
    """
    arguments = [arg for arg in func.args.args if arg.arg != "self"]
    first = arguments[0].annotation if arguments else None
    return _Signature(func.name, _annotation(first), _annotation(func.returns))


def _annotation(node: ast.expr | None) -> str:
    if node is None:
        return ""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.strip("\"'")  # a forward reference means what it says
    return ast.unparse(node)


@lru_cache(maxsize=1)
def _class_index() -> dict[tuple[str, str], tuple[bool, frozenset[_Signature]]]:
    """``(module, class) -> (is-a-Protocol, its public method signatures)``.

    Protocols stay in the index rather than being filtered out at build time,
    because the contract has to be *read* off one before any implementation of it
    can be recognised.
    """
    index: dict[tuple[str, str], tuple[bool, frozenset[_Signature]]] = {}
    for relative, _source, tree in _sources():
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            index[relative, node.name] = (
                _is_protocol(node),
                frozenset(
                    _signature_of(item)
                    for item in node.body
                    if isinstance(item, ast.FunctionDef | ast.AsyncFunctionDef)
                    and not item.name.startswith("_")
                ),
            )
    return index


def _protocol_signatures(protocol: str) -> frozenset[_Signature]:
    """Every public method *protocol* declares, read off the declaration itself.

    All of them, not the first one. Each of these five happens to declare exactly
    one method today, and a helper that quietly took the first would keep passing
    if one grew a second — enforcing half a contract while reporting a whole one.
    An empty set means no such Protocol was found, which the tests treat as a
    failure rather than as "nothing to check".
    """
    for (_where, name), (is_protocol, signatures) in _class_index().items():
        if is_protocol and name == protocol:
            return signatures
    return frozenset()


def _implementations_of(protocol: str) -> list[str]:
    """Shipped classes that answer *protocol*, matched against its own declaration.

    Three earlier drafts passed for the wrong reason, and all three made the same
    mistake in different clothes: they identified an implementation by something
    other things also have.

    The method name alone — but ``classify`` belongs to ``CircuitBreaker`` too,
    so every protocol looked implemented. Then "and the file mentions the
    protocol" — but all six analysts live in one module whose docstring names all
    five, so ``DecompositionAnalyst`` satisfied ``DerivationModel``. Then the
    argument type, which killed that bleed but admitted the *consumer*:
    ``ImpactAnalyzer.analyse(request: ImpactRequest)`` matches ``ImpactModel``
    exactly, because an engine is written against the judgement it consumes. That
    one was a time bomb rather than a plain error — ``ImpactModel`` passed only
    because ``ImpactAnalyzer`` is constructed, and ``DerivationModel`` would have
    gone green the moment ``RequirementDerivation`` was wired in, while the
    analyst it was supposed to be about stayed unbuilt.

    The return type separates them, and it separates them for a reason rather
    than by luck: an implementation returns the raw payload the protocol promises
    (``Mapping[str, object]``), a consumer returns its own domain object
    (``ImpactAnalysis``). That is this epic's division of labour — analysts stop
    at "JSON to mapping", engines own the tolerant reader — so the signature
    really does say which side of it a class is on.

    Note what this deliberately does *not* do: it never asks which module a class
    lives in. ``HeuristicAnalyst`` sits in the same file as the ``SourceAnalyst``
    protocol it implements and is entirely legitimate, while ``ImpactAnalyzer``
    sits in the same file as ``ImpactModel`` and is a consumer. Location would
    have thrown out the first to catch the second.
    """
    contract = _protocol_signatures(protocol)
    if not contract:
        return []
    return [
        f"{where}::{class_name}"
        for (where, class_name), (is_protocol, signatures) in _class_index().items()
        if not is_protocol and contract <= signatures
    ]


@verifies(
    SWR.SWR_3409,
    SWR.SWR_3507,
    SWR.SWR_3508,
    SWR.SWR_3509,
    SWR.SWR_3518,
    SWR.SWR_3503,
    SWR.SWR_3404,
    SWR.SWR_3412,
    SWR.SWR_3504,
    SWR.SWR_3505,
    SWR.SWR_3506,
    SWR.SWR_3510,
    SWR.SWR_3511,
    SWR.SWR_3513,
)
@pytest.mark.parametrize(("engine", "spec"), sorted(ENGINES.items()))
def test_every_engine_is_reached_by_something_a_user_can_cause(
    engine: str,
    spec: tuple[tuple[str, ...], str, str],
) -> None:
    """An engine only its own tests construct is not delivered, whatever its status says."""
    names, declared_in, requirement = spec

    reached = {name: _reached_from_outside(name, declared_in) for name in names}

    assert any(reached.values()), (
        f"nothing in src/ or apps/rotaris/src reaches {engine} — none of {list(names)} "
        f"is called from outside {declared_in}, so {requirement} is approved with no path "
        f"a user can take to it. Either wire it into a production composition, or take the "
        f"requirement off approved and say why."
    )


@verifies(SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
@pytest.mark.parametrize(("protocol", "requirement"), sorted(PROTOCOLS.items()))
def test_every_model_protocol_has_a_shipped_implementation(
    protocol: str,
    requirement: str,
) -> None:
    """A Protocol with no implementation is a promise, and a promise is not a feature."""
    contract = _protocol_signatures(protocol)
    assert contract, (
        f"no Protocol named {protocol} is declared anywhere in src/ or apps/rotaris/src. "
        f"This table is the list of judgements {requirement} promises; a name in it that "
        f"matches nothing makes every case below vacuous, which is how a guard lies."
    )

    providers = _implementations_of(protocol)

    wanted = ", ".join(
        f"{signature.method}({signature.argument}) -> {signature.returns}"
        for signature in sorted(contract)
    )
    assert providers, (
        f"{protocol} — {wanted} — has no implementation anywhere in src/ or "
        f"apps/rotaris/src. {requirement} is approved, so somewhere a user must be able to "
        f"cause this judgement to happen; today only a scripted test double can."
    )


@verifies(SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
@pytest.mark.parametrize(("protocol", "requirement"), sorted(PROTOCOLS.items()))
def test_every_model_protocol_implementation_is_actually_constructed(
    protocol: str,
    requirement: str,
) -> None:
    """Existing is not the same as reachable.

    ``HeuristicAnalyst`` is why this test is separate from the one above: a real,
    model-free ``SourceAnalyst`` had been written, and nothing in the shipped
    code ever built one. An implementation no composition constructs is as
    unreachable as no implementation at all, and reads better in a code review,
    which makes it worse.

    "Constructed" means constructed by somebody else. Every ``SourceAnalyst`` in
    this repository is built inside ``source_analyst_for`` in the very module
    that declares them, so counting bare construction would have let this pass on
    a module building its own analysts — and kept passing after the last real
    caller was deleted. :func:`_reached_from_outside` follows that one hop.
    """
    # The module comes from the provider id itself rather than from a lookup by
    # class name: twelve class names are defined in more than one shipped module
    # (``ProposalIntake`` lives in both decomposition.py and derivation.py), and a
    # name-keyed lookup could hand back the wrong home — after which a build in
    # the *real* home would read as "outside" and pass for nothing.
    built = {}
    for provider in _implementations_of(protocol):
        home, class_name = provider.split("::")
        built[provider] = _reached_from_outside(class_name, home)
    reachable = {name: site for name, site in built.items() if site is not None}

    assert reachable, (
        f"{protocol} is implemented by {sorted(built)} and nothing outside their own "
        f"module ever builds one — directly or through a factory. {requirement} is "
        f"approved, so the judgement has to be something a user can cause, not only "
        f"something a test can."
    )


#: Switches of ``requirements.change`` (SWR-3117) that must *change what happens*,
#: with the rule each governs. All five were declared in ``config/schema.py`` in
#: slice 1 and read by nothing until the propagation lane — a user could set them
#: all and the product behaved identically, which is the persona-roster defect in
#: another shape.
#:
#: All five. ``report_dangling_dependents`` was held out of this table while it
#: governed nothing — listing a switch here that decides nothing would have made
#: this test pass for the wrong reason, which is precisely the failure it exists
#: to catch. The removal lane gave it something to decide, so it joins the rest.
#:
#: Worth keeping in view: the note it replaces called removal analysis "the one
#: rule of this epic that writes to a user's own source". That was wrong, and
#: reading SWR-3509's four acceptance criteria is enough to see it — name it,
#: report it, retain it under the tombstone, delete nothing automatically. The
#: analysis is read-only by construction, and this switch is about *saying*, not
#: about writing.
CHANGE_SWITCHES = {
    "analyze_changes": "SWR-3503 (agentic impact analysis)",
    "adopt_hash_after_verification": "SWR-3504 (no behavioural impact)",
    "propagate_evidence_loss": "SWR-3513 (stale evidence propagates)",
    "gate_on_dependencies": "SWR-3510 (dependency gating)",
    "report_dangling_dependents": "SWR-3509 (a removal's dependants are dangling)",
}


@verifies(SWR.SWR_3117, SWR.SWR_3515, SWR.SWR_3509)
@pytest.mark.parametrize(("switch", "requirement"), sorted(CHANGE_SWITCHES.items()))
def test_every_change_switch_decides_something(switch: str, requirement: str) -> None:
    """A configuration block only tests consult is a promise, not a setting.

    Stronger than "the name appears somewhere": the shipped source has to *branch*
    on it. A field read into a policy value and never consulted is the same defect
    one level in, and the first draft of this test passed over two of them.
    """
    branched = _modules_branching_on(switch)

    assert branched, (
        f"requirements.change.{switch} is declared in config/schema.py and decides nothing — "
        f"a user can set it and the product behaves identically ({requirement})."
    )


#: Switches of ``requirements.human_in_the_loop`` that must *change what happens*.
#:
#: One entry, and the five siblings it leaves out are named here rather than
#: forgotten: ``escalate``, ``require_review_before_done``, ``allow_force_done``,
#: ``confirm_source_writes`` and ``answer_timeout_minutes`` are all declared in
#: ``config/schema.py`` and read by nothing. That whole block was dead until the
#: migration lane needed one of them, and listing the other five here would fail
#: this guard for work nobody has done — which is how a guard stops being run.
#: They belong to the requirements that own them (SWR-3512, SWR-3603, SWR-3215,
#: SWR-3111) and are recorded as open in that lane's plan document.
HUMAN_SWITCHES = {
    "confirm_migration_worklist": "SWR-3507 (a migration is confirmed before code changes)",
}


@verifies(SWR.SWR_3117, SWR.SWR_3507)
@pytest.mark.parametrize(("switch", "requirement"), sorted(HUMAN_SWITCHES.items()))
def test_every_human_in_the_loop_switch_decides_something(switch: str, requirement: str) -> None:
    """A setting about who decides has to change who decides.

    The same rule the change block is held to, asked of the block that says which
    decisions reach a person: the shipped source must *branch* on the value, not
    merely carry it from configuration into a policy nobody consults.
    """
    branched = _modules_branching_on(switch)

    assert branched, (
        f"requirements.human_in_the_loop.{switch} is declared in config/schema.py and decides"
        f" nothing — a user can set it and the product behaves identically ({requirement})."
    )


@verifies(SWR.SWR_3117)
def test_the_persona_roster_is_read_by_the_shipped_code() -> None:
    """Slice 1 declared ``requirements.personas``; for a while nothing read it.

    A configuration block only tests consult is the same defect in a different
    shape: the user can set it and nothing changes.
    """
    readers = [
        relative for relative, source, _tree in _sources() if "requirements.personas" in source
    ]
    non_schema = [
        where for where in readers if not where.endswith(("config/schema.py", "config/defaults.py"))
    ]

    assert non_schema, (
        "requirements.personas is declared in config/schema.py and read by nobody — "
        "the persona a user configures for impact analysis has no effect (SWR-3117)."
    )
