"""Unit tests for non-code project detection (SWR-2804)."""

import pytest

from rotaris_core.init.classifier import DEFAULT_SOURCE_EXTENSIONS, classify_project
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2804)
def test_empty_dir_is_non_code(tmp_path):
    """Productive use: a user opens an empty workspace and initializes it.
    Expected outcome: the workspace is classified non-code, so Serena onboarding is skipped."""
    assert classify_project(tmp_path) == "non-code"


@verifies(SWR.SWR_2804)
def test_markdown_only_is_non_code(tmp_path):
    """Productive use: a user initializes a documentation-only repository.
    Expected outcome: the workspace is classified non-code, so no code memories are written."""
    (tmp_path / "README.md").write_text("# Docs\n", encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "guide.md").write_text("guide\n", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("notes\n", encoding="utf-8")

    assert classify_project(tmp_path) == "non-code"


@verifies(SWR.SWR_2804)
def test_python_file_is_code(tmp_path):
    """Productive use: a user initializes a Python project that also carries docs.
    Expected outcome: the workspace is classified code, so Serena onboarding runs."""
    (tmp_path / "README.md").write_text("# App\n", encoding="utf-8")
    (tmp_path / "main.py").write_text("print('hi')\n", encoding="utf-8")

    assert classify_project(tmp_path) == "code"


@verifies(SWR.SWR_2804)
def test_nested_source_file_is_code(tmp_path):
    """Productive use: a user initializes a project whose only code sits deep in the tree.
    Expected outcome: the recursive scan still finds it and classifies the workspace as code."""
    nested = tmp_path / "services" / "api" / "internal" / "handlers"
    nested.mkdir(parents=True)
    (tmp_path / "README.md").write_text("# Service\n", encoding="utf-8")
    (nested / "health.go").write_text("package handlers\n", encoding="utf-8")

    assert classify_project(tmp_path) == "code"


@verifies(SWR.SWR_2804)
def test_custom_extensions(tmp_path):
    """Productive use: a user overrides `project_init.source_extensions` for a niche language.
    Expected outcome: only the configured extensions decide the classification."""
    (tmp_path / "analysis.lua").write_text("return {}\n", encoding="utf-8")
    (tmp_path / "main.py").write_text("print('hi')\n", encoding="utf-8")

    # The default list has no .lua, so restricting to .lua still finds code...
    assert classify_project(tmp_path, source_extensions=[".lua"]) == "code"
    # ...while an override that covers neither file yields non-code even though
    # a .py file (a default extension) is present.
    assert classify_project(tmp_path, source_extensions=[".rs"]) == "non-code"
    assert ".lua" not in DEFAULT_SOURCE_EXTENSIONS


@verifies(SWR.SWR_2804)
def test_respects_gitignore(tmp_path):
    """Productive use: a user initializes a docs repo that keeps a gitignored helper script.
    Expected outcome: the ignored file does not count, so the workspace stays non-code."""
    (tmp_path / ".gitignore").write_text("generated.py\nbuild/\n", encoding="utf-8")
    (tmp_path / "README.md").write_text("# Docs\n", encoding="utf-8")
    (tmp_path / "generated.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "build").mkdir()
    (tmp_path / "build" / "bundle.js").write_text("console.log(1)\n", encoding="utf-8")

    assert classify_project(tmp_path) == "non-code"

    # A tracked source file in the same tree flips it back to code, proving the
    # scan is not simply giving up on gitignored projects.
    (tmp_path / "tool.py").write_text("y = 2\n", encoding="utf-8")
    assert classify_project(tmp_path) == "code"


@verifies(SWR.SWR_2804)
def test_git_directory_is_skipped(tmp_path):
    """Productive use: a user initializes a docs repo that is itself a git checkout.
    Expected outcome: git's internal objects never make the workspace look like code."""
    (tmp_path / "README.md").write_text("# Docs\n", encoding="utf-8")
    git_hooks = tmp_path / ".git" / "hooks"
    git_hooks.mkdir(parents=True)
    (git_hooks / "pre-commit.py").write_text("import sys\n", encoding="utf-8")

    assert classify_project(tmp_path) == "non-code"


@verifies(SWR.SWR_2804)
def test_extension_matching_is_case_insensitive(tmp_path):
    """Productive use: a user initializes a C# project written with upper-case file suffixes.
    Expected outcome: the workspace is classified code regardless of suffix casing."""
    (tmp_path / "Program.CS").write_text("class P {}\n", encoding="utf-8")

    assert classify_project(tmp_path) == "code"
    assert classify_project(tmp_path, source_extensions=["CS"]) == "code"


@verifies(SWR.SWR_2804)
def test_default_extensions_cover_the_documented_languages():
    """Productive use: a user relies on the documented default extension list.
    Expected outcome: the shipped defaults are exactly the 23 extensions from SWR-2804."""
    assert DEFAULT_SOURCE_EXTENSIONS == (
        ".py",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".rs",
        ".go",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".rb",
        ".php",
        ".swift",
        ".kt",
        ".scala",
        ".cs",
        ".fs",
        ".ex",
        ".exs",
        ".r",
        ".jl",
    )
