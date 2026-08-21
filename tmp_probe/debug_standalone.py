"""Fully standalone probe: does the asyncio scheduling pattern work?"""
import asyncio
import contextlib
import time as _time

real_sleep = asyncio.sleep
clock = {"now": 0.0}
sleep_count = [0]
release = asyncio.Event()
last_activity = [0.0]


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
    print(f"  [sleep #{sleep_count[0]}] about to yield", flush=True)
    await real_sleep(0)
    print(f"  [sleep #{sleep_count[0]}] resumed after yield", flush=True)


async def _fake_to_thread(func, *args, **kwargs):
    print("  [to_thread] waiting on release", flush=True)
    await release.wait()
    print("  [to_thread] got release, calling func", flush=True)
    func(*args, **kwargs)
    print("  [to_thread] func done", flush=True)

# Simulate exactly what run_with_stall_watchdog does
_time.monotonic = _monotonic
asyncio.sleep = _fake_sleep
asyncio.to_thread = _fake_to_thread


class Conv:
    def run(self):
        print("  [conv.run]", flush=True)


conv = Conv()


async def watchdog_impl():
    """Minimal copy of run_with_stall_watchdog logic."""
    stall_timeout = 1
    poll_interval = 1.0

    run_task = asyncio.create_task(asyncio.to_thread(conv.run))
    print(f"  run_task created, type={type(run_task)}", flush=True)

    async def _watchdog():
        warned = False
        try:
            while not run_task.done():
                print("  [wd] about to sleep", flush=True)
                await asyncio.sleep(poll_interval)
                print("  [wd] woke up, checking", flush=True)
                elapsed = _time.monotonic() - last_activity[0]
                print(f"  [wd] elapsed={elapsed}", flush=True)
                if elapsed >= stall_timeout:
                    print("  [wd] STALLED!", flush=True)
                    warned = True
                elif warned:
                    print("  [wd] RECOVERED!", flush=True)
                    warned = False
            print("  [wd] run_task done, exiting loop", flush=True)
        except asyncio.CancelledError:
            print("  [wd] cancelled", flush=True)

    watchdog_task = asyncio.create_task(_watchdog())
    try:
        print("  [main] awaiting run_task", flush=True)
        await run_task
        print("  [main] run_task done", flush=True)
    finally:
        print("  [main] in finally, cancelling watchdog", flush=True)
        watchdog_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await watchdog_task
        print("  [main] watchdog cancelled and awaited", flush=True)


async def main():
    print("START", flush=True)
    try:
        await asyncio.wait_for(watchdog_impl(), timeout=5)
    except TimeoutError:
        print("TIMEOUT!", flush=True)
    print("DONE", flush=True)

asyncio.run(main())
