import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every package this package's source imports is one its own `package.json` declares. The workspace installs one flat,
 * hoisted `node_modules` (ADR-0056), so an undeclared import resolves through another package's declaration and fails
 * only when that one narrows or the linker changes: `zod`, imported by the gate and every tool, and `@rotaris/config`,
 * imported by the search tool, were both undeclared until 2026-10-06
 * (docs/defects/fixed/agent-tools-imports-zod-without-declaring-it.md). Tests are left out: they run from the root's
 * development dependencies (`vitest`).
 */
// `fileURLToPath`, not the URL's `pathname`: on Windows that is `/C:/…`, which `readdirSync` read as `C:\C:\…`
// (`docs/defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
const SRC = fileURLToPath(new URL('.', import.meta.url));
const MANIFEST = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [path] : [];
  });
}

function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('node:') || builtinModules.includes(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

describe('the @rotaris/agent-tools manifest (ADR-0056)', () => {
  it('declares every package the source imports', () => {
    const imported = new Map<string, string>();
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g)) {
        const name = packageOf(m[1] ?? m[2]!);
        if (name !== null && !imported.has(name)) imported.set(name, file.slice(SRC.length));
      }
    }
    expect(imported.has('zod')).toBe(true);
    const declared = new Set(Object.keys(MANIFEST.dependencies ?? {}));
    const undeclared = [...imported].filter(([name]) => !declared.has(name)).map(([name, file]) => `${name} (first imported by ${file})`);
    expect(undeclared).toEqual([]);
  });
});
