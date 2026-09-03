import { instant, millis, type Clocks, type Instant, type Millis, type MonotonicClock, type Timers, type TimerHandle, type WallClock } from '@rotaris/kernel';

/**
 * The production adapters for ADR-0006's ports. This is the one module in
 * engine-reachable code that touches the platform clock; everything else
 * reads through the ports.
 */
class NodeMonotonic implements MonotonicClock {
  now(): Millis {
    return millis(performance.now());
  }
}
class NodeWall implements WallClock {
  instant(): Instant {
    return instant(Date.now());
  }
}
class NodeTimers implements Timers {
  after(delay: Millis, fn: () => void): TimerHandle {
    const h = setTimeout(fn, delay);
    return { cancel: () => clearTimeout(h) };
  }
  every(period: Millis, fn: () => void): TimerHandle {
    const h = setInterval(fn, period);
    return { cancel: () => clearInterval(h) };
  }
}

export function nodeClocks(): Clocks {
  return { monotonic: new NodeMonotonic(), wall: new NodeWall(), timers: new NodeTimers() };
}
