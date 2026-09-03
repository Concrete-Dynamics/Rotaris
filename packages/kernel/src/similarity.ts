/**
 * REQ-TOOLS-188: ONE similarity function serves every threshold in the tools domain —
 * similarity(a, b) = 1 − editDistance(a, b) / max(|a|, |b|), unit-cost insert/delete/substitute over
 * Unicode code points, |·| in code points, two empty strings similar at 1. Symmetric, in [0, 1].
 * The 0.85 fuzzy-edit threshold (REQ-TOOLS-136) and the 0.45 filename cutoff (REQ-TOOLS-134) read
 * this and nothing else.
 */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = new Array<number>(y.length + 1);
  let cur = new Array<number>(y.length + 1);
  for (let j = 0; j <= y.length; j += 1) prev[j] = j;
  for (let i = 1; i <= x.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[y.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  const la = Array.from(a).length;
  const lb = Array.from(b).length;
  const max = Math.max(la, lb);
  if (max === 0) return 1;
  return 1 - editDistance(a, b) / max;
}
