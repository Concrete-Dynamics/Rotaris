from __future__ import annotations

import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence


class GitCommitAction(Action):
    message: str = Field(...)
    files: list[str] | None = Field(default=None)


class GitCommitObservation(Observation):
    commit_sha: str | None = Field(default=None)
    files_staged: list[str] = Field(default_factory=list)

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        details = [
            f"commit_sha: {self.commit_sha or 'none'}",
            "files_staged: " + (", ".join(self.files_staged) if self.files_staged else "none"),
        ]
        text = "\n".join(details + ([self.text] if self.text else []))
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_2115)
class GitCommitExecutor(ToolExecutor[GitCommitAction, GitCommitObservation]):
    def __init__(
        self,
        workspace_root: Path,
        *,
        allow_outside_workspace: bool = False,
    ) -> None:
        self.workspace_root = workspace_root.resolve()
        self._allow_outside_workspace = allow_outside_workspace

    def __call__(
        self,
        action: GitCommitAction,
        conversation: object = None,
    ) -> GitCommitObservation:
        repo_check = self._run_git("git rev-parse --is-inside-work-tree")
        if repo_check.returncode != 0:
            return GitCommitObservation.from_text(
                repo_check.stderr.strip() or "Not a git repository",
                is_error=True,
                commit_sha=None,
                files_staged=[],
            )

        if action.files is None:
            stage_result = self._run_git("git add -u")
            if stage_result.returncode != 0:
                return GitCommitObservation.from_text(
                    stage_result.stderr.strip() or stage_result.stdout.strip() or "git add failed",
                    is_error=True,
                    commit_sha=None,
                    files_staged=[],
                )
        else:
            try:
                safe_paths = [self._validate_path(file_path) for file_path in action.files]
            except ValueError as exc:
                return GitCommitObservation.from_text(
                    str(exc),
                    is_error=True,
                    commit_sha=None,
                    files_staged=[],
                )

            stage_result = self._run_git(
                ["git", "add", "--", *safe_paths],
            )
            if stage_result.returncode != 0:
                return GitCommitObservation.from_text(
                    stage_result.stderr.strip() or stage_result.stdout.strip() or "git add failed",
                    is_error=True,
                    commit_sha=None,
                    files_staged=[],
                )

        staged_files = self._staged_files()
        if not staged_files:
            hint = self._unstaged_hint()
            message = f"No changes to commit.{hint}"
            return GitCommitObservation.from_text(
                message,
                is_error=True,
                commit_sha=None,
                files_staged=[],
            )

        commit_result = self._run_git(["git", "commit", "-m", action.message])
        if commit_result.returncode != 0:
            return GitCommitObservation.from_text(
                commit_result.stderr.strip() or commit_result.stdout.strip() or "git commit failed",
                is_error=True,
                commit_sha=None,
                files_staged=staged_files,
            )

        sha_result = self._run_git("git rev-parse HEAD")
        if sha_result.returncode != 0:
            return GitCommitObservation.from_text(
                sha_result.stderr.strip()
                or sha_result.stdout.strip()
                or "Unable to resolve commit SHA",
                is_error=True,
                commit_sha=None,
                files_staged=staged_files,
            )

        return GitCommitObservation.from_text(
            commit_result.stdout.strip() or f"Created commit {sha_result.stdout.strip()}",
            commit_sha=sha_result.stdout.strip(),
            files_staged=staged_files,
        )

    def _validate_path(self, file_path: str) -> str:
        candidate = (self.workspace_root / file_path).resolve()
        if self._allow_outside_workspace:
            return str(candidate)
        try:
            candidate.relative_to(self.workspace_root)
        except ValueError as exc:
            raise ValueError(f"Path escapes workspace: {file_path}") from exc
        return candidate.relative_to(self.workspace_root).as_posix()

    def _unstaged_hint(self) -> str:
        """Return a hint listing modified/untracked files when nothing is staged."""
        modified_result = self._run_git("git diff --name-only")
        untracked_result = self._run_git("git ls-files --others --exclude-standard")
        modified = [ln for ln in modified_result.stdout.splitlines() if ln.strip()]
        untracked = [ln for ln in untracked_result.stdout.splitlines() if ln.strip()]
        parts: list[str] = []
        if modified:
            parts.append("Modified tracked files: " + ", ".join(modified))
        if untracked:
            parts.append("Untracked files: " + ", ".join(untracked))
        if not parts:
            return " Working tree is clean."
        suffix = (
            ". Pass these paths in the files field or use files=null to stage all tracked changes."
        )
        return " " + " | ".join(parts) + suffix

    def _staged_files(self) -> list[str]:
        result = self._run_git("git diff --cached --name-only")
        if result.returncode != 0:
            return []
        return [line for line in result.stdout.splitlines() if line.strip()]

    def _run_git(self, command: str | list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            cwd=self.workspace_root,
            shell=isinstance(command, str),
            text=True,
            capture_output=True,
            check=False,
        )


class GitCommitTool(ToolDefinition[GitCommitAction, GitCommitObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        workspace_root = kwargs.get("workspace_root")
        if workspace_root is None:
            workspace_root = getattr(getattr(conv_state, "workspace", None), "working_dir", None)
        if workspace_root is None:
            raise ValueError("workspace_root is required")
        return [
            cls(
                description="Create a local git commit",
                action_type=GitCommitAction,
                observation_type=GitCommitObservation,
                executor=GitCommitExecutor(Path(workspace_root)),
            ),
        ]
