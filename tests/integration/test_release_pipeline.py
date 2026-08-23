"""Productive use: a maintainer tags a version and expects the pipeline to build every
platform, publish the artifacts with checksums, and refuse to release a version the
packages do not carry.
Expected outcome: the documented guard command accepts an agreeing checkout and
rejects a mismatch by exit code; and the release workflow is wired to the platforms,
triggers and permissions the release code declares — which is what makes those
decisions testable before a tag is pushed rather than after."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
import yaml

from rotaris_core.packaging.cli import main
from rotaris_core.packaging.pyinstaller import repo_root
from rotaris_core.packaging.release import CHECKSUM_FILE, PLATFORMS, expected_artifacts
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Mapping

WORKFLOW = Path(".github") / "workflows" / "release.yml"


def _steps_text(job: Mapping[str, Any]) -> str:
    """A job's steps as flat text. ``width`` is not cosmetic: the default wraps long
    ``run:`` lines and would split the very commands these tests look for."""
    return yaml.safe_dump(job["steps"], width=10_000)


@pytest.fixture(scope="module")
def workflow() -> Mapping[str, Any]:
    """The release workflow as data. Parsing it is also the check that it is valid."""
    document = yaml.safe_load((repo_root() / WORKFLOW).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return document


def _checkout(root: Path, *, core: str, desktop: str) -> Path:
    (root / "pyproject.toml").write_text(
        f'[project]\nname = "rotaris-core"\nversion = "{core}"\n', encoding="utf-8"
    )
    app = root / "apps" / "rotaris"
    app.mkdir(parents=True)
    (app / "pyproject.toml").write_text(
        f'[project]\nname = "rotaris"\nversion = "{desktop}"\n', encoding="utf-8"
    )
    return root


@verifies(SWR.SWR_3002)
def test_the_guard_command_accepts_an_agreeing_checkout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The flow the pipeline's first job runs: hand it the ref, get the version."""
    root = _checkout(tmp_path, core="1.2.3", desktop="1.2.3")

    exit_code = main(["verify-version", "refs/tags/v1.2.3", "--root", str(root)])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == "1.2.3"


@verifies(SWR.SWR_3002)
def test_the_guard_command_stops_a_mismatched_release(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """AC-006: this failure has to happen before any artifact is built — the exit code
    is what stops the matrix, and the message is what tells the maintainer which file
    to edit."""
    root = _checkout(tmp_path, core="1.2.3", desktop="0.17.3")

    exit_code = main(["verify-version", "v1.2.3", "--root", str(root)])

    assert exit_code == 1
    error = capsys.readouterr().err
    assert "0.17.3" in error
    assert "apps/rotaris/pyproject.toml" in error


@verifies(SWR.SWR_3002)
def test_checksums_and_notes_are_produced_from_the_collected_artifacts(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The release job's own flow: everything the runners uploaded lands in one
    directory, and the two commands turn it into a manifest and a body."""
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    root = _checkout(checkout, core="1.2.3", desktop="1.2.3")
    dist = tmp_path / "staging"
    dist.mkdir()
    for name in expected_artifacts("1.2.3")["linux-x86_64"]:
        (dist / name).write_bytes(b"artifact")
    notes = tmp_path / "release-notes.md"

    assert main(["checksums", "--dist", str(dist)]) == 0
    assert (
        main(
            [
                "notes",
                "--version",
                "1.2.3",
                "--dist",
                str(dist),
                "--root",
                str(root),
                "--output",
                str(notes),
            ]
        )
        == 0
    )

    manifest = (dist / CHECKSUM_FILE).read_text(encoding="utf-8")
    assert manifest.splitlines()
    assert CHECKSUM_FILE not in manifest, "the manifest must not list itself"
    body = notes.read_text(encoding="utf-8")
    assert "Rotaris 1.2.3" in body
    # Two of three platforms produced nothing here, and the body has to say so.
    assert "Not built in this release" in body
    capsys.readouterr()


@verifies(SWR.SWR_3002)
def test_a_missing_artifact_directory_is_reported(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["checksums", "--dist", "no-such-directory"]) == 1
    assert "no artifact directory" in capsys.readouterr().err


@verifies(SWR.SWR_3002)
def test_only_a_release_tag_triggers_the_pipeline(workflow: Mapping[str, Any]) -> None:
    """AC-001. ``on`` is parsed by PyYAML as the boolean ``True`` — the YAML 1.1
    legacy that quietly turns this assertion into a KeyError if you look for "on"."""
    triggers = workflow[True]

    assert set(triggers) == {"push"}, "a workflow that publishes must not run on a branch or PR"
    assert triggers["push"] == {"tags": ["v*.*.*"]}


@verifies(SWR.SWR_3002)
def test_the_matrix_matches_the_platforms_the_code_declares(workflow: Mapping[str, Any]) -> None:
    """The release body promises artifacts per platform; the matrix builds them. They
    only stay in step because this test refuses to let one move alone."""
    legs = workflow["jobs"]["build"]["strategy"]["matrix"]["include"]

    assert {leg["platform"] for leg in legs} == {platform.key for platform in PLATFORMS}
    by_key = {leg["platform"]: leg["runner"] for leg in legs}
    for platform in PLATFORMS:
        assert by_key[platform.key] == platform.runner


@verifies(SWR.SWR_3002)
def test_native_packagers_run_from_a_fresh_checkout(workflow: Mapping[str, Any]) -> None:
    """Productive use: a maintainer can publish native bundles from GitHub's checkout.
    Expected outcome: shell packagers run even when Git records them as regular files.
    """
    steps = {
        step.get("name"): step
        for step in workflow["jobs"]["build"]["steps"]
        if isinstance(step, dict)
    }

    assert 'bash packaging/macos/make_dmg.sh "${VERSION}"' in steps["macOS DMG"]["run"]
    assert 'bash packaging/linux/make_appimage.sh "${VERSION}"' in steps["Linux AppImage"]["run"]


@verifies(SWR.SWR_3724)
def test_every_native_release_smokes_the_bundled_serena_entry(
    workflow: Mapping[str, Any],
) -> None:
    """Productive use: release users receive artifacts whose Serena runtime starts.
    Expected outcome: the native matrix runs the internal Serena help command before packaging."""
    steps = {
        step.get("name"): step
        for step in workflow["jobs"]["build"]["steps"]
        if isinstance(step, dict)
    }

    smoke = steps["Bundled Serena smoke"]
    assert smoke["shell"] == "bash"
    assert "--rotaris-run-bundled-serena start-mcp-server --help" in smoke["run"]
    assert "dist/rotaris/rotaris.exe" in smoke["run"]
    assert "dist/rotaris/rotaris" in smoke["run"]


@verifies(SWR.SWR_3002)
def test_one_failing_platform_still_publishes_the_others(workflow: Mapping[str, Any]) -> None:
    """AC-003: ``fail-fast: false`` keeps the sibling builds alive, and the release job
    runs even when a leg failed — otherwise a single broken runner takes the whole
    release down."""
    jobs = workflow["jobs"]

    assert jobs["build"]["strategy"]["fail-fast"] is False
    assert jobs["release"]["if"].startswith("always()")
    # ...and the run still goes red, so the partial failure is not silently tolerated.
    assert set(jobs["status"]["needs"]) == {"build", "release"}
    assert jobs["status"]["if"] == "always()"


@verifies(SWR.SWR_3002)
def test_a_version_mismatch_blocks_every_later_job(workflow: Mapping[str, Any]) -> None:
    """AC-006: the guard is not advisory. Nothing builds, publishes, or releases
    without it having succeeded."""
    jobs = workflow["jobs"]

    assert jobs["build"]["needs"] == "guard"
    assert "guard" in jobs["release"]["needs"]
    assert "needs.guard.result == 'success'" in jobs["release"]["if"]
    assert "guard" in jobs["publish-pypi"]["needs"]


@verifies(SWR.SWR_3002)
def test_publishing_uses_trusted_publishing_and_never_gates_the_release(
    workflow: Mapping[str, Any],
) -> None:
    """Productive use: a maintainer can publish both packages after a GitHub Release.
    Expected outcome: checkout can read the private repo and PyPI auth uses OIDC.
    """
    publish = workflow["jobs"]["publish-pypi"]

    assert publish["permissions"]["contents"] == "read"
    assert publish["permissions"]["id-token"] == "write"
    assert publish["continue-on-error"] is True
    assert "release" in publish["needs"]
    steps = _steps_text(publish)
    assert "pypa/gh-action-pypi-publish" in steps
    assert "secrets." not in steps, "trusted publishing stores no credential"
    # A bare `uv build` in a workspace builds the root package only.
    assert "--package rotaris-core" in steps
    assert "--package rotaris " in steps


@verifies(SWR.SWR_3002)
def test_the_release_job_may_write_and_the_workflow_may_not(
    workflow: Mapping[str, Any],
) -> None:
    """Creating a Release needs ``contents: write``; nothing else in the run does."""
    assert workflow["permissions"]["contents"] == "read"
    assert workflow["jobs"]["release"]["permissions"]["contents"] == "write"


@verifies(SWR.SWR_3002)
def test_the_release_body_and_checksums_come_from_the_tested_code(
    workflow: Mapping[str, Any],
) -> None:
    """The point of the whole arrangement: what CI does is what the unit tests cover.
    Reimplementing any of it in a ``run:`` block would make it untestable until a tag
    is pushed."""
    steps = _steps_text(workflow["jobs"]["release"])

    assert "python -m rotaris_core.packaging checksums" in steps
    assert "python -m rotaris_core.packaging notes" in steps
    assert "sha256sum" not in steps, "the checksum format is decided in release.py"
    # The changelog needs history that a shallow clone does not have.
    assert "fetch-depth: 0" in steps
