"""Frozen entry point for the Rotaris desktop app (SWR-3001).

PyInstaller freezes a *script*, not a console-script entry point, so each shipped
executable needs one of these. It does exactly what the ``[project.scripts]``
wrapper does: call ``main()`` and exit with its status.

The parser-host intercept (SWR-3123) runs first, before the desktop import: a
frozen Rotaris re-execs *itself* to run a generated requirement parser, and that
child lives for fractions of a second — it must not pay for Qt on the way.
"""

import sys

from rotaris_core.requirements.sources.parser_host import intercept
from rotaris_core.mcp.bundled_serena import intercept as intercept_serena

if __name__ == "__main__":
    hosted = intercept(sys.argv)
    if hosted is not None:
        sys.exit(hosted)

    hosted = intercept_serena(sys.argv)
    if hosted is not None:
        sys.exit(hosted)

    from rotaris.main import main

    sys.exit(main())
