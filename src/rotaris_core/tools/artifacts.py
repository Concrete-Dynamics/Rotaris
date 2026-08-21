"""Artifact tools — let agents read/list/publish session artifacts.

Closure-injected ``artifact_store`` at agent-creation time follows the same
pattern as the delegate tool, so personas remain JSON-serialisable in their
config while the tool itself retains a live reference to the per-session
store owned by :class:`~rotaris_core.ralph.loop.RalphLoop`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.orchestrator.artifacts import VALID_ARTIFACT_TAGS
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Self

    from rotaris_core.orchestrator.artifacts import ArtifactRecord, SessionArtifactStore
    from rotaris_core.orchestrator.child_manager import ChildManager


def _persona_from(kwargs: dict[str, Any]) -> str | None:
    """Read the calling agent's persona out of ``Tool.params``."""
    persona = kwargs.get("persona") or kwargs.get("persona_name")
    return str(persona) if persona else None


# ---------------------------------------------------------------------------
# artifact_read


class ArtifactReadAction(Action):
    id_or_slug: str = Field(
        description=(
            "Artifact id (e.g. 'art_8x3K9q22') or slug "
            "(e.g. 'input-composer-survey'). Use `artifact_list` to enumerate."
        ),
    )
    sections: list[str] = Field(
        default_factory=list,
        description=(
            "Optional subset of sections to return: "
            "'summary', 'key_findings', 'snippets', 'highlights', 'files'. "
            "Empty list returns the full body."
        ),
    )


class ArtifactReadObservation(Observation):
    found: bool = Field(default=False)
    body: str = Field(default="")

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        return [TextContent(text=self.body)]


@traces(SWR.SWR_1522)
class ArtifactReadExecutor(ToolExecutor[ArtifactReadAction, ArtifactReadObservation]):
    def __init__(self, artifact_store: SessionArtifactStore, persona: str | None = None) -> None:
        self.store = artifact_store
        self.persona = persona

    def __call__(
        self,
        action: ArtifactReadAction,
        conversation: object = None,
    ) -> ArtifactReadObservation:
        del conversation
        record = self.store.get(action.id_or_slug)
        if record is None:
            return ArtifactReadObservation.from_text(
                f"Artifact not found: {action.id_or_slug}",
                is_error=True,
                found=False,
                body=f"Artifact not found: {action.id_or_slug}",
            )
        self.store.mark_consumed(action.id_or_slug, self.persona)
        body = self._render_sections(record, action.sections)
        return ArtifactReadObservation.from_text(
            body,
            found=True,
            body=body,
        )

    @staticmethod
    def _render_sections(record: ArtifactRecord, sections: list[str]) -> str:
        if not sections:
            return record.body_markdown
        chunks: list[str] = [f"# {record.title} [{record.id}]"]
        wanted = {s.lower() for s in sections}
        if "summary" in wanted and record.summary:
            chunks.append("## Summary\n" + record.summary)
        if "key_findings" in wanted and record.key_findings:
            chunks.append("## Key Findings\n" + record.key_findings)
        if "highlights" in wanted and record.highlight_paths:
            lines = ["## Highlight Paths"]
            for hp in record.highlight_paths:
                p = hp.get("path", "")
                r = hp.get("reason") or ""
                lines.append(f"- `{p}`" + (f" — {r}" if r else ""))
            chunks.append("\n".join(lines))
        if "snippets" in wanted and record.snippets:
            lines = ["## Snippets"]
            for sn in record.snippets:
                p = sn.get("path") or ""
                r = sn.get("reason") or ""
                lines.append(f"### `{p}`" + (f" — {r}" if r else ""))
                lines.append("```")
                lines.append(str(sn.get("content", "")))
                lines.append("```")
            chunks.append("\n".join(lines))
        if "files" in wanted:
            if record.edited_files:
                lines = ["## Edited Files"]
                for ef in record.edited_files:
                    lines.append(f"- `{ef.get('path', '')}` ({ef.get('change_type', '')})")
                chunks.append("\n".join(lines))
            if record.created_files:
                lines = ["## Created Files"]
                for cf in record.created_files:
                    lines.append(f"- `{cf.get('path', '')}`")
                chunks.append("\n".join(lines))
        return "\n\n".join(chunks)


_ARTIFACT_READ_DESCRIPTION = (
    "Read a session artifact by id or slug. "
    "Artifacts contain authoritative prior-agent findings (summary, key findings, "
    "code snippets, highlight paths). "
    "Default returns the full Markdown body; pass `sections=['summary','snippets']` "
    "to return a filtered view."
)


@traces(SWR.SWR_2427)
class ArtifactReadTool(ToolDefinition[ArtifactReadAction, ArtifactReadObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        artifact_store = kwargs["artifact_store"]
        return [
            cls(
                description=_ARTIFACT_READ_DESCRIPTION,
                action_type=ArtifactReadAction,
                observation_type=ArtifactReadObservation,
                executor=ArtifactReadExecutor(artifact_store, _persona_from(kwargs)),
            ),
        ]


# ---------------------------------------------------------------------------
# artifact_list


class ArtifactListAction(Action):
    artifact_kind: str | None = Field(
        default=None,
        description="Filter by 'child_report'|'agent_published'|'system'.",
    )
    persona: str | None = Field(default=None, description="Filter by source persona.")
    tags: list[str] = Field(
        default_factory=list,
        description=(
            "Require ALL of these tags. Valid values: "
            "research, planning, implementation, review, verification, errors."
        ),
    )
    limit: int = Field(default=20, ge=1, le=200)
    include_superseded: bool = Field(default=False)


class ArtifactListObservation(Observation):
    count: int = Field(default=0)
    body: str = Field(default="")

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        return [TextContent(text=self.body)]


@traces(SWR.SWR_1523)
class ArtifactListExecutor(ToolExecutor[ArtifactListAction, ArtifactListObservation]):
    def __init__(self, artifact_store: SessionArtifactStore) -> None:
        self.store = artifact_store

    def __call__(
        self,
        action: ArtifactListAction,
        conversation: object = None,
    ) -> ArtifactListObservation:
        del conversation
        items = self.store.list(
            kind=action.artifact_kind,  # type: ignore[arg-type]
            persona=action.persona,
            tags=action.tags or None,
            include_superseded=action.include_superseded,
        )[: action.limit]
        if not items:
            text = "No artifacts found."
            return ArtifactListObservation.from_text(text, count=0, body=text)
        lines = [f"{len(items)} artifact(s):"]
        for r in items:
            tags = ", ".join(r.tags) if r.tags else "-"
            lines.append(
                f"- {r.id} [{r.slug}] persona={r.source_persona or '-'} "
                f"status={r.status} tags=[{tags}] — {r.title}",
            )
        body = "\n".join(lines)
        return ArtifactListObservation.from_text(body, count=len(items), body=body)


_ARTIFACT_LIST_DESCRIPTION = (
    "List session artifacts with optional filters. "
    "Returns one line per artifact with id, slug, persona, status, tags and title. "
    "Filter by `tags` (AND match) using the closed vocabulary: "
    "research, planning, implementation, review, verification, errors. "
    "Pair with `artifact_read(id)` to fetch full content. "
    "Superseded artifacts are hidden by default."
)


class ArtifactListTool(ToolDefinition[ArtifactListAction, ArtifactListObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        artifact_store = kwargs["artifact_store"]
        return [
            cls(
                description=_ARTIFACT_LIST_DESCRIPTION,
                action_type=ArtifactListAction,
                observation_type=ArtifactListObservation,
                executor=ArtifactListExecutor(artifact_store),
            ),
        ]


# ---------------------------------------------------------------------------
# artifact_write (publish a curated artifact)


class ArtifactWriteAction(Action):
    slug: str = Field(description="Kebab-case slug (e.g. 'plan-input-composer-refactor').")
    title: str = Field(description="One-line title for the artifact.")
    body: str = Field(description="Full Markdown body of the artifact.")
    tags: list[str] = Field(default_factory=list, description="Tags applied to the artifact.")
    supersedes: str | None = Field(
        default=None,
        description="Optional id/slug of an existing artifact to mark as superseded.",
    )


class ArtifactWriteObservation(Observation):
    artifact_id: str = Field(default="")
    slug: str = Field(default="")

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        return [TextContent(text=f"Published artifact {self.artifact_id} (slug: {self.slug}).")]


@traces(SWR.SWR_1524)
class ArtifactWriteExecutor(ToolExecutor[ArtifactWriteAction, ArtifactWriteObservation]):
    def __init__(
        self,
        artifact_store: SessionArtifactStore,
        persona: str,
        *,
        child_manager: ChildManager | None = None,
        canonical_name: str | None = None,
        task_id: str | None = None,
    ) -> None:
        self.store = artifact_store
        self.persona = persona
        self.child_manager = child_manager
        self.canonical_name = canonical_name
        self.task_id = task_id

    def __call__(
        self,
        action: ArtifactWriteAction,
        conversation: object = None,
    ) -> ArtifactWriteObservation:
        del conversation
        if action.tags:
            invalid = [t for t in action.tags if t not in VALID_ARTIFACT_TAGS]
            if invalid:
                msg = (
                    f"Invalid tag(s): {', '.join(sorted(invalid))}. "
                    f"Valid tags are: {', '.join(sorted(VALID_ARTIFACT_TAGS))}."
                )
                return ArtifactWriteObservation.from_text(
                    msg, is_error=True, artifact_id="", slug=action.slug
                )
        record = self.store.publish(
            slug=action.slug,
            title=action.title,
            body=action.body,
            persona=self.persona,
            tags=action.tags,
            supersedes=action.supersedes,
            source_task_id=self.task_id,
            canonical_name=self.canonical_name,
            created_by=self.canonical_name or self.persona,
        )
        if self.child_manager is not None and self.canonical_name is not None:
            self.child_manager.register_produced_artifact(self.canonical_name, record.id)
        return ArtifactWriteObservation.from_text(
            f"Published artifact {record.id} (slug: {record.slug}).",
            artifact_id=record.id,
            slug=record.slug,
        )


_ARTIFACT_WRITE_DESCRIPTION = (
    "Publish a curated artifact for downstream agents to consume via `artifact_read`. "
    "Use to materialise a plan, design, requirements doc, or research digest at the "
    "end of your turn. `tags` must use the closed vocabulary: "
    "research, planning, implementation, review, verification, errors. "
    "Pass `supersedes=<id_or_slug>` to mark an older version as "
    "obsolete (it remains readable but is hidden from default listings)."
)


@traces(SWR.SWR_2427)
class ArtifactWriteTool(ToolDefinition[ArtifactWriteAction, ArtifactWriteObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        artifact_store = kwargs["artifact_store"]
        return [
            cls(
                description=_ARTIFACT_WRITE_DESCRIPTION,
                action_type=ArtifactWriteAction,
                observation_type=ArtifactWriteObservation,
                # Pass the caller's identity through: dropping it here would
                # attribute the artifact to whoever registered last (SWR-2427).
                executor=ArtifactWriteExecutor(
                    artifact_store,
                    _persona_from(kwargs) or "unknown",
                    child_manager=kwargs.get("child_manager"),
                    canonical_name=kwargs.get("canonical_name"),
                    task_id=kwargs.get("task_id"),
                ),
            ),
        ]
