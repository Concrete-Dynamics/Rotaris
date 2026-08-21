"""The Rotaris Python SDK — embed a Rotaris run in your own program (SWR-1830).

::

    import asyncio
    from pathlib import Path

    from rotaris_core.sdk import RotarisClient


    async def main() -> None:
        async with RotarisClient(Path("/path/to/workspace")) as client:
            result = await client.run("Add a health check endpoint")
            print(result.status, result.summary)


    asyncio.run(main())

A run started here is an ordinary Rotaris session.  It appears in
``rotaris sessions``, it can be resumed from the CLI or through
:attr:`RunOptions.session_id`, and it produces the same SWR-1829 event stream
that ``rotaris run --output-format stream-json`` writes — because the SDK and
the CLI call the same run entry point rather than each carrying their own copy
of the lifecycle.

Stability contract
------------------

**Public and stable** — the names in ``__all__``, and only those:

``SDK_API_VERSION``, :class:`RotarisClient`, :class:`RunHandle`,
:class:`RunOptions`, :class:`~rotaris_core.run_result.RunResult`,
:class:`~rotaris_core.run_result.RunStatus`,
:class:`~rotaris_core.events.schema.RotarisEvent`.

:data:`SDK_API_VERSION` is ``"1"``.  It is bumped when one of those names
changes signature or meaning, or disappears; adding a name, adding an optional
argument, or adding a field to an event does not bump it.  Pin against it if you
need to fail loudly on an incompatible install::

    from rotaris_core.sdk import SDK_API_VERSION

    if SDK_API_VERSION != "1":
        raise RuntimeError("This integration targets Rotaris SDK API 1.")

**Everything else in ``rotaris_core`` is internal** and may change in any
release without notice — including :mod:`rotaris_core.run_host`, which the SDK
is built on but does not re-export.  Reach for it and you are writing against a
private interface.

See ``docs/reference/python-sdk.md`` for the full guide.
"""

from __future__ import annotations

from rotaris_core.events.schema import RotarisEvent
from rotaris_core.run_result import RunResult, RunStatus
from rotaris_core.sdk.client import (
    SDK_API_VERSION,
    RotarisClient,
    RunHandle,
    RunOptions,
)

__all__ = [
    "SDK_API_VERSION",
    "RotarisClient",
    "RotarisEvent",
    "RunHandle",
    "RunOptions",
    "RunResult",
    "RunStatus",
]
