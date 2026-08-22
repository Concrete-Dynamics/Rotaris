"""The one way a host reaches into a run it is not executing (SWR-2426).

A host watches a run through state it already reads from disk — the session
snapshot the desktop polls, the ``events.jsonl`` every run persists. What it
cannot do that way is *act* on the run: answer a permission prompt, steer an
agent, pause the loop, type into a terminal. Today those calls reach straight
into live engine objects, which is only possible because the run happens to
share a process with the window.

This package is that reach, named and narrowed:

* :mod:`~rotaris_core.runchannel.messages` — the closed set of things a host may
  ask of a run, as frozen dataclasses carrying scalars and nothing else.
* :mod:`~rotaris_core.runchannel.control` — :class:`RunControl`, the interface a
  host calls, and :class:`RunSurface`, the live objects an in-process
  implementation drives.
* :mod:`~rotaris_core.runchannel.inprocess` — the implementation for a run in
  this process, which is what every host uses today.

The point of the narrowing is that a second implementation — a run in its own
process — is then a swap rather than a rewrite, and that the messages already
say what would have to cross. Nothing here starts a process; that is deliberate.
"""

from rotaris_core.runchannel.control import RunControl, RunSurface
from rotaris_core.runchannel.inprocess import InProcessRunControl
from rotaris_core.runchannel.messages import CONTROL_MESSAGES, ControlResult

__all__ = [
    "CONTROL_MESSAGES",
    "ControlResult",
    "InProcessRunControl",
    "RunControl",
    "RunSurface",
]
