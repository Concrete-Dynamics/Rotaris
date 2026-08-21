"""No surface holds a presentation value of its own (SWR-3706).

Every other test in this suite proves the token layer *works*. This one proves
the app actually *uses* it, and keeps proving it as the app grows — which is the
harder half. A one-off audit fixes the four hundred call sites that exist today;
a static check fixes the four hundred and first.

Two properties, both checked by reading the source rather than by running it,
because both are invisible at runtime until someone switches theme:

* **No literal.** A hex colour or an ``rgba()`` outside the theme package is a
  value that no palette can reach.
* **No early binding.** A token read in a class body, a module constant or a
  default argument is read once, at import — before the user has chosen a
  theme — and no amount of repainting will reach it afterwards. This is the
  failure the flat-constants layer had everywhere, and the reason the whole
  change was necessary.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

APP_SOURCE = Path(__file__).parents[1] / "src" / "rotaris"
THEME_PACKAGE = APP_SOURCE / "theme"


#: The theme package is where values are allowed to be literal — that is its
#: job. Everything else asks it.
def _product_modules() -> list[Path]:
    return sorted(
        path
        for path in APP_SOURCE.rglob("*.py")
        if THEME_PACKAGE not in path.parents and path != THEME_PACKAGE
    )


def _relative(path: Path) -> str:
    return str(path.relative_to(APP_SOURCE.parents[1]))


_HEX = re.compile(r"#[0-9a-fA-F]{6}\b")
_RGBA = re.compile(r"\brgba?\s*\(")


def _prose_lines(tree: ast.Module) -> set[int]:
    """Line numbers occupied by a docstring.

    Prose is allowed to name a colour — explaining *why* a token exists often
    means quoting the value it replaced. Only code is being checked here, and
    telling the two apart needs the parser: a docstring is a string expression
    in statement position, which no amount of line-prefix matching can spot.
    """
    lines: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        first = node.body[0] if node.body else None
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            lines.update(range(first.lineno, (first.end_lineno or first.lineno) + 1))
    return lines


@verifies(SWR.SWR_3706)
def test_no_colour_literal_survives_outside_the_theme_package() -> None:
    """Productive use: a user switches theme and every surface follows.

    A hex in a view is a colour no palette can reach, so the surface that owns it
    stays in whatever the author happened to type — which is exactly the sort of
    single stubborn panel that makes a theme switch look broken.
    """
    offenders: list[str] = []
    for path in _product_modules():
        source = path.read_text(encoding="utf-8")
        prose = _prose_lines(ast.parse(source, filename=str(path)))
        for number, line in enumerate(source.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("#") or number in prose:
                continue
            if _HEX.search(line) or _RGBA.search(line):
                offenders.append(f"{_relative(path)}:{number}: {stripped[:90]}")

    assert not offenders, (
        "colour literals outside rotaris.theme — these cannot follow a theme:\n  "
        + "\n  ".join(offenders)
    )


def _binds_presentation(node: ast.AST) -> bool:
    """Does this expression resolve a design token?"""
    for child in ast.walk(node):
        if (
            isinstance(child, ast.Call)
            and isinstance(child.func, ast.Name)
            and child.func.id == "tokens"
        ):
            return True
        if (
            isinstance(child, ast.Attribute)
            and isinstance(child.value, ast.Name)
            and child.value.id == "theme"
        ):
            return True
    return False


def _early_bindings(tree: ast.Module) -> list[tuple[int, str]]:
    """Token reads that happen once, at import, instead of at paint time."""
    found: list[tuple[int, str]] = []

    def scan_statements(body: list[ast.stmt], where: str) -> None:
        for statement in body:
            if (
                isinstance(statement, ast.Assign | ast.AnnAssign)
                and statement.value is not None
                and _binds_presentation(statement.value)
            ):
                found.append((statement.lineno, where))

    scan_statements(tree.body, "module level")
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            scan_statements(node.body, f"class body of {node.name}")
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            defaults = [*node.args.defaults, *node.args.kw_defaults]
            for default in defaults:
                if default is not None and _binds_presentation(default):
                    found.append((default.lineno, f"default argument of {node.name}()"))
    return found


@verifies(SWR.SWR_3706)
def test_no_token_is_resolved_before_the_user_has_chosen_a_theme() -> None:
    """Productive use: a widget whose stylesheet was built in a class body follows a switch.

    A class body runs at import. A value read there is fixed before any instance
    exists, so rebinding the module, repainting the widget and re-applying the
    stylesheet all reach it too late — the only fix is to read it inside the
    method that paints.
    """
    offenders: list[str] = []
    for path in _product_modules():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        offenders.extend(
            f"{_relative(path)}:{line}: token resolved in {where}"
            for line, where in _early_bindings(tree)
        )

    assert not offenders, (
        "design tokens resolved at import time — these freeze on the theme that "
        "loaded first:\n  " + "\n  ".join(offenders)
    )


@verifies(SWR.SWR_3706)
def test_the_legacy_constant_bridge_is_no_longer_reachable() -> None:
    """The transitional shim exists to be deleted; this is what makes that happen.

    ``rotaris.theme._legacy`` resolves pre-SWR-3706 names against the active
    theme so the tree stayed importable while forty-one modules were converted in
    parallel. Every one of those names is now a token, so nothing outside the
    theme package should still be asking for one.
    """
    legacy_reference = re.compile(r"\btheme\.([A-Z][A-Z0-9_]{2,})\b")
    offenders: list[str] = []
    for path in _product_modules():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.strip().startswith("#"):
                continue
            for match in legacy_reference.finditer(line):
                offenders.append(f"{_relative(path)}:{number}: theme.{match.group(1)}")

    assert not offenders, (
        "pre-SWR-3706 constant names still in use; migrate them to tokens() and "
        "then delete rotaris/theme/_legacy.py:\n  " + "\n  ".join(offenders)
    )


@verifies(SWR.SWR_3706)
def test_the_accessibility_sweep_derives_its_mirror_rather_than_restating_it() -> None:
    """A copy of a table is a table that disagrees eventually.

    The sweep resolves a widget's colour partly from what the stylesheet gives an
    ``objectName``. It used to keep its own transcription of that table, and a
    transcription that drifts fails silently in the worst direction — the sweep
    keeps measuring against a colour the app no longer uses and reports
    everything as fine.
    """
    source = (Path(__file__).parent / "a11y.py").read_text(encoding="utf-8")
    assert "object_styles" in source, "the mirror is not derived from the stylesheet builder"
    assert "QSS_FOREGROUND_BY_OBJECT_NAME = {" not in source, "the hand-kept mirror is back"
