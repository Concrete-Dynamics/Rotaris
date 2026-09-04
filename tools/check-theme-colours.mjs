import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const roots = ['packages', 'apps'];
const sourceExtensions = new Set(['.ts', '.tsx', '.css', '.js', '.mjs', '.cjs']);
const literal = /oklch\(\s*[\d.]|#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]/;
const violations = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'out', 'release'].includes(entry.name) && relative('.', path).replaceAll('\\', '/') !== 'packages/contracts/src/theme') walk(path);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) continue;
    const rows = readFileSync(path, 'utf8').split(/\r?\n/);
    rows.forEach((row, index) => { if (literal.test(row)) violations.push(`${relative('.', path)}:${index + 1}`); });
  }
}

for (const root of roots) walk(root);
if (violations.length > 0) {
  console.error(`Literal colours belong in theme data:\n${violations.join('\n')}`);
  process.exitCode = 1;
}
