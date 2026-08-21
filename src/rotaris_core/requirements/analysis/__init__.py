"""The shared machinery behind every agentic requirements judgement.

Five requirements in this epic ask a model for a judgement — source discovery
(SWR-3106), decomposition (SWR-3404), technical derivation (SWR-3411), impact
analysis (SWR-3503) and superseding migration (SWR-3507). Each declares its own
narrow ``Protocol`` next to the engine that consumes it, which is right: the
engines must stay testable with a scripted stand-in and must not know that a
model exists.

What they all need underneath is the same two things, and neither existed:
which persona does the job and on which model (:mod:`persona`), and how a
persona's model is asked for one structured verdict and answers with a
``Mapping`` the engine's own tolerant reader can take (:mod:`judge`).

On top of those two sits :mod:`analysts`, the five concrete classes the five
protocols were declared for. Each is a prompt, a schema built from the engine's
own vocabulary and one call; the validation stays where it already lived, in the
engines' tolerant readers.

All three live in ``rotaris_core`` rather than in the desktop app, unlike the
``RunHost`` implementation this epic's convention would suggest. The headless
CLI (SWR-3416) is a first-class consumer of requirement execution, and it cannot
import ``rotaris``. ``rotaris_core.ralph.completion_classifier`` is the
precedent: a model-calling classifier that has always lived in core.
"""

from __future__ import annotations

from rotaris_core.requirements.analysis.analysts import (
    DecompositionAnalyst,
    DerivationAnalyst,
    ImpactAnalyst,
    RequirementAssessor,
    SourceDiscoveryAnalyst,
    SupersedingAnalyst,
    UnavailableAnalyst,
    deferred_completion,
    source_analysts_for,
)
from rotaris_core.requirements.analysis.judge import (
    JudgeError,
    StructuredJudge,
    enum_schema,
)
from rotaris_core.requirements.analysis.persona import (
    PersonaResolutionError,
    RequirementJob,
    ResolvedAnalyst,
    analyst_llm,
    resolve_analyst,
)

__all__ = [
    "DecompositionAnalyst",
    "DerivationAnalyst",
    "UnavailableAnalyst",
    "ImpactAnalyst",
    "JudgeError",
    "PersonaResolutionError",
    "RequirementAssessor",
    "RequirementJob",
    "ResolvedAnalyst",
    "SourceDiscoveryAnalyst",
    "StructuredJudge",
    "SupersedingAnalyst",
    "analyst_llm",
    "deferred_completion",
    "enum_schema",
    "resolve_analyst",
    "source_analysts_for",
]
