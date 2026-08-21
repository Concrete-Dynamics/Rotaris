# reqtocode: exempt -- a re-export, no logic of its own; the ordering it forwards
# is traced where it is implemented (rotaris_core.requirements.model, SWR-3108)
"""One ordering for requirement ids, borrowed from the engine (SWR-3311).

`SWR-9` sorts before `SWR-10`, which lexicographic ordering gets wrong. The
engine already decides that — :func:`rotaris_core.requirements.requirement_sort_key`
is what orders children, board columns, audit trails and every deterministic
report — and the board once carried a second implementation of the same idea,
written character-by-character where the engine splits on digit runs. Measured
over 534 ids the two ordered identically, differing only where a character's
casefold expands (``"ß".casefold() == "ss"``), which a requirement id never
contains. Agreement by luck is not the property worth having, so there is now one
implementation.

**This module exists because of where the other one had to go.** A board surface
may not import the engine at run time — the bridge is its only seam, swept by
`test_no_board_surface_reaches_the_requirement_engine_at_all` — and
`views/requirements.py` is one of those surfaces. The engine's values reach the
board pre-translated through this package, so its ordering does too. The guard
stays exactly as blunt as it was; nothing argues its way past it.
"""

from __future__ import annotations

from rotaris_core.requirements.model import requirement_sort_key

__all__ = ["requirement_sort_key"]
