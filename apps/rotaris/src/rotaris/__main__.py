# reqtocode: exempt -- trivial `python -m rotaris` shim; entry logic is main.main (SWR-2001)
from rotaris.main import main

if __name__ == "__main__":
    raise SystemExit(main())
