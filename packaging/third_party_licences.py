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

    uv run python packaging/third_party_licences.py -o THIRD-PARTY-LICENSES.txt
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from importlib import metadata
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent

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


def _runtime_distributions() -> set[str]:
    """Normalised names of the runtime dependency closure, per ``uv``."""
    result = subprocess.run(  # noqa: S603
        ["uv", "export", "--no-dev", "--no-hashes", "--no-emit-project", "--all-packages"],  # noqa: S607
        cwd=_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    names: set[str] = set()
    for line in result.stdout.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "-")):
            continue
        name = stripped.split("==")[0].split("[")[0].split(";")[0].strip()
        if name:
            names.add(_normalise(name))
    return names - _OURS


def _normalise(name: str) -> str:
    return name.lower().replace("_", "-")


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
    undeclared: list[str] = []

    for dist in sorted(metadata.distributions(), key=lambda d: _normalise(d.metadata["Name"] or "")):
        name = dist.metadata["Name"]
        if not name or _normalise(name) not in wanted:
            continue
        declared = _declared_licence(dist)
        texts = _licence_texts(dist)
        if declared == "NOT DECLARED" and not texts:
            undeclared.append(f"{name} {dist.version}")

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
                "    [no licence text shipped in this package — see the project's "
                "own repository]\n"
            )

    return "\n".join(sections), undeclared


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--output", type=Path, default=_ROOT / "THIRD-PARTY-LICENSES.txt")
    parser.add_argument("--version", default=_read_version())
    args = parser.parse_args()

    text, undeclared = build(args.version)
    args.output.write_text(text, encoding="utf-8")
    print(f"wrote {args.output} ({len(text.splitlines())} lines)")

    if undeclared:
        print("\nNO LICENCE DECLARED — resolve before releasing:", file=sys.stderr)
        for entry in undeclared:
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
