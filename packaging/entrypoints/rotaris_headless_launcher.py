"""Frozen entry point for ``rotaris-headless`` (SWR-3001).

The parser-host intercept (SWR-3123) runs before the CLI import for the same
reason the desktop launcher's does: the re-exec child must start in
milliseconds, not after the SDK.
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

    from rotaris_core.cli.argparse_app import main

    sys.exit(main())
