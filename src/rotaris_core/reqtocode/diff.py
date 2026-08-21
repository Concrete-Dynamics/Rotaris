"""ReqToCode requirement-diff (the propagation trigger).

Turns a requirement change into a concrete worklist. Compares each requirement's
`content_hash` between a git base ref and the working tree, classifies the change
(added / removed / modified / status), and maps it to the `@traces` / `@verifies`
sites that must be reviewed.

The signal `check` cannot give: a requirement whose **text** changed while its
annotations stayed intact keeps the verifier green but leaves the code stale.
`diff --strict` fails exactly that case — an approved requirement's text changed
but none of its implementing/covering site files were touched in the same
change. Committing the requirement edit and the code update together (the
one-unit rule) clears the diff, which is the agent's re-confirmation.

Base metadata is read from the committed generated file (`swr.py`) at the base
ref — the pre-commit hook and CI keep it in lock-step with the requirements, so
its per-requirement `content_hash` is the authoritative "before" snapshot.
Stdlib-only (subprocess + exec of our own generated file) so the hook can run it
without the project venv.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT, RepoLayout
from rotaris_core.reqtocode.verifier import Occurrence, sweep_references

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.reqtocode.conventions import ConventionRegistry


@dataclass
class ReqChange:
    number: int
    req_id: str
    kind: str  # "added" | "removed" | "modified" | "status"
    status: str
    title: str
    source_path: str
    sites: list[Occurrence] = field(default_factory=list)
    status_from: str | None = None
    drift: bool = False  # text changed but no site file was touched in this change


@dataclass
class DiffResult:
    changes: list[ReqChange] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    base_available: bool = True

    @property
    def drift_changes(self) -> list[ReqChange]:
        return [c for c in self.changes if c.drift]


def _run_git(repo_root: Path, *args: str) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, ValueError):
        return 1, ""
    return proc.returncode, proc.stdout


def _load_base_meta(repo_root: Path, ref: str, layout: RepoLayout) -> dict[int, ReqMeta] | None:
    """Parse META from the generated traceables file at `ref`. None when unavailable."""
    code, src = _run_git(repo_root, "show", f"{ref}:{layout.generated_path.as_posix()}")
    if code != 0 or not src:
        return None
    # The base file is our own committed, generated output; exec is deliberate.
    namespace: dict[str, object] = {}
    try:
        exec(compile(src, "<reqtocode-base-swr>", "exec"), namespace)  # noqa: S102
    except Exception:  # pragma: no cover - corrupt/foreign base file
        return None
    meta = namespace.get("META")
    if not isinstance(meta, dict):
        return None
    return {int(k): v for k, v in meta.items() if isinstance(v, ReqMeta)}


def _changed_files(repo_root: Path, ref: str) -> set[str]:
    """Repo-relative posix paths changed between `ref` and the working tree."""
    files: set[str] = set()
    code, out = _run_git(repo_root, "diff", "--name-only", ref)
    if code == 0:
        files.update(line.strip() for line in out.splitlines() if line.strip())
    code, out = _run_git(repo_root, "ls-files", "--others", "--exclude-standard")
    if code == 0:
        files.update(line.strip() for line in out.splitlines() if line.strip())
    return files


def classify_changes(
    current: list[ReqMeta],
    base_meta: dict[int, ReqMeta],
    site_index: dict[int, list[Occurrence]],
    changed_files: set[str],
) -> list[ReqChange]:
    """Pure classification: (current reqs, base snapshot, sites, changed files) -> changes."""
    changes: list[ReqChange] = []
    current_by_number = {r.number: r for r in current}

    for req in current:
        base = base_meta.get(req.number)
        sites = site_index.get(req.number, [])
        if base is None:
            changes.append(_make_change(req, "added", sites))
            continue
        if base.content_hash != req.content_hash:
            change = _make_change(req, "modified", sites)
            change.drift = _is_drift(req, sites, changed_files)
            if base.status is not req.status:
                change.status_from = base.status.value
            changes.append(change)
        elif base.status is not req.status:
            change = _make_change(req, "status", sites)
            change.status_from = base.status.value
            changes.append(change)

    for number, base in base_meta.items():
        if number in current_by_number:
            continue
        sites = site_index.get(number, [])
        changes.append(
            ReqChange(
                number=number,
                req_id=base.req_id,
                kind="removed",
                status=base.status.value,
                title=base.title,
                source_path=base.source_path,
                sites=list(sites),
                drift=bool(sites) and not _sites_touched(sites, changed_files),
            )
        )

    changes.sort(key=lambda c: c.number)
    return changes


def _make_change(req: ReqMeta, kind: str, sites: list[Occurrence]) -> ReqChange:
    return ReqChange(
        number=req.number,
        req_id=req.req_id,
        kind=kind,
        status=req.status.value,
        title=req.title,
        source_path=req.source_path,
        sites=list(sites),
    )


def _sites_touched(sites: list[Occurrence], changed_files: set[str]) -> bool:
    return any(occ.file in changed_files for occ in sites)


def _is_drift(req: ReqMeta, sites: list[Occurrence], changed_files: set[str]) -> bool:
    # Only approved requirements with existing annotations can drift: the text
    # moved but nobody touched the code/tests that claim to implement it.
    if req.status is not ReqStatus.APPROVED or not sites:
        return False
    return not _sites_touched(sites, changed_files)


def compute_requirement_diff(
    repo_root: Path,
    base_ref: str = "HEAD",
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> DiffResult:
    """Diff requirements between `base_ref` and the working tree into a worklist."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    result = DiffResult()
    parsed = parse_requirements(repo_root, layout)
    result.errors.extend(parsed.errors)
    if parsed.errors:
        return result

    base_meta = _load_base_meta(repo_root, base_ref, layout)
    if base_meta is None:
        result.base_available = False
        return result

    sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)
    changed_files = _changed_files(repo_root, base_ref)
    result.changes = classify_changes(
        parsed.requirements, base_meta, sweep.all_references, changed_files
    )
    return result


_OBLIGATION = {
    "added": "implement it, then add @traces + @verifies",
    "removed": "delete or re-point every reference below",
    "modified": "re-verify every site below against the new text",
    "status": "reconcile references with the new lifecycle status",
}


def render_diff(result: DiffResult) -> list[str]:
    """Human/agent-readable worklist lines (no side effects)."""
    if not result.base_available:
        return ["[reqtocode] no base swr.py to diff against; nothing to compare"]
    if not result.changes:
        return ["[reqtocode] no requirement changes vs base"]
    lines: list[str] = []
    for change in result.changes:
        transition = ""
        if change.status_from and change.status_from != change.status:
            transition = f" ({change.status_from} -> {change.status})"
        flag = "  <<< DRIFT: no site updated" if change.drift else ""
        lines.append(
            f"[reqtocode] {change.kind.upper()} {change.req_id} {change.title!r}"
            f"{transition}: {_OBLIGATION[change.kind]}{flag}"
        )
        for occ in change.sites:
            lines.append(f"    {occ.file}:{occ.line} ({occ.kind})")
        if not change.sites and change.kind in {"added", "modified"}:
            lines.append("    (no @traces/@verifies sites yet)")
    return lines


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing/stale generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2332)(compute_requirement_diff)
        traces(SWR.SWR_2335)(compute_requirement_diff)
        traces(SWR.SWR_2332)(classify_changes)
        traces(SWR.SWR_2332)(render_diff)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
