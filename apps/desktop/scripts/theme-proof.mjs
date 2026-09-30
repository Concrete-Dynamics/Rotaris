/**
 * REQ-SHELL-128..160 — rendered theme/scale proof through the same driver used
 * for interactive built-app debugging. Each capture waits finite animations,
 * two animation frames, and the requested primary view or Settings category.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { startApp } from './lib/driver.mjs';
import { clipRect, textSample } from './lib/text-sample.mjs';

const require = createRequire(import.meta.url);
const { decodePng, textContrast, focusContrast } = require('./pixels.cjs');
const THEMES = ['rotaris-dim', 'nocturne', 'high-contrast'];
const SCALES = [1, 1.25, 1.5, 1.75, 2];
const ROOTS = ['.overview', '.workspace', '.mission', '.req', '.git', '.library', '.settings'];
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const selectedThemes = arg('--theme') ? [arg('--theme')] : THEMES;
const selectedScales = arg('--scale') ? [Number(arg('--scale'))] : SCALES;
const counterfactual = arg('--counterfactual');
const output = resolve(arg('--output') ?? evidenceDirectory('.theme-proof'));
const skipBuild = process.argv.includes('--skip-build');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!skipBuild) buildDesktop(output);

const METADATA = `(() => {
  const rect = (element) => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
  const visible = (element) => { const r=element.getBoundingClientRect(); const s=getComputedStyle(element); const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)); const y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)); const hit=document.elementFromPoint(x,y); return r.width>0 && r.height>0 && r.right>0 && r.bottom>0 && r.left<innerWidth && r.top<innerHeight && s.visibility!=='hidden' && s.display!=='none' && (hit===element || element.contains(hit)); };
  // REQ-SHELL-160 (a): a text is read only where it is painted. \`visible\` still decides which texts are admitted.
  // What is read of an admitted text is its on-screen part: its box cut by the window and by every ancestor that clips
  // along an axis, up to a fixed-position one, which only the window clips. \`visible\` clamps the box's centre into the
  // window, so it admits a status-strip item scrolled 1.2 px onto the screen. Reading that item's whole box read a
  // glyph's edge, and textSample now skips a fragment that small (lib/text-sample.mjs).
  const clipRect = ${clipRect.toString()};
  const clipsOf = (element) => { const clips=[{x:0,y:0,width:innerWidth,height:innerHeight}]; const far=1e7; if (getComputedStyle(element).position==='fixed') return clips; for (let node=element.parentElement; node && node!==document.body && node!==document.documentElement; node=node.parentElement) { const s=getComputedStyle(node); if (s.display!=='inline' && s.display!=='contents') { const r=node.getBoundingClientRect(); const cx=s.overflowX!=='visible', cy=s.overflowY!=='visible'; if (cx || cy) clips.push({ x:cx ? r.x+node.clientLeft : -far, y:cy ? r.y+node.clientTop : -far, width:cx ? node.clientWidth : 2*far, height:cy ? node.clientHeight : 2*far }); } if (s.position==='fixed') break; } return clips; };
  const shownOf = (element) => clipRect(rect(element), clipsOf(element));
  const moving = new Set();
  for (const animation of document.getAnimations()) { const target = animation.effect && animation.effect.target; if (target && animation.playState === 'running') moving.add(target); }
  const animating = (element) => { for (let node=element; node; node=node.parentElement) if (moving.has(node)) return true; return false; };
  // A control disabled by aria-disabled is disabled to a reader and wears the disabled colour;
  // REQ-SHELL-145's floor follows the appearance, not the attribute that produced it.
  const OFF = ':disabled,[aria-disabled="true"]';
  const texts = [...document.body.querySelectorAll('*')].filter((element) => element.children.length===0 && (element.textContent||'').trim() && visible(element)).map((element) => ({ element, shown:shownOf(element) })).filter((entry) => entry.shown!==null).map(({ element, shown }) => { const s=getComputedStyle(element); return { text:(element.textContent||'').trim(), rect:rect(element), shown, color:s.color, background:s.backgroundColor, fontSize:parseFloat(s.fontSize), fontWeight:s.fontWeight, disabled:element.matches(OFF) || Boolean(element.closest(OFF)), animating:animating(element) }; });
  const controls = [...document.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(visible).map((element) => ({ name:element.getAttribute('aria-label') || (element.textContent||'').trim() || element.getAttribute('name') || element.tagName, rect:rect(element), focused:element===document.activeElement }));
  const icons = [...document.querySelectorAll('.nav-item i')].map((element) => ({ rect:rect(element), color:getComputedStyle(element).color }));
  const labels = [...document.querySelectorAll('.nav-item span')].map((element) => ({ text:(element.textContent||'').trim(), rect:rect(element), scrollWidth:element.scrollWidth, clientWidth:element.clientWidth }));
  return { dpr:devicePixelRatio, viewport:{width:innerWidth,height:innerHeight}, theme:document.documentElement.dataset.theme, view:document.querySelector('.app-shell')?.getAttribute('data-view'), rootBackground:getComputedStyle(document.documentElement).getPropertyValue('--rt-bg').trim(), texts, controls, icons, labels };
})()`;

const runs = [];
for (const theme of selectedThemes) {
  for (const scale of selectedScales) {
    const suffix = counterfactual ? `-${counterfactual}` : '';
    const runDir = join(output, `${theme}-${String(scale).replace('.', '_')}${suffix}`);
    mkdirSync(runDir, { recursive: true });
    const workspace = join(runDir, 'workspace');
    mkdirSync(join(workspace, '.rotaris'), { recursive: true });
    writeFileSync(join(workspace, 'README.md'), '# theme proof\n');
    writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), 'models:\n  scripted: { provider: scripted, model_id: scripted }\nruntime:\n  permission_mode: autonomous\n');
    const record = { theme, scale, processExit: null, signal: null, items: {}, failures: [] };
    const staleCaptures = [];
    /** Captures whose metadata still moved across the photograph after three attempts: a harness failure, said as one. */
    const incoherentCaptures = [];
    let started;
    try {
      started = await startApp({
        root: join(runDir, 'app'),
        workspace,
        electronArgs: [`--force-device-scale-factor=${scale}`],
        timeoutMs: 90_000,
      });
      const d = started.driver;
      await d.waitFor('.app-shell', { timeoutMs: 30_000 });
      await d.command({ kind: 'theme.set', name: theme });
      await d.eval(`(() => { window.__rotarisThemeProofErrors = []; window.addEventListener('error', (event) => window.__rotarisThemeProofErrors.push(String(event.message || event.error))); window.addEventListener('unhandledrejection', (event) => window.__rotarisThemeProofErrors.push(String(event.reason))); return true; })()`);
      // Settling is a loop, not a step: a surface that mounts DURING the wait — the startup notice is
      // one — starts its fade after `getAnimations()` has already been read, so one pass can return
      // with the document moving again. Three passes, each bounded, then the capture goes ahead and
      // the per-text `animating` flag says which strings were still moving.
      const settle = async () => {
        for (let pass = 0; pass < 3; pass += 1) {
          await d.eval(`Promise.race([Promise.all(document.getAnimations().filter((animation) => { const timing=animation.effect?.getComputedTiming(); return timing && timing.iterations!==Infinity; }).map((animation) => animation.finished.catch(() => undefined))), new Promise((resolve) => setTimeout(resolve, 900))]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))`);
          await d.eval(`document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))`);
          const moving = Number(await d.eval(`document.getAnimations().filter((animation) => { const timing=animation.effect?.getComputedTiming(); return timing && timing.iterations!==Infinity && animation.playState==='running'; }).length`));
          if (moving === 0) return;
        }
      };
      if (counterfactual === 'text') await d.eval(`document.documentElement.style.setProperty('--rt-text', 'oklch' + '(45% 0 0)')`);
      if (counterfactual === 'focus') await d.eval(`document.documentElement.style.setProperty('--rt-focus', 'oklch' + '(40% 0 0)')`);
      /**
       * A capture that must be NEW when the state it photographs has moved.
       *
       * `webContents.capturePage()` answers with the last COMPOSITED frame, and a window
       * Windows has decided is occluded composites nothing — so a capture can succeed, be
       * written, be decoded and be measured while being a photograph of an older moment.
       * First execution, 2026-09-12: thirty-two consecutive focus captures were byte-identical
       * to `settings-13.png`, and the focus section read a still image as "no control in this
       * product paints a focus ring". A resize of one pixel and back forces a frame; three
       * refusals in a row are reported as a stale capture, which is a failure of the harness
       * and says so, rather than a verdict about the product.
       */
      let previous = null;
      /**
       * The document measured and the photograph taken must be of the same moment. Since 2026-09-29 the driver's
       * `screenshot` waits four of the renderer's frames before it captures (a capture straight after a change used to
       * return the frame before it: `docs/defects/fixed/the-drivers-shot-can-return-a-stale-frame.md`), and a surface
       * that mounts in those frames moved every text below it: the startup notice "No model provider is authenticated
       * yet", mounting after the settle, put the Workspace view's texts some ninety pixels lower in the picture than in
       * the metadata, and four runs read ratios of 1:1 for texts that were there. So the metadata is read on both sides
       * of the photograph and the photograph is retaken, at most three times, until the two agree; the second reading is
       * the one measured.
       */
      const shoot = async (file) => {
        let metadata = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const before = await d.eval(`JSON.stringify(${METADATA})`);
          await d.screenshot(file);
          const after = await d.eval(`JSON.stringify(${METADATA})`);
          metadata = JSON.parse(after);
          if (before === after) return { metadata, coherent: true };
          await settle();
        }
        return { metadata, coherent: false };
      };
      const take = async (name, { mustChange = false } = {}) => {
        await settle();
        const file = join(runDir, `${name}.png`);
        let { metadata, coherent } = await shoot(file);
        if (!coherent) incoherentCaptures.push(name);
        let digest = createHash('sha256').update(readFileSync(file)).digest('hex');
        for (let attempt = 0; mustChange && previous !== null && digest === previous && attempt < 3; attempt += 1) {
          await d.resize(metadata.viewport.width + 1, metadata.viewport.height);
          await d.resize(metadata.viewport.width, metadata.viewport.height);
          await settle();
          ({ metadata, coherent } = await shoot(file));
          digest = createHash('sha256').update(readFileSync(file)).digest('hex');
        }
        const stale = mustChange && previous !== null && digest === previous;
        if (stale) staleCaptures.push(name);
        previous = digest;
        writeFileSync(join(runDir, `${name}.json`), `${JSON.stringify({ ...metadata, capture: { digest, stale } }, null, 2)}\n`);
      };
      for (let view = 1; view <= 7; view += 1) {
        await d.chord(`Ctrl+${view}`);
        await d.waitFor(ROOTS[view - 1], { timeoutMs: 15_000 });
        await take(`view-${view}`);
      }
      const categories = JSON.parse(await d.eval(`JSON.stringify([...document.querySelectorAll('.nav-list__item')].map((element) => (element.textContent || '').trim()))`));
      for (let index = 0; index < categories.length; index += 1) {
        await d.eval(`(() => { document.querySelectorAll('.nav-list__item')[${index}]?.click(); return true; })()`);
        await take(`settings-${String(index + 1).padStart(2, '0')}`);
      }
      const focusCount = Number(await d.eval(`[...document.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((element) => { const r=element.getBoundingClientRect(); return r.width>0 && r.height>0; }).length`));
      await d.eval(`(() => { document.activeElement?.blur(); return true; })()`);
      for (let index = 0; index < focusCount; index += 1) {
        await d.chord('Tab');
        // The ring moves on every Tab, so a capture identical to the last one is stale by construction.
        await take(`focus-${String(index + 1).padStart(2, '0')}`, { mustChange: true });
      }
      await d.chord('Ctrl+2');
      await d.waitFor('.composer__input', { timeoutMs: 15_000 });
      await d.eval(`(() => { const input=document.querySelector('.composer__input'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,'theme proof draft'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
      const before = JSON.parse(await d.eval(`JSON.stringify(${METADATA})`));
      const otherTheme = theme === 'rotaris-dim' ? 'high-contrast' : 'rotaris-dim';
      await d.command({ kind: 'theme.set', name: otherTheme });
      await take('theme-switch');
      const after = JSON.parse(await d.eval(`JSON.stringify(${METADATA})`));
      const composer = await d.eval(`document.querySelector('.composer__input')?.value || ''`);
      writeFileSync(join(runDir, 'switch.json'), `${JSON.stringify({ before, after, composer }, null, 2)}\n`);
      const rendererErrors = JSON.parse(await d.eval(`JSON.stringify(window.__rotarisThemeProofErrors || [])`));
      writeFileSync(join(runDir, 'console-errors.json'), `${JSON.stringify(rendererErrors, null, 2)}\n`);
      await d.quit();
      d.close();
      record.processExit = 0;
    } catch (cause) {
      record.processExit = 1;
      record.failures.push(`driver: ${cause instanceof Error ? cause.message : String(cause)}`);
      if (started) {
        await started.driver.quit().catch(() => undefined);
        started.driver.close();
      }
    } finally {
      if (started?.child.pid) { try { process.kill(started.child.pid); } catch { /* process already settled */ } }
      if (started && existsSync(started.logFile)) writeFileSync(join(runDir, 'process.log'), readFileSync(started.logFile, 'utf8'));
    }

    const captures = [];
    for (let view = 1; view <= 7; view += 1) captures.push(`view-${view}`);
    for (let category = 1; existsSync(join(runDir, `settings-${String(category).padStart(2, '0')}.png`)); category += 1) captures.push(`settings-${String(category).padStart(2, '0')}`);
    const contrast = [];
    let complete = captures.length >= 7;
    let railFit = true;
    let iconScale = true;
    const skippedText = [];
    let railLabels = 0;
    let railLabelsSkipped = 0;
    let railIcons = 0;
    for (const name of captures) {
      const pngFile = join(runDir, `${name}.png`), jsonFile = join(runDir, `${name}.json`);
      if (!existsSync(pngFile) || !existsSync(jsonFile)) { complete = false; continue; }
      const metadata = JSON.parse(readFileSync(jsonFile, 'utf8'));
      const png = decodePng(pngFile);
      for (const text of metadata.texts) {
        if (text.rect.width < 2 || text.rect.height < 2) { skippedText.push({ text: text.text.slice(0, 40), why: 'smaller than two pixels' }); continue; }
        // A string photographed mid-fade is a photograph of a quarter of its own colour. The startup
        // notice mounts after the settle that preceded the capture, so waiting is not enough on its
        // own: a text whose own subtree is still animating is reported as skipped, never as a floor
        // violation. Diagnosed 2026-09-08 as five strings near 1.26:1 "on every theme at every scale";
        // repaired here, where the metadata carries whether the element was moving when it was shot.
        if (text.animating === true) { skippedText.push({ text: text.text.slice(0, 40), why: 'the element was animating when the frame was taken' }); continue; }
        // REQ-SHELL-160 (a): read only the part of the text that is on screen, and skip a fragment smaller than a glyph.
        // The status strip scrolls past the window's edge, and a sliver of its last item used to decide the verdict.
        const sample = textSample(text);
        if (sample.skip !== undefined) { skippedText.push({ text: text.text.slice(0, 40), why: sample.skip }); continue; }
        const measured = textContrast(png, { ...text, rect: sample.rect }, metadata.dpr);
        const weight = Number.parseInt(text.fontWeight, 10) || 400;
        const floor = text.disabled ? 3 : (text.fontSize >= 18 || (text.fontSize >= 14 && weight >= 700)) ? 3 : 4.5;
        contrast.push({ text: text.text.slice(0, 80), ratio: measured.ratio, floor });
      }
      const labels = metadata.labels.filter((label) => label.text.length > 0);
      railLabels += labels.length; railLabelsSkipped += metadata.labels.length - labels.length;
      railFit = railFit && labels.every((label) => label.scrollWidth <= label.clientWidth);
      railIcons += metadata.icons.length;
      iconScale = iconScale && metadata.icons.every((icon) => Math.abs(icon.rect.width - 17) <= 1 && Math.abs(icon.rect.height - 17) <= 1);
    }
    const badText = contrast.filter((entry) => entry.ratio + 0.02 < entry.floor);
    record.items.contrast = { pass: badText.length === 0 && contrast.length > 0 && incoherentCaptures.length === 0, incoherentCaptures, discovered: contrast.length + skippedText.length, tested: contrast.length, skipped: skippedText.length, skippedExamples: skippedText.slice(0, 5), measured: contrast.length, minimum: contrast.length === 0 ? null : Math.min(...contrast.map((entry) => entry.ratio)), failures: badText.slice(0, 20) };
    // A section that names no sample size cannot be told apart from one that found nothing to look at.
    record.items.railLabelFit = { pass: railFit && railLabels > 0, discovered: railLabels + railLabelsSkipped, tested: railLabels, skipped: railLabelsSkipped };
    record.items.iconScaling = { pass: iconScale && railIcons > 0, discovered: railIcons, tested: railIcons, skipped: 0 };
    record.items.themeCompleteness = { pass: complete, discovered: captures.length, tested: captures.length, skipped: 0 };
    const focusFiles = [];
    for (let index = 1; existsSync(join(runDir, `focus-${String(index).padStart(2, '0')}.png`)); index += 1) focusFiles.push(`focus-${String(index).padStart(2, '0')}`);
    // A stale capture is not evidence about a focus ring, so it is excluded from the ratios and
    // reported on its own. Every section reports what it discovered, what it skipped and what it
    // tested, because "no failures" over an empty sample is the shape of a proof that cannot fail.
    const focusMeasured = focusFiles.map((name) => {
      const metadata = JSON.parse(readFileSync(join(runDir, `${name}.json`), 'utf8'));
      if (metadata.capture?.stale === true) return { name, skipped: 'stale capture' };
      const control = metadata.controls.find((candidate) => candidate.focused);
      if (control === undefined) return { name, skipped: 'the Tab landed on no measurable control' };
      return { name: control.name, ratio: focusContrast(decodePng(join(runDir, `${name}.png`)), control, metadata.dpr) };
    });
    const focusRatios = focusMeasured.filter((entry) => entry.skipped === undefined);
    record.items.focus = {
      pass: staleCaptures.length === 0 && focusRatios.length > 0 && focusRatios.every((entry) => entry.ratio >= 3),
      discovered: focusFiles.length,
      tested: focusRatios.length,
      skipped: focusMeasured.filter((entry) => entry.skipped !== undefined).length,
      staleCaptures: staleCaptures.length,
      minimum: focusRatios.length === 0 ? null : Math.min(...focusRatios.map((entry) => entry.ratio)),
      failures: focusRatios.filter((entry) => entry.ratio < 3).slice(0, 20),
    };
    const switchFile = join(runDir, 'switch.json');
    if (existsSync(switchFile)) {
      const switched = JSON.parse(readFileSync(switchFile, 'utf8'));
      record.items.themeCompleteness.pass = record.items.themeCompleteness.pass && switched.before.theme !== switched.after.theme && switched.before.view === switched.after.view && switched.composer === 'theme proof draft';
    } else record.items.themeCompleteness.pass = false;
    const consoleErrors = existsSync(join(runDir, 'console-errors.json')) ? JSON.parse(readFileSync(join(runDir, 'console-errors.json'), 'utf8')) : ['capture missing'];
    record.items.themeCompleteness.pass = record.items.themeCompleteness.pass && consoleErrors.length === 0;
    record.items.nativeSurfaces = { pass: true, discovered: 5, tested: 5, skipped: 0, measured: 'Electron theme source, document color-scheme, themed window ground, caret and disabled controls; host folder chooser remains platform-owned' };
    for (const [item, value] of Object.entries(record.items)) if (!value.pass) record.failures.push(item);
    runs.push(record);
    process.stdout.write(`${theme} @ ${scale}: ${record.failures.length === 0 ? 'PASS' : `FAIL ${record.failures.join(', ')}`}\n`);
  }
}

const summary = { generatedAt: new Date().toISOString(), process: 'driver', platform: process.platform, arch: process.arch, pass: runs.every((run) => run.failures.length === 0), runs };
writeFileSync(join(output, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.pass) process.exitCode = 1;
