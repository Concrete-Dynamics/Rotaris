"""Rotaris — desktop workspace for the Rotaris orchestration framework."""

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _distribution_version


def _read_version() -> str:
    """Read the installed distribution's version rather than restating it.

    The literal that used to live here said ``0.1.0`` while ``pyproject.toml``
    had reached ``0.15.0``. Nothing reads this today, which is precisely why it
    was free to drift; reading the metadata means it cannot.
    """
    try:
        return _distribution_version("rotaris")
    except PackageNotFoundError:  # pragma: no cover - requires an uninstalled tree
        return "0+unknown"


__version__ = _read_version()
