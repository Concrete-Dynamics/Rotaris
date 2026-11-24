// Renders the money-slider mock (`money-slider.mock.html`) to the PNGs beside it, in the product's own look.
//
// The mock links the product's real stylesheets (docs/design/system, packages/ui/src/shell.css, the Phosphor icon
// font) and one token sheet this script projects from `packages/contracts/src/theme/themes.ts` into
// `.ui-review/money-slider/tokens.css` (git-ignored), so no colour or length in the mock is a copy. Design only: nothing
// here is product code (PD-ORCH-019, R-127).
//
//   node docs/design/briefs/composer/render-money-slider.mjs [scene …]
//
// Needs Node 24 (type stripping) and google-chrome on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const { resolveTheme, themeCustomProperties } = await import(pathToFileURL(join(repo, 'packages/contracts/src/theme/themes.ts')).href);

const out = join(repo, '.ui-review/money-slider');
mkdirSync(out, { recursive: true });
const theme = resolveTheme('rotaris-dim');
const declarations = Object.entries(themeCustomProperties(theme)).map(([name, value]) => `  ${name}: ${value};`).join('\n');
writeFileSync(join(out, 'tokens.css'), `/* Projected from themes.ts (${theme.name}) by render-money-slider.mjs. */\n:root {\n${declarations}\n  color-scheme: dark;\n}\n`);

/** Scene → window size. The composer scenes are the Workspace's centre column; 1000×680 is the minimum window. */
const SCENES = {
  'regular-idle': [960, 820],
  'token-burner-mixed': [960, 820],
  'money-saver-live': [700, 680],
  'all-set': [960, 820],
  'pointed-small-budget': [960, 820],
  chips: [960, 560],
  settings: [1040, 620],
};
const wanted = process.argv.slice(2);
const page = pathToFileURL(join(here, 'money-slider.mock.html')).href;
for (const [scene, [width, height]] of Object.entries(SCENES)) {
  if (wanted.length > 0 && !wanted.includes(scene)) continue;
  const png = join(here, `money-slider-${scene}.png`);
  execFileSync('google-chrome', [
    '--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    '--virtual-time-budget=1500', `--window-size=${width},${height}`, `--screenshot=${png}`, `${page}?scene=${scene}`,
  ], { stdio: 'ignore' });
  console.log(png);
}
