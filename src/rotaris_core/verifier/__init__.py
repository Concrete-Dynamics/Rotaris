"""Deterministic completion verifier: suite resolution (SWR-2601), execution
(SWR-2602), the report-facing evidence projection (SWR-2603), the completion
gate that reads it (SWR-2604), and the bounded repair loop the gate feeds
(SWR-2605)."""

from rotaris_core.verifier.change_detection import (
    MUTATING_TOOL_NAMES,
    WorkspaceChangeSignal,
    detect_workspace_change,
)
from rotaris_core.verifier.detection import DetectionResult, detect_check_suite, detect_checks
from rotaris_core.verifier.evidence import VerifierEvidence, VerifierVerdict
from rotaris_core.verifier.gate import (
    CompletionGateDecision,
    GateDecision,
    evaluate_completion_gate,
)
from rotaris_core.verifier.repair import (
    MAX_REPAIR_CONTEXT_CHARS,
    RepairAction,
    RepairDecision,
    build_repair_context,
    decide_repair,
)
from rotaris_core.verifier.runner import (
    CheckResult,
    CheckStatus,
    VerifierProgress,
    VerifierRunControl,
    VerifierRunResult,
    run_check_suite,
)
from rotaris_core.verifier.suite import (
    CheckRole,
    ResolvedCheck,
    ResolvedCheckSuite,
    SuiteSource,
    resolve_check_suite,
)

__all__ = [
    "MAX_REPAIR_CONTEXT_CHARS",
    "MUTATING_TOOL_NAMES",
    "CheckResult",
    "CheckRole",
    "CheckStatus",
    "CompletionGateDecision",
    "DetectionResult",
    "GateDecision",
    "RepairAction",
    "RepairDecision",
    "ResolvedCheck",
    "ResolvedCheckSuite",
    "SuiteSource",
    "VerifierEvidence",
    "VerifierProgress",
    "VerifierRunControl",
    "VerifierRunResult",
    "VerifierVerdict",
    "WorkspaceChangeSignal",
    "build_repair_context",
    "decide_repair",
    "detect_check_suite",
    "detect_checks",
    "detect_workspace_change",
    "evaluate_completion_gate",
    "resolve_check_suite",
    "run_check_suite",
]
