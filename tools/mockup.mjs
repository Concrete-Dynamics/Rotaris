/**
 * Serves `docs/design/mockup/rotaris-ui-mockup.dc.html` so the adopted design language can be LOOKED at.
 *
 * The mockup is a Claude Design export: its `<sc-if>` conditionals and `sc-camel-on-click` handlers want a
 * runtime that is not in this repository, so opened straight from disk it stacks every modal on top of every
 * screen and draws the Phosphor glyphs as tofu. None of that is a defect of the file — the markup, the tokens
 * and the component CSS are all inline and correct. This server supplies the three things the runtime would:
 * the icon font's own stylesheet from `@phosphor-icons/web`, the two variable text faces from
 * `docs/design/assets`, and a picker that shows one screen at a time. Nothing is written back; the file on
 * disk is the record and stays untouched.
 *
 * `pnpm mockup`, then http://localhost:8791. `docs/design/README.md` §7 is the obligation this serves.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Platform paths, as tools/check-directive-register.mjs builds its root. Until 2026-10-02 both were
 * `new URL(…).pathname.replace(/^\//, '')`: the strip made a Windows path usable (`/D:/…` → `D:/…`) and made a
 * Linux or macOS one relative (`/home/…` → `home/…`), so started from the repository every request answered
 * `not found: /` (docs/defects/fixed/pnpm-mockup-serves-not-found-on-linux-unless-started-from-the-root.md). */
export const design = fileURLToPath(new URL('../docs/design/', import.meta.url));
export const icons = fileURLToPath(new URL('../node_modules/@phosphor-icons/web/src/', import.meta.url));
const port = Number(process.env.MOCKUP_PORT ?? 8791);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json' };

/* The design system declares its faces against names this repository does not carry (packages/ui/src/fonts.css
 * says why); re-point them at the hashed binaries, exactly as the renderer does. */
const shim = `
<link rel="stylesheet" href="/icons/regular/style.css">
<link rel="stylesheet" href="/icons/fill/style.css">
<style>
@font-face { font-family: 'Space Grotesk'; src: url('/assets/18c029f5.woff2') format('woff2-variations'); font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'JetBrains Mono'; src: url('/assets/d961a407.woff2') format('woff2-variations'); font-weight: 100 800; font-display: swap; }
sc-if, x-dc, helmet > *:not(style) { display: contents; }
helmet { display: none; }
#mockup-picker { position: fixed; z-index: 999; inset: auto 0 0 0; display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 10px;
  background: var(--rt-chrome); border-top: 1px solid var(--rt-border); font: 11px/1 'JetBrains Mono', monospace; }
#mockup-picker button { color: var(--rt-text-tertiary); background: var(--rt-surface); border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm); padding: 5px 9px; cursor: pointer; font: inherit; }
#mockup-picker button[aria-pressed='true'] { color: var(--rt-text); background: var(--rt-accent-tint-14); border-color: var(--rt-accent-800); }
#mockup-picker .sep { width: 1px; align-self: stretch; background: var(--rt-border); margin: 0 4px; }
body { margin: 0; padding-bottom: 46px; box-sizing: border-box; overflow: hidden; }
</style>
<script>
window.addEventListener('DOMContentLoaded', () => {
  // Every screen and every modal carries data-screen-label. Without the export's runtime they are all "on"
  // at once, so the picker is the missing switch, not a re-authoring of the design. The overview strip is a
  // band under whichever screen is showing (REQ-SHELL's Overview strip), so it toggles independently.
  const panels = [...document.querySelectorAll('[data-screen-label]')];
  // Each panel declares its own inline display (the Workspace main is display:flex, the strip is display:grid).
  // Clearing style.display would delete that declaration and collapse the layout, so keep it and put it back.
  for (const panel of panels) panel.dataset.mockupDisplay = panel.style.display;
  const strip = panels.find((p) => p.dataset.screenLabel === 'Overview strip');
  const screens = panels.filter((p) => p !== strip);
  const bar = document.createElement('div');
  bar.id = 'mockup-picker';
  let shown = 'Workspace';
  const paint = () => {
    for (const panel of screens) panel.style.display = panel.dataset.screenLabel === shown ? panel.dataset.mockupDisplay : 'none';
    // Some screens (Settings, Requirements) are themselves wrapped in an <sc-if>. The hint below would hide the
    // screen the picker was just asked for, so a screen's OWN gate is opened; the gates inside it keep theirs.
    for (let node = screens.find((p) => p.dataset.screenLabel === shown)?.parentElement; node; node = node.parentElement) {
      if (node.tagName === 'SC-IF') node.style.display = 'contents';
    }
    for (const button of bar.children) if (button.dataset.label) button.setAttribute('aria-pressed', String(button.dataset.label === shown));
    location.hash = encodeURIComponent(shown);
  };
  for (const panel of screens) {
    const button = document.createElement('button');
    button.textContent = button.dataset.label = panel.dataset.screenLabel;
    button.onclick = () => { shown = button.dataset.label; paint(); };
    bar.append(button);
  }
  if (strip) {
    bar.append(Object.assign(document.createElement('span'), { className: 'sep' }));
    strip.style.display = 'none';
    const toggle = document.createElement('button');
    toggle.textContent = 'Overview strip';
    toggle.onclick = () => { strip.style.display = strip.style.display === 'none' ? strip.dataset.mockupDisplay : 'none'; toggle.setAttribute('aria-pressed', String(strip.style.display !== 'none')); };
    bar.append(toggle);
  }
  // <sc-if> carries the state the runtime would have started in as hint-placeholder-val; honour it, so the
  // slash popover and the collapsed tool call are closed and the approval card is open, as designed. Clicking
  // the block toggles it. The remaining {{ ... }} are unbound expressions and are simply not drawn.
  for (const conditional of document.querySelectorAll('sc-if')) {
    const open = /true/.test(conditional.getAttribute('hint-placeholder-val') ?? '');
    conditional.style.display = open ? 'contents' : 'none';
    conditional.dataset.mockupIf = conditional.getAttribute('value') ?? '';
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue.includes('{{')) node.nodeValue = node.nodeValue.replace(/\\{\\{[^}]*\\}\\}/g, '').trim();

  bar.append(Object.assign(document.createElement('span'), { className: 'sep' }));
  const conditionals = document.createElement('button');
  let expanded = false;
  conditionals.textContent = 'sc-if blocks';
  conditionals.onclick = () => {
    expanded = !expanded;
    for (const c of document.querySelectorAll('sc-if')) c.style.display = expanded || /true/.test(c.getAttribute('hint-placeholder-val') ?? '') ? 'contents' : 'none';
    conditionals.setAttribute('aria-pressed', String(expanded));
    paint();
  };
  bar.append(conditionals);

  document.body.append(bar);
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (screens.some((p) => p.dataset.screenLabel === wanted)) shown = wanted;
  paint();

  // The export is a fixed 1680x1000 device frame with overflow:hidden. Scale it to the window rather than
  // letting the window crop it — a cropped frame is exactly the wrong thing to read composition from.
  const frame = document.querySelector('x-dc > div[style*="1680px"]');
  if (frame) {
    const fit = () => {
      const scale = Math.min(1, (innerWidth - 8) / 1680, (innerHeight - 54) / 1000);
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(' + scale + ')';
    };
    addEventListener('resize', fit);
    fit();
  }
});
</script>
`;

/**
 * The request handler: a path under the icon font's root or the design folder, never outside either. The guard compares
 * the joined path against the root WITH its trailing separator, so `/../package.json` (or a sibling folder sharing the
 * root's prefix) is refused rather than read.
 */
export function handle(request, response) {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const iconRequest = requested.startsWith('/icons/');
  const root = iconRequest ? icons : design;
  const relative = iconRequest ? requested.slice('/icons/'.length) : requested === '/' ? 'mockup/rotaris-ui-mockup.dc.html' : requested.slice(1);
  const path = join(root, normalize(relative));
  const base = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!path.startsWith(base)) { response.writeHead(403).end(); return; }
  readFile(path)
    .then((body) => {
      response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(extname(path) === '.html' ? String(body).replace('</head>', `${shim}</head>`) : body);
    })
    .catch(() => { response.writeHead(404).end(`not found: ${requested}`); });
}

/** Listens on `port` (0 for any free one) and resolves with the server once it is listening. */
export function serve(listenOn = port) {
  return new Promise((done) => {
    const server = createServer(handle);
    server.listen(listenOn, () => done(server));
  });
}

const runDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (runDirectly) {
  void serve().then(() => { console.log(`The design mockup is at http://localhost:${port} — read it for craft, never for structure (docs/design/README.md §2).`); });
}
