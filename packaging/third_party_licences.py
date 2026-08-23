"""Generate ``THIRD-PARTY-LICENSES.txt`` for a release artifact.

Build tooling, like the ``.spec`` files next to it: never imported by shipped
code, stdlib-only, and outside the ReqToCode trees.

Every release has to ship the licence texts of what it bundles — the LGPL parts
(Qt/PySide6, pyte) make that a condition of distributing at all, and the Cyber
Resilience Act expects the same inventory in the technical documentation. Doing
it by hand goes stale the first time a dependency moves.

Runtime dependencies come from ``uv export --no-dev``; the metadata comes from
the environment this runs in, so run it in the same environment the artifact is
frozen from.

Python distributions are not the whole artifact: the desktop app also ships
fonts and icon sets, and SWR-3715 downloads a few tools after installation.
Both are inventoried here, with the licence text the fonts must travel with and
the name/version/source/licence of the provisioned tools. A missing or empty
bundled-asset licence fails the run, so a release cannot go out without its
notices.

    uv run python packaging/third_party_licences.py

The default output lives inside the desktop package's assets so PyInstaller's
``collect_datas()`` walk carries it into every standalone artifact.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent

#: Where the desktop package keeps its shipped resources. The generated notice
#: bundle lives here so the PyInstaller data walk bundles it (SWR-3720 AC-006).
_DESKTOP_ASSETS = _ROOT / "apps" / "rotaris" / "src" / "rotaris" / "assets"

#: Packages that are the product itself, not a third party.
_OURS = {"rotaris", "rotaris-core"}

_HEADER = """\
Third-party software in Rotaris {version}
=========================================

Rotaris bundles the components listed below. Each is used under its own licence,
reproduced here in full where the package ships the text. These licences govern
those components; they are not affected by the licence of Rotaris itself.

Some components are licensed under the GNU Lesser General Public License. You may
modify them and use your modified version with Rotaris, and you may reverse
engineer Rotaris as far as that requires. Ask us at info@concrete-dynamics.com for
whatever you need to relink the application against your own build.

"""


@dataclass(frozen=True)
class BundledAsset:
    """One non-Python component shipped inside the desktop artifact."""

    name: str
    kind: str
    source_url: str
    licence_id: str
    licence_file: Path


#: The shipped fonts and icon set, each with the licence text that must travel
#: with it. A release fails when one of these is missing or empty (SWR-3720
#: AC-002/AC-003).
BUNDLED_ASSETS: tuple[BundledAsset, ...] = (
    BundledAsset(
        "JetBrains Mono",
        "font",
        "https://github.com/JetBrains/JetBrainsMono",
        "SIL Open Font License 1.1",
        _DESKTOP_ASSETS / "fonts" / "OFL-JetBrainsMono.txt",
    ),
    BundledAsset(
        "Manrope",
        "font",
        "https://github.com/sharanda/manrope",
        "SIL Open Font License 1.1",
        _DESKTOP_ASSETS / "fonts" / "OFL-Manrope.txt",
    ),
    BundledAsset(
        "Space Grotesk",
        "font",
        "https://github.com/floriankarsten/space-grotesk",
        "SIL Open Font License 1.1",
        _DESKTOP_ASSETS / "fonts" / "OFL-SpaceGrotesk.txt",
    ),
    BundledAsset(
        "Phosphor Icons",
        "icon font",
        "https://github.com/phosphor-icons",
        "MIT",
        _DESKTOP_ASSETS / "fonts" / "LICENSE-Phosphor.txt",
    ),
)

_ASSETS_HEADER = """\
Bundled desktop assets
======================

Non-Python components shipped inside the desktop application itself. Each is
used under its own licence, reproduced in full below.

"""

_PROVISIONED_HEADER = """\
Tools provisioned after installation
====================================

Rotaris downloads these tools from their official sources the first time it runs
on a machine (SWR-3715). They are not bundled into the installer; name, version,
source and licence are recorded here for disclosure.

"""


@dataclass(frozen=True)
class ProvisionedTool:
    """A tool the app downloads on first run — never bundled into the installer."""

    name: str
    version: str
    source_url: str
    licence_id: str


@dataclass(frozen=True)
class LicenceReview:
    """A human classification for a wheel that ships no licence metadata."""

    licence_id: str
    review_note: str


#: Maintainer-reviewed classifications for wheels whose metadata declares no
#: licence and that ship no licence text. This is the documented licence-review
#: rule SWR-3720 AC-003 allows: the release check stays red for anything not
#: resolved here. Each entry was verified against the named upstream repository;
#: re-verify on every version bump.
_REVIEWED_LICENCES: dict[str, LicenceReview] = {
    "openhands-sdk": LicenceReview(
        "MIT",
        "upstream repository All-Hands-AI/OpenHands is MIT-licensed (verified 2026-08-23)",
    ),
    "openhands-tools": LicenceReview(
        "MIT",
        "upstream repository All-Hands-AI/OpenHands is MIT-licensed (verified 2026-08-23)",
    ),
    "lmnr-claude-code-proxy": LicenceReview(
        "Apache-2.0",
        "built from lmnr-ai/lmnr (Apache-2.0); PyPI LicenseRef-Proprietary treated as "
        "a packaging-metadata error (verified 2026-08-23)",
    ),
}


def _provisioned_tools() -> list[ProvisionedTool] | None:
    """Tools SWR-3715 downloads after installation, from the pinned setup manifest.

    None when the manifest is not importable — the generator then reports a
    problem instead of silently dropping the section.
    """
    try:
        from rotaris_core.setup.manifest import default_setup_manifest
    except ImportError:
        return None
    manifest = default_setup_manifest()
    tools: list[ProvisionedTool] = []
    for tool in manifest.tools:
        first_artifact = next(iter(tool.artifacts.values()))
        tools.append(
            ProvisionedTool(tool.name, tool.provisioned_version, first_artifact.url, tool.license)
        )
    return tools


def _bundled_asset_problems(assets: tuple[BundledAsset, ...]) -> list[str]:
    """Every bundled asset whose required notice text is missing or unreadable."""
    problems: list[str] = []
    for asset in assets:
        try:
            text = asset.licence_file.read_text(encoding="utf-8")
        except OSError:
            problems.append(f"{asset.name}: licence file not found: {asset.licence_file}")
            continue
        if not text.strip():
            problems.append(f"{asset.name}: licence file is empty: {asset.licence_file}")
    return problems


def _bundled_asset_sections() -> list[str]:
    """The attribution and full licence text of every bundled non-Python asset."""
    sections: list[str] = [_ASSETS_HEADER]
    for asset in BUNDLED_ASSETS:
        sections.append("-" * 78)
        sections.append(f"{asset.name} ({asset.kind})")
        sections.append(f"Source: {asset.source_url}")
        sections.append(f"Licence: {asset.licence_id}")
        sections.append("")
        try:
            sections.append(asset.licence_file.read_text(encoding="utf-8").rstrip() + "\n")
        except OSError:
            sections.append(f"    [licence file missing: {asset.licence_file}]\n")
    return sections


def _provisioned_sections() -> tuple[list[str], list[str]]:
    """The disclosure section for tools SWR-3715 downloads after installation."""
    sections: list[str] = [_PROVISIONED_HEADER]
    tools = _provisioned_tools()
    if tools is None:
        return sections, ["provisioned-tool manifest could not be imported"]
    for tool in tools:
        sections.append("-" * 78)
        sections.append(f"{tool.name} {tool.version}")
        sections.append("Provisioned after installation — not bundled in the installer")
        sections.append(f"Source: {tool.source_url}")
        sections.append(f"Licence: {tool.licence_id}")
        sections.append("")
    return sections, []


def _runtime_distributions() -> set[str]:
    """Normalised names of the runtime dependency closure, per ``uv``."""
    result = subprocess.run(  # noqa: S603
        ["uv", "export", "--no-dev", "--no-hashes", "--no-emit-project", "--all-packages"],  # noqa: S607
        cwd=_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return _parse_uv_export(result.stdout)


def _normalise(name: str) -> str:
    return name.lower().replace("_", "-")


def _parse_uv_export(output: str) -> set[str]:
    """Distribution names from a ``uv export`` report, minus the product itself.

    ``uv export --no-dev`` already leaves development/CI-only dependencies out of
    the report; this only extracts names and drops the two packages that are the
    product rather than a third party.
    """
    names: set[str] = set()
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "-")):
            continue
        name = stripped.split("==")[0].split("[")[0].split(";")[0].strip()
        if name:
            names.add(_normalise(name))
    return names - _OURS


def _licence_texts(dist: metadata.Distribution) -> list[str]:
    """Every licence file the distribution ships, in full."""
    texts: list[str] = []
    for file in dist.files or ():
        parts = [part.lower() for part in file.parts]
        if not any(p.startswith(("license", "licence", "copying", "notice")) for p in parts[-2:]):
            continue
        located = dist.locate_file(file)
        try:
            texts.append(Path(str(located)).read_text(encoding="utf-8", errors="replace"))
        except (OSError, UnicodeDecodeError):
            continue
    return texts


def _declared_licence(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    declared = meta.get("License-Expression") or meta.get("License")
    if declared and declared.strip() and "\n" not in declared.strip():
        return declared.strip()
    classifiers = [
        value.split("License :: ")[-1]
        for value in meta.get_all("Classifier") or ()
        if value.startswith("License ::")
    ]
    if classifiers:
        return "; ".join(classifiers)
    return "NOT DECLARED"


def build(version: str) -> tuple[str, list[str]]:
    wanted = _runtime_distributions()
    sections: list[str] = [_HEADER.format(version=version)]
    problems: list[str] = []

    for dist in sorted(
        metadata.distributions(), key=lambda d: _normalise(d.metadata["Name"] or "")
    ):
        name = dist.metadata["Name"]
        if not name or _normalise(name) not in wanted:
            continue
        declared = _declared_licence(dist)
        texts = _licence_texts(dist)
        if declared == "NOT DECLARED" and not texts:
            reviewed = _REVIEWED_LICENCES.get(_normalise(name))
            if reviewed is not None:
                declared = reviewed.licence_id
                texts = [f"Licence classified by Rotaris licence review: {reviewed.review_note}"]
            else:
                problems.append(f"{name} {dist.version}")

        sections.append("-" * 78)
        sections.append(f"{name} {dist.version}")
        sections.append(f"Licence: {declared}")
        url = dist.metadata.get("Home-page") or ""
        if url:
            sections.append(f"Homepage: {url}")
        sections.append("")
        if texts:
            sections.extend(text.rstrip() + "\n" for text in texts)
        else:
            sections.append(
                "    [no licence text shipped in this package — see the project's own repository]\n"
            )

    sections.extend(_bundled_asset_sections())
    problems.extend(_bundled_asset_problems(BUNDLED_ASSETS))
    provisioned, tool_problems = _provisioned_sections()
    sections.extend(provisioned)
    problems.extend(tool_problems)

    return "\n".join(sections), problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_DESKTOP_ASSETS / "THIRD-PARTY-LICENSES.txt",
    )
    parser.add_argument("--version", default=_read_version())
    args = parser.parse_args()

    text, problems = build(args.version)
    args.output.write_text(text, encoding="utf-8")
    print(f"wrote {args.output} ({len(text.splitlines())} lines)")

    if problems:
        print("\nRELEASE CHECK FAILED — resolve before releasing:", file=sys.stderr)
        for entry in problems:
            print(f"  - {entry}", file=sys.stderr)
        return 1
    return 0


def _read_version() -> str:
    pyproject = (_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    for line in pyproject.splitlines():
        if line.startswith("version = "):
            return line.split("=", 1)[1].strip().strip('"')
    return "unknown"


if __name__ == "__main__":
    raise SystemExit(main())
