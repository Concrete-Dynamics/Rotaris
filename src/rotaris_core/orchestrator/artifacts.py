"""Session-scoped artifact store for cross-agent context forwarding.

Every terminal child report is materialised here as an :class:`ArtifactRecord`,
written atomically to ``<session_dir>/artifacts/<id>.json`` with a Markdown
sidecar and tracked in ``index.json``. Agents read these via the
``artifact_read`` / ``artifact_list`` tools; selected personas publish curated
deliverables via ``artifact_write``.

The store survives :class:`~rotaris_core.ralph.loop.RalphLoop` iterations (unlike
:class:`~rotaris_core.orchestrator.child_manager.ChildManager`, which is recreated
each iteration), so research findings from earlier phases remain available to
later children.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import re
import string
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact

_log = logging.getLogger(__name__)

_BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase
_SLUG_SAFE = re.compile(r"[^a-z0-9]+")
_MAX_SLUG_LEN = 64

# Closed set of valid artifact tags for filtering and publish-time validation.
# Tags are flat (no prefix) and describe the lifecycle phase a deliverable belongs to.
VALID_ARTIFACT_TAGS: frozenset[str] = frozenset(
    {"research", "planning", "implementation", "review", "verification", "errors"}
)

ArtifactKind = Literal["child_report", "agent_published", "system"]


@dataclass(frozen=True)
class FullBlockResolution:
    block: str
    resolved_ids: list[str]
    missing_refs: list[str]
    elided_ids: list[str]


@traces(SWR.SWR_1517)
class ArtifactRecord(BaseModel):
    """Persistent artifact derived from a child report or published by an agent."""

    id: str = Field(description="Stable identifier of the form 'art_xxxxxxxx'.")
    slug: str = Field(description="Kebab-case slug derived from ``title``.")
    title: str = Field(description="Human-readable one-line label.")
    kind: ArtifactKind = Field(default="child_report")
    source_task_id: str | None = Field(default=None)
    canonical_name: str | None = Field(default=None)
    source_persona: str | None = Field(default=None)
    status: str = Field(default="succeeded")
    summary: str = Field(default="")
    key_findings: str | None = Field(default=None)
    highlight_paths: list[dict[str, str | None]] = Field(default_factory=list)
    snippets: list[dict[str, str | None]] = Field(default_factory=list)
    edited_files: list[dict[str, str | None]] = Field(default_factory=list)
    created_files: list[dict[str, str | None]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    supersedes: str | None = Field(default=None)
    superseded_by: str | None = Field(default=None)
    created_by: str | None = Field(default=None)
    consumed_by: list[str] = Field(default_factory=list)
    related_timeline_event_id: str | None = Field(default=None)
    source_conversation_id: str | None = Field(default=None)
    importance: str = Field(default="normal")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))
    edited_at: dt.datetime | None = Field(default=None)
    body_markdown: str = Field(default="")


def _generate_id(seed: str) -> str:
    raw = f"{seed}-{time.monotonic_ns()}".encode()
    digest = hashlib.blake2b(raw, digest_size=6).digest()
    n = int.from_bytes(digest, "big")
    chars: list[str] = []
    while n and len(chars) < 8:
        n, rem = divmod(n, 62)
        chars.append(_BASE62_ALPHABET[rem])
    while len(chars) < 8:
        chars.append("0")
    return "art_" + "".join(reversed(chars))


def _slugify(title: str) -> str:
    lowered = title.strip().lower()
    cleaned = _SLUG_SAFE.sub("-", lowered).strip("-")
    if not cleaned:
        cleaned = "artifact"
    if len(cleaned) > _MAX_SLUG_LEN:
        cleaned = cleaned[:_MAX_SLUG_LEN].rstrip("-") or "artifact"
    return cleaned


def render_markdown(record: ArtifactRecord) -> str:
    """Render a Markdown sidecar with YAML frontmatter."""
    fm_lines = [
        "---",
        f"id: {record.id}",
        f"slug: {record.slug}",
        f"title: {json.dumps(record.title)}",
        f"kind: {record.kind}",
        f"status: {record.status}",
    ]
    if record.source_task_id:
        fm_lines.append(f"source_task_id: {record.source_task_id}")
    if record.source_persona:
        fm_lines.append(f"source_persona: {record.source_persona}")
    if record.tags:
        fm_lines.append(f"tags: {json.dumps(record.tags)}")
    if record.supersedes:
        fm_lines.append(f"supersedes: {record.supersedes}")
    if record.superseded_by:
        fm_lines.append(f"superseded_by: {record.superseded_by}")
    fm_lines.append(f"created_at: {record.created_at.isoformat()}")
    if record.edited_at:
        fm_lines.append(f"edited_at: {record.edited_at.isoformat()}")
    fm_lines.append("---")

    body: list[str] = [f"# {record.title}", ""]
    if record.summary:
        body.extend(["## Summary", "", record.summary, ""])
    if record.key_findings:
        body.extend(["## Key Findings", "", record.key_findings, ""])
    if record.highlight_paths:
        body.append("## Highlight Paths")
        body.append("")
        for hp in record.highlight_paths:
            path = hp.get("path", "")
            reason = hp.get("reason") or ""
            line = f"- `{path}`"
            if reason:
                line += f" — {reason}"
            body.append(line)
        body.append("")
    if record.snippets:
        body.append("## Snippets")
        body.append("")
        for sn in record.snippets:
            path = sn.get("path") or ""
            reason = sn.get("reason") or ""
            header = f"### `{path}`" if path else "### snippet"
            if reason:
                header += f" — {reason}"
            body.append(header)
            body.append("")
            body.append("```")
            body.append(str(sn.get("content", "")))
            body.append("```")
            body.append("")
    if record.edited_files:
        body.append("## Edited Files")
        body.append("")
        for ef in record.edited_files:
            body.append(f"- `{ef.get('path', '')}` ({ef.get('change_type', '')})")
        body.append("")
    if record.created_files:
        body.append("## Created Files")
        body.append("")
        for cf in record.created_files:
            body.append(f"- `{cf.get('path', '')}`")
        body.append("")

    return "\n".join(fm_lines) + "\n\n" + "\n".join(body).rstrip() + "\n"


@traces(
    SWR.SWR_1518,
    SWR.SWR_1519,
    SWR.SWR_1520,
    SWR.SWR_1521,
    SWR.SWR_1526,
    SWR.SWR_1527,
    SWR.SWR_1532,
    SWR.SWR_1533,
    SWR.SWR_1534,
    SWR.SWR_1537,
    SWR.SWR_1538,
    SWR.SWR_1318,
)
class SessionArtifactStore:
    """Thread-safe, on-disk store of session artifacts.

    Lifetime is per-session (owned by :class:`RalphLoop`). All writes are
    atomic; the in-memory cache mirrors disk so :meth:`list` and :meth:`get`
    do not require IO.
    """

    INDEX_FILENAME = "index.json"

    def __init__(self, session_dir: Path | None) -> None:
        from rotaris_core.session.diagnostics import SessionDiagnostics

        self._session_dir = Path(session_dir) if session_dir is not None else None
        self._diag = SessionDiagnostics(self._session_dir)
        self._lock = threading.Lock()
        self._records: dict[str, ArtifactRecord] = {}
        self._by_slug: dict[str, str] = {}
        self._by_task_id: dict[str, str] = {}
        self._by_canonical: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Construction / persistence

    @property
    def artifacts_dir(self) -> Path | None:
        if self._session_dir is None:
            return None
        return self._session_dir / "artifacts"

    def _ensure_dir(self) -> Path | None:
        d = self.artifacts_dir
        if d is None:
            return None
        d.mkdir(parents=True, exist_ok=True)
        return d

    def hydrate(self) -> int:
        """Load artifacts from the index on disk. Returns count loaded."""
        d = self.artifacts_dir
        if d is None or not d.exists():
            return 0
        index_path = d / self.INDEX_FILENAME
        if not index_path.exists():
            return 0
        try:
            index_data = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            _log.warning("Failed to read artifact index at %s: %s", index_path, exc)
            return 0

        loaded = 0
        with self._lock:
            for entry in index_data.get("artifacts", []):
                art_id = entry.get("id")
                if not art_id:
                    continue
                json_path = d / f"{art_id}.json"
                if not json_path.exists():
                    _log.warning("Artifact %s listed in index but JSON missing", art_id)
                    continue
                try:
                    record = ArtifactRecord.model_validate_json(
                        json_path.read_text(encoding="utf-8"),
                    )
                except (OSError, ValueError) as exc:
                    _log.warning("Failed to load artifact %s: %s", art_id, exc)
                    continue
                self._records[record.id] = record
                self._by_slug[record.slug] = record.id
                if record.source_task_id:
                    self._by_task_id[record.source_task_id] = record.id
                if record.canonical_name:
                    self._by_canonical[record.canonical_name] = record.id
                loaded += 1
        return loaded

    def _persist_index_unlocked(self) -> None:
        d = self._ensure_dir()
        if d is None:
            return
        index_path = d / self.INDEX_FILENAME
        entries = [
            {
                "id": r.id,
                "slug": r.slug,
                "title": r.title,
                "kind": r.kind,
                "source_task_id": r.source_task_id,
                "canonical_name": r.canonical_name,
                "source_persona": r.source_persona,
                "status": r.status,
                "tags": list(r.tags),
                "created_by": r.created_by,
                "consumed_by": list(r.consumed_by),
                "related_timeline_event_id": r.related_timeline_event_id,
                "source_conversation_id": r.source_conversation_id,
                "importance": r.importance,
                "superseded_by": r.superseded_by,
                "created_at": r.created_at.isoformat(),
                "edited_at": r.edited_at.isoformat() if r.edited_at else None,
            }
            for r in sorted(self._records.values(), key=lambda r: r.created_at)
        ]
        atomic_write(index_path, json.dumps({"artifacts": entries}, indent=2))

    def _persist_record_unlocked(self, record: ArtifactRecord) -> None:
        d = self._ensure_dir()
        if d is None:
            return
        json_path = d / f"{record.id}.json"
        md_path = d / f"{record.id}.md"
        atomic_write(json_path, record.model_dump_json(indent=2))
        atomic_write(md_path, record.body_markdown or render_markdown(record))

    # ------------------------------------------------------------------
    # Internal helpers

    def _unique_slug_unlocked(self, base_slug: str) -> str:
        if base_slug not in self._by_slug:
            return base_slug
        n = 2
        while True:
            candidate = f"{base_slug}-{n}"
            if candidate not in self._by_slug:
                return candidate
            n += 1

    def _new_id_unlocked(self, seed: str) -> str:
        for _ in range(10):
            candidate = _generate_id(seed)
            if candidate not in self._records:
                return candidate
        # Extremely unlikely; fall back to a longer digest.
        return _generate_id(seed + str(time.monotonic_ns()))

    # ------------------------------------------------------------------
    # Public API

    def get(self, id_or_slug: str) -> ArtifactRecord | None:
        with self._lock:
            if id_or_slug in self._records:
                return self._records[id_or_slug]
            art_id = self._by_slug.get(id_or_slug)
            if art_id is None:
                return None
            return self._records.get(art_id)

    def list(
        self,
        *,
        kind: ArtifactKind | None = None,
        persona: str | None = None,
        tags: Sequence[str] | None = None,
        include_superseded: bool = False,
    ) -> list[ArtifactRecord]:
        with self._lock:
            items = list(self._records.values())
        if not include_superseded:
            items = [r for r in items if r.superseded_by is None]
        if kind is not None:
            items = [r for r in items if r.kind == kind]
        if persona is not None:
            items = [r for r in items if r.source_persona == persona]
        if tags:
            tag_set = set(tags)
            items = [r for r in items if tag_set.issubset(set(r.tags))]
        items.sort(key=lambda r: r.created_at)
        return items

    def mark_consumed(self, id_or_slug: str, actor: str | None) -> None:
        if not actor:
            return
        with self._lock:
            art_id = self._by_slug.get(id_or_slug, id_or_slug)
            record = self._records.get(art_id)
            if record is None or actor in record.consumed_by:
                return
            updated = record.model_copy(update={"consumed_by": [*record.consumed_by, actor]})
            self._records[updated.id] = updated
            self._persist_record_unlocked(updated)
            self._persist_index_unlocked()

    def upsert_from_child_report(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
    ) -> ArtifactRecord:
        """Materialise a :class:`ChildReportArtifact` as an :class:`ArtifactRecord`.

        Idempotent on ``record.task_id``: a re-call updates the existing entry
        in place instead of creating a duplicate.
        """
        with self._lock:
            existing_id = self._by_task_id.get(record.task_id) if record.task_id else None
            prior: ArtifactRecord | None = None
            if existing_id is None:
                existing_id = self._by_canonical.get(record.canonical_name)
            if existing_id is not None:
                prior = self._records[existing_id]
                art_id = existing_id
                slug = prior.slug
                title_text = prior.title
                created_at = prior.created_at
            else:
                title_text = record.name or record.canonical_name
                base_slug = _slugify(title_text)
                slug = self._unique_slug_unlocked(base_slug)
                art_id = self._new_id_unlocked(record.canonical_name)
                created_at = dt.datetime.now(dt.UTC)

            highlight_paths: list[dict[str, str | None]] = []
            snippets: list[dict[str, str | None]] = []
            if report.detail_payload is not None:
                highlight_paths = [
                    {"path": hp.path, "reason": hp.reason}
                    for hp in report.detail_payload.highlight_paths
                ]
                snippets = [
                    {"path": sn.path, "content": sn.content, "reason": sn.reason}
                    for sn in report.detail_payload.snippets
                ]

            edited = [
                {
                    "path": ef.path,
                    "change_type": ef.change_type,
                    "commit_sha": ef.commit_sha,
                }
                for ef in report.edited_files
            ]
            created = [
                {"path": cf.path, "commit_sha": cf.commit_sha} for cf in report.created_files
            ]
            supersedes = prior.supersedes if prior is not None else None
            superseded_by = prior.superseded_by if prior is not None else None
            consumed_by = list(prior.consumed_by) if prior is not None else []
            related_timeline_event_id = (
                prior.related_timeline_event_id if prior is not None else None
            )
            edited_at = prior.edited_at if prior is not None else None

            new_record = ArtifactRecord(
                id=art_id,
                slug=slug,
                title=title_text,
                kind="child_report",
                source_task_id=record.task_id,
                canonical_name=record.canonical_name,
                source_persona=record.persona,
                created_by=record.canonical_name,
                source_conversation_id=record.conversation_id,
                importance="high" if report.status != "succeeded" else "normal",
                status=report.status,
                summary=report.summary or "",
                key_findings=report.key_findings,
                highlight_paths=highlight_paths,
                snippets=snippets,
                edited_files=edited,
                created_files=created,
                tags=list(getattr(report, "tags", []) or []),
                created_at=created_at,
                supersedes=supersedes,
                superseded_by=superseded_by,
                consumed_by=consumed_by,
                related_timeline_event_id=related_timeline_event_id,
                edited_at=edited_at,
            )
            new_record.body_markdown = render_markdown(new_record)
            self._records[new_record.id] = new_record
            self._by_slug[new_record.slug] = new_record.id
            if record.task_id:
                self._by_task_id[record.task_id] = new_record.id
            self._by_canonical[record.canonical_name] = new_record.id

            self._persist_record_unlocked(new_record)
            self._persist_index_unlocked()
            event_id = self._diag.timeline(
                "artifact_published",
                actor=record.canonical_name,
                message=f"Child report artifact written: {new_record.title}",
                metadata={"artifact_id": new_record.id, "kind": new_record.kind},
            )
            if event_id is not None:
                new_record.related_timeline_event_id = event_id
                self._records[new_record.id] = new_record
                self._persist_record_unlocked(new_record)
                self._persist_index_unlocked()
        return new_record

    @traces(SWR.SWR_2427)
    def publish(
        self,
        *,
        slug: str,
        title: str,
        body: str,
        persona: str,
        tags: Sequence[str] | None = None,
        supersedes: str | None = None,
        source_task_id: str | None = None,
        canonical_name: str | None = None,
        source_conversation_id: str | None = None,
        created_by: str | None = None,
    ) -> ArtifactRecord:
        """Create a curated ``agent_published`` artifact."""
        with self._lock:
            base_slug = _slugify(slug or title)
            unique_slug = self._unique_slug_unlocked(base_slug)
            art_id = self._new_id_unlocked(base_slug)

            superseded_target: ArtifactRecord | None = None
            if supersedes:
                target_id = supersedes
                if supersedes in self._by_slug:
                    target_id = self._by_slug[supersedes]
                superseded_target = self._records.get(target_id)

            record = ArtifactRecord(
                id=art_id,
                slug=unique_slug,
                title=title or slug,
                kind="agent_published",
                source_task_id=source_task_id,
                canonical_name=canonical_name,
                source_persona=persona,
                created_by=created_by or canonical_name or persona,
                source_conversation_id=source_conversation_id,
                status="published",
                summary=body.strip().split("\n", 1)[0][:280],
                key_findings=body,
                tags=list(tags or []),
                supersedes=superseded_target.id if superseded_target else None,
            )
            record.body_markdown = body
            self._records[record.id] = record
            self._by_slug[record.slug] = record.id

            if superseded_target is not None:
                updated = superseded_target.model_copy(update={"superseded_by": record.id})
                updated.body_markdown = render_markdown(updated)
                self._records[updated.id] = updated
                self._persist_record_unlocked(updated)

            self._persist_record_unlocked(record)
            self._persist_index_unlocked()
            event_id = self._diag.timeline(
                "artifact_published",
                # Siblings can share a persona, so the persona cannot identify the
                # publisher; the canonical name is what joins this event to
                # tool-calls.jsonl and resume.json (SWR-2427).
                actor=canonical_name or created_by or persona,
                message=f"Artifact published: {record.title}",
                metadata={
                    "artifact_id": record.id,
                    "kind": record.kind,
                    "task_id": source_task_id,
                },
            )
            if event_id is not None:
                record.related_timeline_event_id = event_id
                self._records[record.id] = record
                self._persist_record_unlocked(record)
                self._persist_index_unlocked()
        return record

    def update_body(
        self,
        id_or_slug: str,
        body_markdown: str,
        *,
        edited_at: dt.datetime | None = None,
    ) -> ArtifactRecord:
        """Overwrite an artifact's editable Markdown body in place.

        Structured metadata (slug, title, tags, snippets, source ids) remains immutable here;
        the TUI editor is intentionally scoped to ``body_markdown``.
        """
        with self._lock:
            art_id = self._by_slug.get(id_or_slug, id_or_slug)
            record = self._records.get(art_id)
            if record is None:
                raise ValueError(f"Unknown artifact: {id_or_slug!r}")
            timestamp = edited_at or dt.datetime.now(dt.UTC)
            updated = record.model_copy(
                update={"body_markdown": body_markdown, "edited_at": timestamp},
            )
            self._records[updated.id] = updated
            self._persist_record_unlocked(updated)
            self._persist_index_unlocked()
            return updated

    def supersede(self, old_id_or_slug: str, new_id_or_slug: str) -> None:
        """Mark one artifact as superseded by another existing artifact."""
        with self._lock:
            old_id = self._by_slug.get(old_id_or_slug, old_id_or_slug)
            new_id = self._by_slug.get(new_id_or_slug, new_id_or_slug)
            old_record = self._records.get(old_id)
            new_record = self._records.get(new_id)
            if old_record is None:
                raise ValueError(f"Unknown artifact to supersede: {old_id_or_slug!r}")
            if new_record is None:
                raise ValueError(f"Unknown superseding artifact: {new_id_or_slug!r}")
            if old_record.id == new_record.id:
                raise ValueError("An artifact cannot supersede itself")

            updated_old = old_record.model_copy(update={"superseded_by": new_record.id})
            updated_new = new_record.model_copy(update={"supersedes": old_record.id})
            updated_old.body_markdown = render_markdown(updated_old)
            updated_new.body_markdown = render_markdown(updated_new)

            self._records[updated_old.id] = updated_old
            self._records[updated_new.id] = updated_new
            self._persist_record_unlocked(updated_old)
            self._persist_record_unlocked(updated_new)
            self._persist_index_unlocked()

    # ------------------------------------------------------------------
    # Helpers for ChildManager auto-injection

    def baseline_block(
        self,
        *,
        exclude_ids: set[str] | None = None,
        max_chars: int = 32000,
        task_name: str | None = None,
        task_payload: str | None = None,
        actor: str | None = None,
    ) -> tuple[str, Sequence[str]]:
        """Return a deterministic ``PRIOR SIBLING SUMMARIES`` block.

        ``max_chars`` is a coarse approximation of an 8k-token budget at
        4 chars/token. Over the cap the block ends with an elision marker.
        """
        excluded = exclude_ids or set()
        with self._lock:
            items = [
                r
                for r in self._records.values()
                if r.status in ("succeeded", "published", "failed", "blocked", "partial")
                and r.superseded_by is None
                and r.id not in excluded
            ]
        if not items:
            return "", []
        available_count = len(items)
        query = f"{task_name or ''} {task_payload or ''}"
        items.sort(key=lambda r: self._artifact_score(r, query), reverse=True)

        header = (
            "PRIOR SIBLING SUMMARIES: (concise digest of every succeeded prior "
            "child in this session — call `artifact_read(id)` for full body)\n\n"
        )
        blocks: list[str] = []
        resolved_ids: list[str] = []
        elided_ids: list[str] = []
        used = len(header)
        elided = 0
        for r in items:
            block = self._format_summary_block(r)
            if used + len(block) + 2 > max_chars:
                elided += 1
                elided_ids.append(r.id)
                continue
            blocks.append(block)
            resolved_ids.append(r.id)
            used += len(block) + 2
        if not blocks and elided == 0:
            return "", []
        body = "\n\n".join(blocks)
        if elided:
            body += (
                f"\n\n[... {elided} additional artifact(s) elided to stay within "
                "the auto-injection token budget. Call `artifact_list()` to browse.]"
            )
        self._record_context_selection(
            actor=actor,
            task_name=task_name,
            available_artifacts=available_count,
            injected_artifact_ids=list(resolved_ids),
            elided_artifact_ids=elided_ids,
        )
        return header + body + "\n\n---\n\n", resolved_ids

    def resolve_full_block(
        self,
        ids_or_slugs: Sequence[str],
        *,
        max_chars: int = 48000,
    ) -> FullBlockResolution:
        """Return attached-artifact context plus resolution diagnostics."""
        resolved: list[ArtifactRecord] = []
        resolved_ids: list[str] = []
        missing_refs: list[str] = []
        for ref in ids_or_slugs:
            if not ref:
                continue
            r = self.get(ref)
            if r is None:
                _log.debug("Unknown artifact reference: %s", ref)
                missing_refs.append(ref)
                continue
            resolved.append(r)
            resolved_ids.append(r.id)
        if not resolved:
            return FullBlockResolution(
                block="",
                resolved_ids=[],
                missing_refs=missing_refs,
                elided_ids=[],
            )
        header = (
            "PRIOR AGENT CONTEXT (FULL): (authoritative findings from explicitly "
            "attached prior children — trust these; do NOT re-explore unless "
            "verifying a specific edit)\n\n"
        )
        blocks: list[str] = []
        included_ids: list[str] = []
        elided_ids: list[str] = []
        used = len(header)
        for record in resolved:
            block = self._format_full_block(record)
            if used + len(block) + 2 > max_chars:
                elided_ids.append(record.id)
                continue
            blocks.append(block)
            included_ids.append(record.id)
            used += len(block) + 2

        if not blocks and not elided_ids:
            return FullBlockResolution(
                block="",
                resolved_ids=[],
                missing_refs=missing_refs,
                elided_ids=[],
            )

        body = "\n\n".join(blocks)
        if elided_ids:
            body += (
                f"\n\n[... {len(elided_ids)} attached artifact(s) elided to stay within "
                "the explicit attachment token budget. Narrow the attachment list or call "
                "`artifact_read(id)` as needed.]"
            )
        self._record_context_selection(
            actor=None,
            task_name=None,
            available_artifacts=len(self._records),
            injected_artifact_ids=list(included_ids),
            elided_artifact_ids=elided_ids,
            full_artifact_ids=list(included_ids),
        )
        return FullBlockResolution(
            block=header + body + "\n\n---\n\n",
            resolved_ids=included_ids,
            missing_refs=missing_refs,
            elided_ids=elided_ids,
        )

    def full_block(
        self,
        ids_or_slugs: Sequence[str],
        *,
        max_chars: int = 48000,
    ) -> tuple[str, Sequence[str]]:
        resolution = self.resolve_full_block(ids_or_slugs, max_chars=max_chars)
        return resolution.block, resolution.resolved_ids

    @staticmethod
    def _artifact_score(record: ArtifactRecord, query: str) -> tuple[int, float]:
        query_terms = {term for term in re.split(r"[^a-z0-9]+", query.lower()) if len(term) >= 3}
        haystack_parts = [
            record.slug,
            record.title,
            record.summary,
            record.key_findings or "",
            " ".join(record.tags),
            " ".join(str(f.get("path", "")) for f in record.edited_files),
            " ".join(str(f.get("path", "")) for f in record.created_files),
        ]
        haystack = " ".join(haystack_parts).lower()
        score = sum(3 for term in query_terms if term in haystack)
        if record.status != "succeeded":
            score += 80
        if any(
            term in query.lower() for term in ("fix", "fail", "error", "diagnos", "verify")
        ) and record.status in {"failed", "blocked", "partial"}:
            score += 100
        if record.importance == "high":
            score += 20
        if record.source_persona in {"tester", "librarian", "architect"}:
            score += 5
        return score, record.created_at.timestamp()

    @traces(SWR.SWR_1318, SWR.SWR_1320)
    def _record_context_selection(
        self,
        *,
        actor: str | None,
        task_name: str | None,
        available_artifacts: int,
        injected_artifact_ids: Sequence[str],
        elided_artifact_ids: Sequence[str],
        full_artifact_ids: Sequence[str] | None = None,
    ) -> None:
        self._diag.context_selection(
            actor=actor,
            task_name=task_name,
            available_artifacts=available_artifacts,
            injected_artifact_ids=injected_artifact_ids,
            elided_artifact_ids=elided_artifact_ids,
            full_artifact_ids=full_artifact_ids,
        )

    @staticmethod
    def _format_summary_block(record: ArtifactRecord) -> str:
        lines = [
            f"=== {record.slug} [{record.id}] (persona: {record.source_persona or 'unknown'}) "
            f"[{record.status}] ===",
            f"SUMMARY: {record.summary}",
        ]
        if record.key_findings:
            lines.append("KEY FINDINGS:")
            kf = record.key_findings
            if len(kf) > 600:
                kf = kf[:597] + "…"
            lines.append(kf)
        return "\n".join(lines)

    @staticmethod
    def _format_full_block(record: ArtifactRecord) -> str:
        if record.body_markdown and (
            record.kind == "agent_published" or record.edited_at is not None
        ):
            header = (
                f"=== {record.slug} [{record.id}] (persona: {record.source_persona or 'unknown'}) "
                f"[{record.status}] ==="
            )
            return header + "\n" + record.body_markdown.strip()

        parts: list[str] = [SessionArtifactStore._format_summary_block(record)]
        if record.highlight_paths:
            parts.append("HIGHLIGHT PATHS:")
            for hp in record.highlight_paths:
                p = hp.get("path", "")
                reason = hp.get("reason") or ""
                parts.append(f"  - {p}" + (f" — {reason}" if reason else ""))
        if record.snippets:
            parts.append("SNIPPETS:")
            for sn in record.snippets:
                p = sn.get("path") or "<unknown>"
                reason = sn.get("reason") or ""
                heading = f"  • {p}" + (f" ({reason})" if reason else "")
                parts.append(heading)
                content = str(sn.get("content", ""))
                for line in content.splitlines():
                    parts.append(f"    {line}")
        if record.edited_files:
            parts.append("EDITED FILES:")
            for ef in record.edited_files:
                parts.append(f"  - {ef.get('path', '')} ({ef.get('change_type', '')})")
        if record.created_files:
            parts.append("CREATED FILES:")
            for cf in record.created_files:
                parts.append(f"  - {cf.get('path', '')}")
        return "\n".join(parts)
