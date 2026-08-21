from __future__ import annotations

import logging
import os
import tempfile
import time
from contextlib import suppress
from pathlib import Path

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_MAX_REPLACE_RETRIES = 5
_REPLACE_RETRY_DELAY_BASE_S = 0.05


@traces(SWR.SWR_659, SWR.SWR_666)
def atomic_write(path: Path, content: str, encoding: str = "utf-8") -> None:
    """Write content to a file atomically via mkstemp + os.replace.

    On Windows, ``os.replace`` can fail with ``ERROR_ACCESS_DENIED`` (winerror 5)
    when another process (antivirus, search indexer, cloud sync) holds a
    transient handle on the destination file.  This function retries the replace
    up to ``_MAX_REPLACE_RETRIES`` times with exponential backoff before giving
    up.
    """
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    os.close(fd)
    try:
        with Path(tmp).open("w", encoding=encoding, newline="") as fh:
            fh.write(content)
        for attempt in range(_MAX_REPLACE_RETRIES):
            try:
                os.replace(tmp, path)
                break
            except OSError as exc:
                if not _is_access_denied_on_windows(exc):
                    raise
                if attempt == _MAX_REPLACE_RETRIES - 1:
                    raise
                delay = _REPLACE_RETRY_DELAY_BASE_S * (2**attempt)
                _log.warning(
                    "atomic_write retry %d/%d for %s (access denied, waiting %.3fs)",
                    attempt + 1,
                    _MAX_REPLACE_RETRIES,
                    path,
                    delay,
                )
                time.sleep(delay)
    finally:
        with suppress(FileNotFoundError):
            os.unlink(tmp)


def _is_access_denied_on_windows(exc: OSError) -> bool:
    """Return ``True`` when *exc* is ``ERROR_ACCESS_DENIED`` on Windows."""
    return bool(getattr(exc, "winerror", None) == 5)
