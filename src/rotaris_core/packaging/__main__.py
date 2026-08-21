# reqtocode: exempt
# Trivial process entry shim: delegates to rotaris_core.packaging.cli (SWR-3001, SWR-3002).
import sys

from rotaris_core.packaging.cli import main

sys.exit(main())
