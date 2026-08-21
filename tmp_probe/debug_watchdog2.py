"""Debug probe: inline run_with_stall_watchdog with print tracing."""
import asyncio
import time

real_sleep = asyncio.sleep
clock: dict[str, float] = {"now": 0.0}
sleep_count = [0]
release = asyncio.Event()
last_activity: list[float] = [0.0]


def _monotonic():
    return clock["now"]


async def _fake_sleep(delay):
    sleep_count[0] += 1
    clock["now"] += delay
    print(f"  [sleep #{sleep_count[0]}] clock={clock['now']}", flush=True)
    if sleep_count[0] == 2:
        last_activity[0] = clock["now"]
    if sleep_count[0] >= 2:
        print(f"  [sleep #{sleep_count[0]}] SETTING release", flush=True)
        release.set()
    print(
        f"  [sleep #{sleep_count[0]}] about to yield via real_sleep(0)", flush=True)
    await real_sleep(0)
    print(f"  [sleep #{sleep_count[0]}] resumed after yield", flush=True)


async def _fake_to_thread(func, *args, **kwargs):
    print("  [to_thread] waiting on release", flush=True)
    await release.wait()
    print("  [to_thread] got release, calling func", flush=True)
    result = func(*args, **kwargs)
    print("  [to_thread] func done", flush=True)
    return result

# Patch the asyncio module directly
asyncio.sleep = _fake_sleep
asyncio.to_thread = _fake_to_thread
time.monotonic = _monotonic


class MockConv:
    def run(self):
        print("  [conv.run]", flush=True)


conv = MockConv()


class MockRecord:
    canonical_name = "test"


record = MockRecord()


class MockConfig:
    runtime = type("R", (), {"child_timeout": 4, "child_stall_timeout": 1})()


config = MockConfig()


class MockDiag:
    def issue(self, **kw):
        print(f"  [diag.issue] {kw['kind']}", flush=True)


diag = MockDiag()

events = []


def stall_cb(rec, elapsed, phase):
    events.append((rec.canonical_name, phase, elapsed))
    print(f"  [stall_cb] {phase} elapsed={elapsed}", flush=True)


async def main():
    print("START", flush=True)
    from geraet_ai.orchestrator.scheduler_watchdog import run_with_stall_watchdog
    try:
        await asyncio.wait_for(
            run_with_stall_watchdog(
                conv, record, last_activity,
                config=config, diag=diag,
                stall_callback=stall_cb,
                stall_timeout_override=1,
            ),
            timeout=5
        )
    except TimeoutError:
        print("TIMEOUT!", flush=True)
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", flush=True)
        import traceback
        traceback.print_exc()
    print(f"events={events}", flush=True)
    print("DONE", flush=True)

asyncio.run(main())
