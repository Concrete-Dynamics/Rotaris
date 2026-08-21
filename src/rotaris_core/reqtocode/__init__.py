"""ReqToCode — requirements-to-code traceability (docs/reference/reqtocode-blueprint.md).

Stdlib-only so the pre-commit hook can run it without the project venv.
`SWR` lives in the generated `swr.py`; it and the portability/coverage surface
(`RepoLayout`, the annotation conventions, the coverage query API) are resolved
lazily so the package stays importable — and cheap — before the first generation
(bootstrap, blueprint §11).
"""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus, traces, verifies

if TYPE_CHECKING:
    from rotaris_core.reqtocode.conventions import (
        AnnotationConvention,
        ConventionRegistry,
        PythonConvention,
        Reference,
        TestFunction,
    )
    from rotaris_core.reqtocode.coverage import (
        CoverageSite,
        RequirementCoverage,
        coverage_map,
        requirement_coverage,
    )
    from rotaris_core.reqtocode.layout import RepoLayout, load_layout
    from rotaris_core.reqtocode.swr import SWR

#: Public name -> (defining module, attribute), imported on first access.
_LAZY_EXPORTS = {
    "SWR": ("rotaris_core.reqtocode.swr", "SWR"),
    "DEFAULT_LAYOUT": ("rotaris_core.reqtocode.layout", "DEFAULT_LAYOUT"),
    "RepoLayout": ("rotaris_core.reqtocode.layout", "RepoLayout"),
    "load_layout": ("rotaris_core.reqtocode.layout", "load_layout"),
    "AnnotationConvention": ("rotaris_core.reqtocode.conventions", "AnnotationConvention"),
    "ConventionRegistry": ("rotaris_core.reqtocode.conventions", "ConventionRegistry"),
    "DEFAULT_CONVENTIONS": ("rotaris_core.reqtocode.conventions", "DEFAULT_CONVENTIONS"),
    "PythonConvention": ("rotaris_core.reqtocode.conventions", "PythonConvention"),
    "Reference": ("rotaris_core.reqtocode.conventions", "Reference"),
    "TestFunction": ("rotaris_core.reqtocode.conventions", "TestFunction"),
    "CoverageSite": ("rotaris_core.reqtocode.coverage", "CoverageSite"),
    "RequirementCoverage": ("rotaris_core.reqtocode.coverage", "RequirementCoverage"),
    "coverage_map": ("rotaris_core.reqtocode.coverage", "coverage_map"),
    "requirement_coverage": ("rotaris_core.reqtocode.coverage", "requirement_coverage"),
}

__all__ = [
    "DEFAULT_CONVENTIONS",
    "DEFAULT_LAYOUT",
    "SWR",
    "AnnotationConvention",
    "ConventionRegistry",
    "CoverageSite",
    "PythonConvention",
    "Reference",
    "ReqMeta",
    "ReqStatus",
    "RepoLayout",
    "RequirementCoverage",
    "TestFunction",
    "coverage_map",
    "load_layout",
    "requirement_coverage",
    "traces",
    "verifies",
]


def __getattr__(name: str) -> Any:
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = target
    return getattr(importlib.import_module(module_name), attribute)
