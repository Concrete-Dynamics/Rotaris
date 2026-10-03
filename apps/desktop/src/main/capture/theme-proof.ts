import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { millis } from '@rotaris/kernel';
import { type CaptureHost, pause } from './host.js';
import { onConsoleWarning } from './console-relay.js';

/**
 * THE THEME PROOF's capture pass (`pnpm theme-proof`, IC-2) — verification only, and reached ONLY by a
 * dynamic import inside `if (__ROTARIS_SEAMS__)`, so `ROTARIS_THEME_PROOF_DIR` never reaches a packaged
 * bundle. Guarding only the `if` was the first attempt and it left the variable's name in the shipped
 * build, which fails the seam check in `scripts/package.mjs`.
 *
 * It walks seven views, every Settings category and a tab through every focusable control, writing a PNG
 * and a JSON of measured geometry, colour and contrast for each, then switches theme once and measures
 * that the composer's draft survived it.
 */
export function runThemeProof(host: CaptureHost, proofDir: string): void {
  mkdirSync(proofDir, { recursive: true });
  const rendererErrors: string[] = [];
  onConsoleWarning(host.win.webContents, ({ message }) => { rendererErrors.push(message); });

  host.clocks.timers.after(millis(900), async () => {
    const win = host.win;
    const metadata = async () => win.webContents.executeJavaScript(`(() => {
      const rect = (element) => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
      const visible = (element) => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)); const y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)); const hit=document.elementFromPoint(x,y); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && s.visibility !== 'hidden' && s.display !== 'none' && (hit===element || element.contains(hit)); };
      const texts = [...document.body.querySelectorAll('*')].filter((element) => visible(element) && element.children.length === 0 && (element.textContent || '').trim()).map((element) => { const s = getComputedStyle(element); return { text:(element.textContent || '').trim(), rect:rect(element), color:s.color, background:s.backgroundColor, fontSize:parseFloat(s.fontSize), fontWeight:s.fontWeight, disabled:element.matches(':disabled') || element.closest(':disabled') !== null }; });
      const controls = [...document.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(visible).map((element) => ({ name:element.getAttribute('aria-label') || (element.textContent || '').trim() || element.getAttribute('name') || element.tagName, rect:rect(element), focused:element === document.activeElement }));
      const icons = [...document.querySelectorAll('.nav-item i')].map((element) => ({ rect:rect(element), color:getComputedStyle(element).color }));
      const labels = [...document.querySelectorAll('.nav-item span')].map((element) => ({ text:(element.textContent || '').trim(), rect:rect(element), scrollWidth:element.scrollWidth, clientWidth:element.clientWidth }));
      return { dpr:devicePixelRatio, viewport:{width:innerWidth,height:innerHeight}, theme:document.documentElement.dataset.theme, view:document.querySelector('.app-shell')?.getAttribute('data-view'), rootBackground:getComputedStyle(document.documentElement).getPropertyValue('--rt-bg').trim(), texts, controls, icons, labels };
    })()`);

    /**
     * Wait for every finite animation to finish before measuring. Found 2026-09-08: this proof had been red
     * since Part V put a startup notice on the first screen (2026-09-06), failing contrast on EVERY theme at
     * EVERY scale. The notice fades in — `@keyframes rt-rise { from { opacity: 0 } }` over
     * `--rt-duration-slow` — and the capture at 900 ms photographed it mid-fade, measuring its text at about
     * a quarter opacity: ratios near 1.26 against a 4.5 floor, and the focus ring on its buttons at 0.
     * **Nothing was wrong with the product; the measurement was taken of a frame no user is asked to read.**
     * Infinite animations (`rt-pulse` on a live row) never finish and are excluded, or this would hang.
     */
    const settle = () => win.webContents.executeJavaScript(`(async () => {
      const running = document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.getComputedTiming();
        return t && t.iterations !== Infinity;
      });
      // Bounded, and the bound is not a nicety: the first form awaited the finished promise unconditionally
      // renderer hung until the 120 s spawn timeout SIGTERMed it on every run. An animation whose element is
      // removed, or one left paused, never settles it. 600 ms clears the slow duration token (900 ms
      // fallback) minus the 900 ms the capture already waits, and a frame that has not settled by then is
      // measured as it stands rather than not measured at all.
      await Promise.race([
        Promise.all(running.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    })()`);

    const take = async (name: string) => {
      await settle();
      const image = await win.webContents.capturePage();
      writeFileSync(join(proofDir, `${name}.png`), image.toPNG());
      writeFileSync(join(proofDir, `${name}.json`), `${JSON.stringify(await metadata(), null, 2)}\n`);
    };
    const keyView = async (view: number) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(view), modifiers: ['control'] });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(view), modifiers: ['control'] });
      await pause(host, 100);
    };

    const counterfactual = process.env['ROTARIS_THEME_COUNTERFACTUAL'];
    if (counterfactual === 'text') await win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--rt-text', 'oklch' + '(45% 0 0)')`);
    if (counterfactual === 'focus') await win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--rt-focus', 'oklch' + '(40% 0 0)')`);

    for (let view = 1; view <= 7; view += 1) { await keyView(view); await take(`view-${view}`); }
    await keyView(7);
    const categories = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-list__item')].map((element) => (element.textContent || '').trim())`) as string[];
    for (let index = 0; index < categories.length; index += 1) {
      await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-list__item')[${index}]?.click()`);
      await pause(host, 60);
      await take(`settings-${String(index + 1).padStart(2, '0')}`);
    }
    const focusCount = await win.webContents.executeJavaScript(`[...document.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((element) => { const r=element.getBoundingClientRect(); return r.width>0 && r.height>0; }).length`) as number;
    await win.webContents.executeJavaScript(`document.activeElement?.blur()`);
    for (let index = 0; index < focusCount; index += 1) {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await pause(host, 30);
      await take(`focus-${String(index + 1).padStart(2, '0')}`);
    }
    await keyView(2);
    await win.webContents.executeJavaScript(`(() => { const input=document.querySelector('.composer__input'); if(input){ const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,'theme proof draft'); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    const beforeSwitch = await metadata();
    const current = host.themeName();
    const next = current === 'rotaris-dim' ? 'nocturne' : current === 'nocturne' ? 'high-contrast' : 'rotaris-dim';
    await host.command({ kind: 'theme.set', name: next });
    await pause(host, 120);
    const afterSwitch = await metadata();
    await take('theme-switch');
    writeFileSync(join(proofDir, 'switch.json'), `${JSON.stringify({ before: beforeSwitch, after: afterSwitch, composer: await win.webContents.executeJavaScript(`document.querySelector('.composer__input')?.value ?? ''`) }, null, 2)}\n`);
    writeFileSync(join(proofDir, 'console-errors.json'), `${JSON.stringify(rendererErrors, null, 2)}\n`);
    host.log(`theme proof captured ${proofDir}`);
    host.exit(rendererErrors.length === 0 ? 0 : 3);
  });
}
