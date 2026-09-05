import { ringFigures } from './agents.js';

/**
 * REQ-MONITOR-052/065/069/087: one agent's context window as a ring — used against the limit, the compression
 * threshold marked as a tick on the track, the fill in the warning colour from 75 % of the threshold and the
 * failure colour at or above it; the percent as text beside it (REQ-SHELL-149). Tokens by name: the state
 * colours are the design's three-axis tokens, the geometry the component's own.
 */
export function ContextRing({ used, limit, thresholdPercent, size = 64, label }: { used: number; limit: number; thresholdPercent: number; size?: number; label: string }) {
  const f = ringFigures(used, limit, thresholdPercent);
  const r = 26;
  const c = 2 * Math.PI * r;
  const fill = (Math.min(100, f.percent) / 100) * c;
  const tickAngle = (f.threshold / 100) * 360 - 90;
  const rad = (tickAngle * Math.PI) / 180;
  const tick = { x1: 32 + Math.cos(rad) * (r - 5), y1: 32 + Math.sin(rad) * (r - 5), x2: 32 + Math.cos(rad) * (r + 5), y2: 32 + Math.sin(rad) * (r + 5) };
  return (
    <div className={`ctx-ring ctx-ring--${f.band}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.percent} aria-valuetext={`${f.percent} % of ${limit.toLocaleString()} used; compression at ${f.threshold} %`} data-percent={f.percent} data-threshold={f.threshold} data-band={f.band} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle className="ctx-ring__track" cx="32" cy="32" r={r} />
        <circle className="ctx-ring__fill" cx="32" cy="32" r={r} strokeDasharray={`${fill} ${c - fill}`} transform="rotate(-90 32 32)" />
        <line className="ctx-ring__tick" x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
      </svg>
      <span className="ctx-ring__value mono">{f.percent}%</span>
    </div>
  );
}
