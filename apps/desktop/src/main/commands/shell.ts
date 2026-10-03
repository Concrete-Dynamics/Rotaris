import { BrowserWindow, app, nativeTheme, shell } from 'electron';
import { CHANNEL, CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { buildIdentifier, thirdPartyLicensesPath } from '../about.js';
import { productVersion } from '../version.js';
import { composerDraftKey } from '@rotaris/platform';
import { homedir } from 'node:os';
import { millis } from '@rotaris/kernel';
import { type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE SHELL — the facts a window asks for when it paints, the links it may open, the theme, the remembered
 * preferences, the composer draft and the notices (REQ-SHELL-*, REQ-CHAT-076). The scheme check on an
 * external link lives here and nowhere else: transcript text is model-authored, so only http and https open.
 */
export function shellCommands(
  ctx: Pick<CommandContext, 'capturing' | 'currentTheme' | 'log' | 'notices' | 'preferences' | 'processes' | 'requirementsPreferenceKey' | 'runHost' | 'services' | 'setTheme' | 'themeBackground' | 'updater'>,
): Pick<CommandHandlers, 'shell.hello' | 'shell.openExternal' | 'shell.openThirdPartyLicenses' | 'theme.get' | 'theme.set' | 'prefs.get' | 'prefs.set' | 'composer.readDraft' | 'composer.writeDraft' | 'notice.acknowledge' | 'notice.report' | 'shell.switchView'> {
  const { capturing, currentTheme, log, notices, preferences, processes, requirementsPreferenceKey, runHost, services, setTheme, themeBackground, updater } = ctx;
  return {
    'shell.hello': async (_req, { w }) => {
      const cb = w.workspaceId
        ? await runHost.request({ kind: 'circuit_breaker.status', workspaceId: w.workspaceId }, millis(5_000))
        : { kind: 'circuit_breaker.status' as const, enabled: process.env['ROTARIS_CIRCUIT_BREAKER'] !== 'off' };
      // REQ-SHELL-140 (Part AG): the About page's product card reads its four local facts from here; it makes no
      // request of its own and none of these leaves the machine (REQ-SHELL-139, REQ-CONFIG-398). The version is the
      // application manifest's, never Electron's (REQ-STARTUP-007, REQ-STARTUP-158; `version.ts`).
      return { ok: true, value: {
        version: productVersion(), workspace: w.workspace, processes: [...processes, ...services.keys()].map((p) => `svc:${p}`),
        circuitBreakerArmed: cb.kind === 'circuit_breaker.status' && cb.enabled,
        // REQ-SHELL-041: the strip follows the saved `circuit_breaker.enabled` from the configuration snapshot after this
        // boot answer; the host override is the one input the snapshot does not carry, so it travels here.
        circuitBreakerHostOff: process.env['ROTARIS_CIRCUIT_BREAKER'] === 'off',
        build: buildIdentifier(), standalone: app.isPackaged, thirdPartyLicenses: thirdPartyLicensesPath() !== null,
        // Stage B — REQ-WORKSPACE-149 rule 1: home collapsing is a DISPLAY rule, so the renderer needs to know
        // where home is. It cannot ask the platform itself (no `node:os` in a sandboxed renderer, ADR-0051), and
        // the collapse must never reach the tooltip, the accessible description or anything handed to the host,
        // which is why what travels is home itself rather than an already-collapsed label.
        home: homedir(),
      } };
    },
    /**
     * Part AA — REQ-CHAT-076: an `http(s)` link in transcript text opens in the SYSTEM BROWSER, the opening is
     * acknowledged and a failure is reported rather than passing silently. The renderer is sandboxed and never
     * navigates (ADR-0051); main is the only process that hands a URL to the platform.
     *
     * **The scheme is checked here and nowhere else.** Transcript text is model-authored, so a `file:`,
     * `javascript:` or shell-registered scheme reaching `shell.openExternal` would run at the reader's expense
     * on their machine. Only `http:` and `https:` are opened; everything else, and anything that is not a URL
     * at all, is refused with the target named.
     */
    'shell.openExternal': async (req) => {
      let parsed: URL;
      try { parsed = new URL(req.url); }
      catch { return { ok: false, code: 'link.unreadable', headline: 'That link could not be opened', detail: `“${req.url}” is not a web address.` }; }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, code: 'link.scheme', headline: 'That link could not be opened', detail: `Only http and https links open in the browser; this one is “${parsed.protocol.replace(':', '')}”.` };
      }
      // Verification seam (only with ROTARIS_CAPTURE_PNG): `record` opens nothing and reports success, `fail`
      // reports the platform refusal, so both halves of the requirement are exercised without launching a browser.
      const scripted = capturing ? process.env['ROTARIS_CAPTURE_OPEN_EXTERNAL'] : undefined;
      if (scripted === 'fail') { log(`capture: open-external REFUSED ${parsed.href}`); return { ok: false, code: 'link.failed', headline: 'That link could not be opened', detail: 'The system browser refused to open it (scripted).' }; }
      if (scripted === 'record') { log(`capture: open-external ${parsed.href}`); return { ok: true, value: { url: parsed.href } }; }
      try { await shell.openExternal(parsed.href); }
      catch (cause) { return { ok: false, code: 'link.failed', headline: 'That link could not be opened', detail: cause instanceof Error ? cause.message : String(cause) }; }
      log(`opened externally: ${parsed.href}`);
      return { ok: true, value: { url: parsed.href } };
    },
    /**
     * Part AG — REQ-SHELL-142: the third-party licence bundle opens as a **local** file, so it takes its own
     * command rather than the scheme-guarded external opener beside it. Main resolves the path; the renderer
     * never names one. With no bundle the refusal is the ordinary case for this build, not an error.
     */
    'shell.openThirdPartyLicenses': async () => {
      const path = thirdPartyLicensesPath();
      if (path === null) return { ok: false, code: 'licenses.absent', headline: 'No third-party license bundle', detail: 'This build does not carry a third-party license bundle.' };
      const scripted = capturing ? process.env['ROTARIS_CAPTURE_OPEN_EXTERNAL'] : undefined;
      if (scripted === 'fail') { log(`capture: open-licenses REFUSED ${path}`); return { ok: false, code: 'licenses.failed', headline: 'The license bundle could not be opened', detail: 'The system refused to open it (scripted).' }; }
      if (scripted === 'record') { log(`capture: open-licenses ${path}`); return { ok: true, value: { path } }; }
      const failed = await shell.openPath(path);
      if (failed !== '') return { ok: false, code: 'licenses.failed', headline: 'The license bundle could not be opened', detail: failed };
      log(`opened licenses: ${path}`);
      return { ok: true, value: { path } };
    },
    'theme.get': () => {
      return { ok: true, value: { name: currentTheme().name } };
    },
    'theme.set': (req) => {
      // The theme is main's, not this module's: `setTheme` replaces the one main holds and hands it back, so the
      // capture host and the next window built read the same theme this command has just applied.
      const theme = setTheme(req.name);
      preferences.writeThemeSync(theme.name);
      nativeTheme.themeSource = theme.dark ? 'dark' : 'light';
      const background = themeBackground();
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        window.setBackgroundColor(background);
        window.webContents.send(CHANNEL.themeChanged, { v: CONTRACT_SCHEMA_VERSION, name: theme.name });
      }
      log(`theme applied ${theme.name} to every live window`);
      return { ok: true, value: { name: theme.name } };
    },
    /**
     * Declared by the contract and answered by nobody: the view switch is the renderer's own business and main
     * has never had a part in it. It is named here rather than left to fall through, so that the table stays
     * total over the contract's kinds and this gap is a line of code rather than an absence.
     */
    'shell.switchView': () => ({ ok: false, code: 'command.unimplemented', headline: 'shell.switchView is not built yet' }),
    'prefs.get': (req) => {
      return { ok: true, value: { value: preferences.read(requirementsPreferenceKey(req.key)) } };
    },
    'prefs.set': async (req) => {
      if (req.key === 'panels/overview' || req.key === 'panels/git' || req.key === 'panels/library' || req.key === 'panels/workspace') {
        if (typeof req.value !== 'object') return { ok: false, code: 'preference.type', headline: 'A pane layout requires a layout record' };
        await preferences.write(req.key, req.value);
      } else if (req.key === 'ui/reduced_motion') {
        if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'Reduce motion requires a boolean value' };
        await preferences.write(req.key, req.value);
      } else if (req.key === 'interface/agentPopOut' || req.key === 'display/showReasoning' || req.key === 'display/autoCollapseTools') {
        // Part AA: REQ-CHAT-167's `display/showReasoning` and REQ-CHAT-067's `display/autoCollapseTools`, both booleans and both off by default.
        if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'This display preference requires a boolean value' };
        await preferences.write(req.key, req.value);
      } else if (req.key === 'display/groupTools') {
        // REQ-CHAT-067 (Part Z): the tool-grouping switch, default on.
        if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'Tool grouping requires a boolean value' };
        await preferences.write(req.key, req.value);
      } else {
        if (typeof req.value !== 'string') return { ok: false, code: 'preference.type', headline: 'The Settings category requires a string value' };
        await preferences.write(requirementsPreferenceKey(req.key), req.value);
      }
      return { ok: true };
    },
    /**
     * REQ-CHAT-015 / REQ-SHELL-159 (Part AB): the per-workspace composer draft. Main resolves the key from the
     * workspace IT has open — the renderer names none — so a draft can only ever be read or written against the
     * workspace whose window asked, and the isolation REQ-CHAT-015 requires is a property of this seam rather
     * than of the caller. With no workspace open there is no draft: the read answers the empty default and the
     * write is a silent no-op, which is the state a window is in before its first workspace opens.
     */
    'composer.readDraft': (_req, { w }) => {
      if (w.workspace === '(no workspace)') return { ok: true, value: { text: '' } };
      return { ok: true, value: { text: preferences.read(composerDraftKey(w.workspace)) } };
    },
    'composer.writeDraft': async (req, { w }) => {
      if (w.workspace === '(no workspace)') return { ok: true };
      await preferences.write(composerDraftKey(w.workspace), req.text);
      return { ok: true };
    },
    'notice.acknowledge': async (req) => {
      // REQ-STARTUP-116/117, REQ-SHELL-114/118: dismissing the update-offer notice FIRST records the offered version as
      // waved off, and dismissing any other notice records nothing — the updater knows which notice is its own and
      // answers before the clear, so the version is written before the notice naming it is gone.
      const dismissing = req.noticeId ?? notices.current()?.id;
      if (dismissing !== undefined) await updater.noticeDismissed(dismissing);
      // REQ-NOTIFY-026: with an identifier this is a compare-and-clear, so dismissing a notice already superseded
      // leaves its successor standing; without one it clears whatever is current.
      await notices.dismiss(req.noticeId);
      return { ok: true };
    },
    // Part AO — `notice.report`: a renderer surface raising a persistent notice through the ONE store (ADR-0049 decision B's
    // missing entry for a renderer, defect fifty-seven); the record of REQ-NOTIFY-268 and the scoping of REQ-NOTIFY-028 apply
    // as to every other publication. And `prompts.roots.read`: REQ-CHAT-160's three roots, read by the workspace service.
    'notice.report': async (req) => {
      const r = await notices.report({ severity: req.severity, title: req.title, ...(req.message === undefined ? {} : { message: req.message }), ...(req.detail === undefined ? {} : { detail: req.detail }), persistent: req.persistent, ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }) });
      log(`notice from the renderer: ${req.severity} "${req.title}" → #${r.id}`);
      return { ok: true, value: { id: r.id } };
    },
  };
}
