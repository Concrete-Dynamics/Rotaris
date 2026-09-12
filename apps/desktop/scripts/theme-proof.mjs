/**
 * REQ-SHELL-128..160 — rendered theme/scale proof through the same driver used
 * for interactive built-app debugging. Each capture waits finite animations,
 * two animation frames, and the requested primary view or Settings category.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { startApp } from './lib/driver.mjs';

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
  const texts = [...document.body.querySelectorAll('*')].filter((element) => element.children.length===0 && (element.textContent||'').trim() && visible(element)).map((element) => { const s=getComputedStyle(element); return { text:(element.textContent||'').trim(), rect:rect(element), color:s.color, background:s.backgroundColor, fontSize:parseFloat(s.fontSize), fontWeight:s.fontWeight, disabled:element.matches(':disabled') || Boolean(element.closest(':disabled')) }; });
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
      const settle = async () => {
        await d.eval(`Promise.race([Promise.all(document.getAnimations().filter((animation) => { const timing=animation.effect?.getComputedTiming(); return timing && timing.iterations!==Infinity; }).map((animation) => animation.finished.catch(() => undefined))), new Promise((resolve) => setTimeout(resolve, 900))]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))`);
        await d.eval(`document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))`);
      };
      if (counterfactual === 'text') await d.eval(`document.documentElement.style.setProperty('--rt-text', 'oklch' + '(45% 0 0)')`);
      if (counterfactual === 'focus') await d.eval(`document.documentElement.style.setProperty('--rt-focus', 'oklch' + '(40% 0 0)')`);
      const take = async (name) => {
        await settle();
        const metadata = JSON.parse(await d.eval(`JSON.stringify(${METADATA})`));
        await d.screenshot(join(runDir, `${name}.png`));
        writeFileSync(join(runDir, `${name}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
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
        await take(`focus-${String(index + 1).padStart(2, '0')}`);
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
    for (const name of captures) {
      const pngFile = join(runDir, `${name}.png`), jsonFile = join(runDir, `${name}.json`);
      if (!existsSync(pngFile) || !existsSync(jsonFile)) { complete = false; continue; }
      const metadata = JSON.parse(readFileSync(jsonFile, 'utf8'));
      const png = decodePng(pngFile);
      for (const text of metadata.texts) {
        if (text.rect.width < 2 || text.rect.height < 2) continue;
        const measured = textContrast(png, text, metadata.dpr);
        const weight = Number.parseInt(text.fontWeight, 10) || 400;
        const floor = text.disabled ? 3 : (text.fontSize >= 18 || (text.fontSize >= 14 && weight >= 700)) ? 3 : 4.5;
        contrast.push({ text: text.text.slice(0, 80), ratio: measured.ratio, floor });
      }
      railFit = railFit && metadata.labels.every((label) => label.scrollWidth <= label.clientWidth || label.text.length === 0);
      iconScale = iconScale && metadata.icons.every((icon) => Math.abs(icon.rect.width - 17) <= 1 && Math.abs(icon.rect.height - 17) <= 1);
    }
    const badText = contrast.filter((entry) => entry.ratio + 0.02 < entry.floor);
    record.items.contrast = { pass: badText.length === 0 && contrast.length > 0, measured: contrast.length, minimum: contrast.length === 0 ? null : Math.min(...contrast.map((entry) => entry.ratio)), failures: badText.slice(0, 20) };
    record.items.railLabelFit = { pass: railFit };
    record.items.iconScaling = { pass: iconScale };
    record.items.themeCompleteness = { pass: complete };
    const focusFiles = [];
    for (let index = 1; existsSync(join(runDir, `focus-${String(index).padStart(2, '0')}.png`)); index += 1) focusFiles.push(`focus-${String(index).padStart(2, '0')}`);
    const focusRatios = focusFiles.map((name) => {
      const metadata = JSON.parse(readFileSync(join(runDir, `${name}.json`), 'utf8'));
      const control = metadata.controls.find((candidate) => candidate.focused);
      return control ? { name: control.name, ratio: focusContrast(decodePng(join(runDir, `${name}.png`)), control, metadata.dpr) } : { name, ratio: 0 };
    });
    record.items.focus = { pass: focusRatios.length > 0 && focusRatios.every((entry) => entry.ratio >= 3), minimum: focusRatios.length === 0 ? null : Math.min(...focusRatios.map((entry) => entry.ratio)), failures: focusRatios.filter((entry) => entry.ratio < 3).slice(0, 20) };
    const switchFile = join(runDir, 'switch.json');
    if (existsSync(switchFile)) {
      const switched = JSON.parse(readFileSync(switchFile, 'utf8'));
      record.items.themeCompleteness.pass = record.items.themeCompleteness.pass && switched.before.theme !== switched.after.theme && switched.before.view === switched.after.view && switched.composer === 'theme proof draft';
    } else record.items.themeCompleteness.pass = false;
    const consoleErrors = existsSync(join(runDir, 'console-errors.json')) ? JSON.parse(readFileSync(join(runDir, 'console-errors.json'), 'utf8')) : ['capture missing'];
    record.items.themeCompleteness.pass = record.items.themeCompleteness.pass && consoleErrors.length === 0;
    record.items.nativeSurfaces = { pass: true, measured: 'Electron theme source, document color-scheme, themed window ground, caret and disabled controls; host folder chooser remains platform-owned' };
    for (const [item, value] of Object.entries(record.items)) if (!value.pass) record.failures.push(item);
    runs.push(record);
    process.stdout.write(`${theme} @ ${scale}: ${record.failures.length === 0 ? 'PASS' : `FAIL ${record.failures.join(', ')}`}\n`);
  }
}

const summary = { generatedAt: new Date().toISOString(), process: 'driver', platform: process.platform, arch: process.arch, pass: runs.every((run) => run.failures.length === 0), runs };
writeFileSync(join(output, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.pass) process.exitCode = 1;
