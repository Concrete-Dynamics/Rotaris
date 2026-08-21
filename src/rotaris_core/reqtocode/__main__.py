"""Entry point: python -m rotaris_core.reqtocode"""
# reqtocode: exempt
# Trivial module entry shim: delegates to rotaris_core.reqtocode.cli.main.

from __future__ import annotations

import sys

from rotaris_core.reqtocode.cli import main

if __name__ == "__main__":
    sys.exit(main())
