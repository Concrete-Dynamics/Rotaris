import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PERMISSION_PRESETS, type ModelSlotName, type OnboardingOutcome, type OnboardingView, type PermissionPreset, type ProviderChoice, type ProviderSignInResult } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, SearchableSelect, SegmentedControl, SendPill, StatusDot, TextArea as DesignTextArea } from './design-system/index.js';
import { layoutContractAttributes, type UiLayoutContract } from './design-system/layout-contract.js';
import { markMotionStart } from './motion.js';
import { WindowControls, type WindowControlsProps } from './WindowControls.js';
import './first-run.css';

/**
 * PD-WORKSPACE-010 — the first-launch setup: a full-window surface of three steps (project, model, first prompt) that
 * stands over the shell until it is carried through or skipped. The left column asks; the right column is a miniature of
 * the window being set up, whose project, model and composer fill in as each step lands, and which becomes the window
 * when the setup ends.
 *
 * It owns no fact. The step is derived from `view` (`stepFor`), every act is a callback the window's root sends, and
 * the setup adds no second path to anything: the project is REQ-WORKSPACE-009's chooser, the provider REQ-WORKSPACE-135's
 * sign-in, the slots and the mode the configuration's own writes, the prompt the composer's `session.start`.
 */

export const FIRST_RUN_STEPS = ['project', 'model', 'prompt'] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];
export const STEP_LABELS: Readonly<Record<FirstRunStep, string>> = { project: 'Project', model: 'Model', prompt: 'First prompt' };

/** The slots the setup offers, the three tiers a run's roles resolve to (REQ-PROVIDER-088); the other slots stay in Settings › Models. */
export const FIRST_RUN_SLOTS = ['large_model', 'medium_model', 'small_model'] as const satisfies readonly ModelSlotName[];
export const SLOT_LABELS: Readonly<Record<(typeof FIRST_RUN_SLOTS)[number], string>> = { large_model: 'Large', medium_model: 'Medium', small_model: 'Small' };

/** PD-WORKSPACE-010 clause 5: the mode the setup proposes to everyone, and the sentence that says what it means. */
export const FIRST_RUN_MODE: PermissionPreset = 'autonomous';
export const MODE_LABELS: Readonly<Record<PermissionPreset, string>> = { restricted: 'Restricted', ask: 'Ask', autonomous: 'Autonomous' };
export const MODE_HINTS: Readonly<Record<PermissionPreset, string>> = {
  autonomous: 'Agents edit files and run commands in this project without asking first. You can stop a run at any time.',
  ask: 'Agents ask before each command and each change outside the project. Reading is not asked about.',
  restricted: 'Agents read and plan. Every change and every command is refused.',
};

export const STARTER_PROMPTS = [
  'Explain how this repository is organised and where its entry points are.',
  'Run the tests, then find and fix one failure.',
  'Review the most recent commit and list anything that looks wrong.',
] as const;

/** The step the facts stand at: the first one the setup still owes. */
export function stepFor(view: OnboardingView): FirstRunStep {
  if (!view.project.chosen) return 'project';
  if (view.providers.authenticated.length === 0) return 'model';
  return 'prompt';
}

/** A step's state as the progress list words it: what is behind, what is being asked, what waits. */
export function stepState(step: FirstRunStep, current: FirstRunStep): 'done' | 'now' | 'waiting' {
  const at = FIRST_RUN_STEPS.indexOf(step);
  const now = FIRST_RUN_STEPS.indexOf(current);
  return at < now ? 'done' : at === now ? 'now' : 'waiting';
}
const STATE_WORDS = { done: 'Done', now: 'Now', waiting: 'Waiting' } as const;

/** A folder's last segment, the name the title bar's chip shows; the whole path where it has none. */
export function projectName(path: string | null): string {
  if (path === null) return '';
  const trimmed = path.replace(/[\\/]+$/, '');
  const name = trimmed.split(/[\\/]/).pop() ?? '';
  return name === '' ? path : name;
}
/** A model as a chip names it: the identifier without the provider it is served by. */
export function modelName(id: string): string {
  const at = id.lastIndexOf('/');
  return at === -1 || at === id.length - 1 ? id : id.slice(at + 1);
}
/** REQ-WORKSPACE-149 rule 1, for the one line the setup shows a path on: the home directory reads as `~`. */
export function homeRelative(path: string, home: string | undefined): string {
  if (home === undefined || home === '') return path;
  const base = home.replace(/[\\/]+$/, '');
  return path === base ? '~' : path.startsWith(`${base}/`) || path.startsWith(`${base}\\`) ? `~${path.slice(base.length)}` : path;
}

type Result = { readonly ok: true } | { readonly ok: false; readonly reason: string };
export interface FirstRunConfig {
  /** The model each offered slot resolves to now, or null where none is assigned. */
  readonly slots: Readonly<Partial<Record<ModelSlotName, string | null>>>;
  /** Every model the authenticated providers serve. */
  readonly models: readonly string[];
}
export interface FirstRunSetupProps {
  readonly version: string;
  readonly home: string | undefined;
  readonly view: OnboardingView;
  /** The window's configuration once its workspace has one; null until then. */
  readonly config: FirstRunConfig | null;
  readonly windowControls?: WindowControlsProps | undefined;
  /** Opens the folder chooser, or takes the folder the application started in. A different folder replaces the window. */
  readonly onChooseProject: (useCurrent: boolean) => Promise<Result | { readonly ok: true; readonly cancelled: true }>;
  readonly onSignIn: (req: { providerId: string; label: string; baseUrl: string; apiKey: string; replace: boolean; allowEmpty: boolean }) => Promise<ProviderSignInResult | { outcome: 'error'; message: string }>;
  readonly onAssignSlot: (slot: ModelSlotName, model: string) => Promise<Result>;
  readonly onSetMode: (mode: PermissionPreset) => Promise<Result>;
  /** Starts the first run with this prompt, on the composer's own path. */
  readonly onSubmit: (text: string) => Promise<Result>;
  /** The setup has left the screen: the root unmounts it and tells main how it ended. */
  readonly onFinish: (outcome: OnboardingOutcome) => void;
}

const FIRST_RUN_LAYOUT: UiLayoutContract = { id: 'first-run', relations: [{ kind: 'viewport-scroll', axis: 'x', expected: false }, { kind: 'viewport-scroll', axis: 'y', expected: false }] };
const FIRST_RUN_ASK_LAYOUT: UiLayoutContract = { id: 'first-run.ask', relations: [{ kind: 'containment', target: 'first-run' }] };
const FIRST_RUN_STAGE_LAYOUT: UiLayoutContract = { id: 'first-run.stage', relations: [{ kind: 'containment', target: 'first-run' }] };

export function FirstRunSetup({ version, home, view, config, windowControls, onChooseProject, onSignIn, onAssignSlot, onSetMode, onSubmit, onFinish }: FirstRunSetupProps) {
  const [step, setStep] = useState<FirstRunStep>(() => stepFor(view));
  const [leaving, setLeaving] = useState<OnboardingOutcome | null>(null);
  const [mode, setMode] = useState<PermissionPreset>(FIRST_RUN_MODE);
  const [connecting, setConnecting] = useState(false);
  const [draft, setDraft] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const miniature = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // The shell under the setup takes no focus and no pointer while it stands; chords are held back by `aria-modal`
  // (`modalSurfaceOpen`).
  useEffect(() => {
    const shell = document.querySelector('.app-shell');
    shell?.setAttribute('inert', '');
    return () => shell?.removeAttribute('inert');
  }, []);
  // A step's heading takes focus as it arrives, so the step is announced and the next Tab lands in it.
  const shownStep = useRef(step);
  useEffect(() => {
    if (root.current) markMotionStart(root.current);
    if (shownStep.current === step) return;
    shownStep.current = step;
    // The last step's composer takes focus itself (`PromptStep`): arriving there, the person types.
    if (step !== 'prompt') heading.current?.focus();
  }, [step]);

  const facts = stepFor(view);
  // A fact that lands moves the setup on: the project step ends when a folder is remembered, the model step when a
  // provider is authenticated. Going back is the person's own act and is never undone by a re-read.
  const lastFacts = useRef(facts);
  useEffect(() => {
    const was = lastFacts.current;
    lastFacts.current = facts;
    if (FIRST_RUN_STEPS.indexOf(facts) > FIRST_RUN_STEPS.indexOf(was) && step === was && was === 'project') setStep('model');
  }, [facts, step]);

  /**
   * The end. The left column leaves, the miniature grows to the window's own bounds and the surface clears over the shell
   * it was drawn from. Under reduced motion (REQ-SHELL-135, read here, at the animation's start) nothing travels and the
   * setup is simply gone.
   */
  const leave = useCallback((outcome: OnboardingOutcome) => {
    const node = root.current;
    if (!node || markMotionStart(node)) { onFinish(outcome); return; }
    const frame = miniature.current?.getBoundingClientRect();
    if (frame && frame.width > 0 && frame.height > 0) {
      node.style.setProperty('--first-run-grow-x', String(window.innerWidth / frame.width));
      node.style.setProperty('--first-run-grow-y', String(window.innerHeight / frame.height));
      node.style.setProperty('--first-run-move-x', `${-frame.left}px`);
      node.style.setProperty('--first-run-move-y', `${-frame.top}px`);
    }
    setLeaving(outcome);
  }, [onFinish]);
  const onLeft = useCallback((e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (leaving !== null && e.target === e.currentTarget) onFinish(leaving);
  }, [leaving, onFinish]);

  const project = view.project.chosen ? projectName(view.project.path) : null;
  const provider = view.providers.authenticated[0] ?? null;
  const largeModel = config?.slots.large_model ?? config?.slots.medium_model ?? null;
  const ready = facts === 'prompt';
  const drafted = ready && step === 'prompt' && draft.trim() !== '';

  return (
    <div ref={root} className="first-run" role="dialog" aria-modal="true" aria-labelledby={titleId} data-step={step} data-leaving={leaving ?? undefined}
      onAnimationEnd={onLeft} {...layoutContractAttributes(FIRST_RUN_LAYOUT)}>
      <header className="title-bar first-run__bar">
        <span className="brand-mark" aria-hidden="true" />
        <span className="title-bar__name">Rotaris</span>
        <span className="title-bar__version mono">{version}</span>
        <span className="first-run__bar-space" />
        <DesignButton variant="ghost" size="compact" className="first-run__skip" data-action="skip-setup" disabled={leaving !== null} onClick={() => leave('skipped')}>Skip setup</DesignButton>
        {windowControls && <WindowControls {...windowControls} />}
      </header>
      <div className="first-run__body">
        <section className="first-run__ask" aria-label="Setup" {...layoutContractAttributes(FIRST_RUN_ASK_LAYOUT)}>
          <ol className="first-run__steps" aria-label="Setup steps">
            {FIRST_RUN_STEPS.map((s, i) => {
              const state = stepState(s, step);
              const reachable = FIRST_RUN_STEPS.indexOf(s) <= FIRST_RUN_STEPS.indexOf(facts) && s !== step;
              return (
                <li key={s} className="first-run__step" data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
                  <DesignButton className="first-run__step-button" disabled={!reachable || leaving !== null} onClick={() => setStep(s)} aria-label={`Step ${i + 1}, ${STEP_LABELS[s]}: ${STATE_WORDS[state]}`}>
                    <span className="first-run__step-bar" aria-hidden="true" />
                    <span className="first-run__step-name"><span className="first-run__step-number mono">{i + 1}</span>{STEP_LABELS[s]}</span>
                    <span className="first-run__step-state">{STATE_WORDS[state]}</span>
                  </DesignButton>
                </li>
              );
            })}
          </ol>
          <div className="first-run__pane" key={step} data-pane={step}>
            {step === 'project' && <ProjectStep titleId={titleId} heading={heading} view={view} home={home} onChoose={onChooseProject} onContinue={() => setStep('model')} />}
            {step === 'model' && <ModelStep titleId={titleId} heading={heading} view={view} config={config} onSignIn={onSignIn} onAssignSlot={onAssignSlot} onBusy={setConnecting} onContinue={() => setStep('prompt')} onBack={() => setStep('project')} />}
            {step === 'prompt' && <PromptStep titleId={titleId} heading={heading} project={project} mode={mode} onMode={setMode} text={draft} onText={setDraft} leaving={leaving !== null} onBack={() => setStep('model')}
              onOpen={async () => {
                const written = await onSetMode(mode);
                if (written.ok) leave('completed');
                return written;
              }}
              onSend={async (text) => {
                const written = await onSetMode(mode);
                if (!written.ok) return written;
                const started = await onSubmit(text);
                if (started.ok) leave('completed');
                return started;
              }} />}
          </div>
        </section>
        <aside className="first-run__stage" aria-hidden="true" {...layoutContractAttributes(FIRST_RUN_STAGE_LAYOUT)}>
          <div className="first-run__stage-caption"><span>Your workspace</span></div>
          <div ref={miniature} className="first-run__window">
            <div className="first-run__window-bar">
              <span className="brand-mark" />
              <MiniChip state={project !== null ? 'done' : step === 'project' ? 'now' : 'waiting'} text={project ?? 'No project'} mono={project !== null} />
              <MiniChip state={provider !== null ? 'done' : step === 'model' ? 'now' : 'waiting'} pulse={connecting} text={provider !== null ? (largeModel === null ? provider.displayName : modelName(largeModel)) : connecting ? 'Connecting' : 'No model'} mono={provider !== null} />
              <MiniChip state="done" text={MODE_LABELS[mode]} />
            </div>
            <div className="first-run__window-body">
              <div className="first-run__window-nav">
                <span data-on="1" data-filled={project !== null ? '1' : undefined}>{project !== null && <span className="mono">{project}</span>}</span>
                {[1, 2, 3, 4].map((i) => <span key={i} />)}
              </div>
              <div className="first-run__window-view">
                {drafted
                  ? <div className="first-run__window-entry"><span className="first-run__window-entry-who">You</span><span className="first-run__window-entry-text">{draft}</span></div>
                  : <><span className="first-run__ghost" data-w="2" /><span className="first-run__ghost" data-w="4" /><span className="first-run__ghost" data-w="3" /></>}
                <span className="first-run__ghost first-run__ghost--gap" data-w="1" /><span className="first-run__ghost" data-w="3" />
                <div className="first-run__window-composer" data-state={ready ? 'now' : 'waiting'}>
                  <span>{ready ? (drafted ? 'Enter sends it' : 'Ready for your first prompt') : project === null ? 'The composer wakes when a project and a model are in place' : 'The composer wakes when a model is connected'}</span>
                </div>
              </div>
            </div>
            <div className="first-run__window-strip">
              <span className="mono">{view.project.chosen && view.project.path !== null ? homeRelative(view.project.path, home) : 'no project'}</span>
              <span className="mono">{provider !== null && largeModel !== null ? modelName(largeModel) : 'no model'}</span>
              <span>{MODE_LABELS[mode].toLowerCase()} runs</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MiniChip({ state, text, mono = false, pulse = false }: { state: 'done' | 'now' | 'waiting'; text: string; mono?: boolean; pulse?: boolean }) {
  return (
    <span className="first-run__chip" data-state={state}>
      <StatusDot state={state === 'done' ? 'done' : state === 'now' ? 'run' : 'wait'} pulse={pulse} />
      <span className={mono ? 'mono' : undefined}>{text}</span>
    </span>
  );
}

interface StepProps { readonly titleId: string; readonly heading: React.RefObject<HTMLHeadingElement | null> }

function StepHead({ titleId, heading, title, children }: StepProps & { title: string; children: ReactNode }) {
  return (<>
    <h1 id={titleId} ref={heading} tabIndex={-1} className="first-run__title">{title}</h1>
    <p className="first-run__lede">{children}</p>
  </>);
}

function ProjectStep({ titleId, heading, view, home, onChoose, onContinue }: StepProps & { view: OnboardingView; home: string | undefined; onChoose: FirstRunSetupProps['onChooseProject']; onContinue: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = async (useCurrent: boolean) => {
    setBusy(true);
    setError(null);
    const r = await onChoose(useCurrent);
    setBusy(false);
    if (!r.ok) setError(r.reason);
  };
  const { chosen, path, currentIsRepository } = view.project;
  const offerCurrent = !chosen && path !== null && currentIsRepository;
  return (<>
    <StepHead titleId={titleId} heading={heading} title="Choose your project">Agents read and change files in one folder. Pick the repository you want to work in.</StepHead>
    {(chosen || offerCurrent) && path !== null && (
      <div className="first-run__fact" data-state={chosen ? 'done' : 'offered'}>
        <i className="ph ph-folder" aria-hidden="true" />
        <div className="first-run__fact-text">
          <strong>{projectName(path)}</strong>
          <span className="mono">{homeRelative(path, home)}</span>
        </div>
        <span className="first-run__fact-state">{chosen ? 'Chosen' : 'Rotaris was started here'}</span>
      </div>
    )}
    {error && <p className="composer__error" role="alert">{error}</p>}
    <div className="first-run__actions">
      {chosen
        ? <DesignButton variant="primary" data-action="continue" onClick={onContinue}>Continue</DesignButton>
        : offerCurrent
          ? <DesignButton variant="primary" disabled={busy} data-action="use-current" onClick={() => { void choose(true); }}>Use this folder</DesignButton>
          : <DesignButton variant="primary" disabled={busy} data-action="choose-folder" icon="ph-folder-open" onClick={() => { void choose(false); }}>Choose a folder…</DesignButton>}
      {(chosen || offerCurrent) && <DesignButton variant="secondary" disabled={busy} data-action="choose-folder" onClick={() => { void choose(false); }}>{chosen ? 'Choose another…' : 'Choose another folder…'}</DesignButton>}
    </div>
    <p className="first-run__note">Rotaris keeps its settings for this project in a <code className="mono">.rotaris</code> folder inside it. Nothing leaves your machine except the requests to the model you connect next.</p>
  </>);
}

function ModelStep({ titleId, heading, view, config, onSignIn, onAssignSlot, onBusy, onContinue, onBack }: StepProps & { view: OnboardingView; config: FirstRunConfig | null; onSignIn: FirstRunSetupProps['onSignIn']; onAssignSlot: FirstRunSetupProps['onAssignSlot']; onBusy: (busy: boolean) => void; onContinue: () => void; onBack: () => void }) {
  const authenticated = view.providers.authenticated;
  // The form is shown while nothing is connected, and again when another provider is asked for.
  const [another, setAnother] = useState(false);
  const adding = authenticated.length === 0 || another;
  const choices = view.providers.choices;
  const [choice, setChoice] = useState<ProviderChoice | null>(() => choices.find((c) => c.custom) ?? choices.find((c) => c.available) ?? null);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState(choice?.defaultBaseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ label?: string; baseUrl?: string; apiKey?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ kind: 'replace' | 'no-models'; message: string } | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const groupId = useId();

  const pick = (c: ProviderChoice) => { setChoice(c); setBaseUrl(c.defaultBaseUrl ?? ''); setFieldErrors({}); setError(null); setAsk(null); };
  const usable = choice !== null && choice.available && choice.method === 'api-key';
  const submit = async (opts: { replace?: boolean; allowEmpty?: boolean } = {}) => {
    if (!choice || !usable || busy) return;
    const errs: { label?: string; baseUrl?: string; apiKey?: string } = {};
    if (choice.custom && label.trim() === '') errs.label = 'A name is required.';
    if (choice.custom && baseUrl.trim() === '') errs.baseUrl = 'An endpoint URL is required.';
    if (apiKey.trim() === '') errs.apiKey = 'An API key is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true); onBusy(true); setError(null); setAsk(null);
    const r = await onSignIn({ providerId: choice.id, label: label.trim(), baseUrl: baseUrl.trim(), apiKey, replace: opts.replace ?? false, allowEmpty: opts.allowEmpty ?? false });
    setBusy(false); onBusy(false);
    if (r.outcome === 'signed-in') { setApiKey(''); setAnother(false); return; }
    if (r.outcome === 'needs-confirmation') { setAsk({ kind: 'replace', message: r.message }); return; }
    if (r.outcome === 'no-models') { setAsk({ kind: 'no-models', message: 'The provider answered, and listed no models.' }); return; }
    if (r.outcome === 'cancelled') return;
    setError(r.message);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } };
  const onRadioKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key) || choice === null) return;
    const open = choices.filter((c) => c.available && c.method === 'api-key');
    const at = open.findIndex((c) => c.id === choice.id);
    const next = open[(at + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : open.length - 1)) % open.length];
    if (!next) return;
    e.preventDefault();
    pick(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-choice="${next.id}"]`)?.focus();
  };

  if (!adding) {
    const total = authenticated.reduce((n, p) => n + p.modelCount, 0);
    return (<>
      <StepHead titleId={titleId} heading={heading} title="Your model is connected">Rotaris assigned the models it found. A run uses the large one to plan and the smaller ones for routine work.</StepHead>
      {authenticated.map((p) => (
        <div key={p.id} className="first-run__fact" data-state="done">
          <i className="ph ph-plugs-connected" aria-hidden="true" />
          <div className="first-run__fact-text"><strong>{p.displayName}</strong><span>{p.modelCount === 1 ? '1 model' : `${p.modelCount} models`}</span></div>
          <span className="first-run__fact-state">Connected</span>
        </div>
      ))}
      <div className="first-run__slots" data-open={slotsOpen ? '1' : undefined}>
        {FIRST_RUN_SLOTS.map((slot) => {
          const value = config?.slots[slot] ?? null;
          const options = (config?.models ?? []).map((m) => ({ value: m, label: m }));
          return (
            <div key={slot} className="first-run__slot">
              <span className="first-run__slot-name">{SLOT_LABELS[slot]}</span>
              {slotsOpen && config !== null
                ? <SearchableSelect className="first-run__slot-pick" value={value ?? ''} options={value !== null && !config.models.includes(value) ? [{ value, label: value }, ...options] : options} ariaLabel={`Model for the ${SLOT_LABELS[slot].toLowerCase()} slot`}
                  onChange={(model) => { setSlotError(null); void onAssignSlot(slot, model).then((r) => { if (!r.ok) setSlotError(r.reason); }); }} />
                : <span className="first-run__slot-value mono">{value ?? (config === null ? 'Reading…' : total === 0 ? 'None found' : 'Not assigned')}</span>}
            </div>
          );
        })}
      </div>
      {slotError && <p className="composer__error" role="alert">{slotError}</p>}
      <p className="first-run__note">
        <DesignButton variant="link" data-action="toggle-slots" aria-expanded={slotsOpen} disabled={config === null || config.models.length === 0} onClick={() => setSlotsOpen((o) => !o)}>{slotsOpen ? 'Done choosing' : 'Choose a model for each slot (optional)'}</DesignButton>
        {' '}The other slots and the reasoning strength are in Settings › Models.
      </p>
      <div className="first-run__actions">
        <DesignButton variant="primary" data-action="continue" onClick={onContinue}>Continue</DesignButton>
        <DesignButton variant="secondary" data-action="add-provider" disabled={choices.every((c) => !c.available)} onClick={() => setAnother(true)}>Connect another provider</DesignButton>
        <DesignButton variant="ghost" data-action="back" onClick={onBack}>Back</DesignButton>
      </div>
    </>);
  }

  return (<>
    <StepHead titleId={titleId} heading={heading} title="Connect a model">A run needs one provider. Rotaris reads which models your key reaches and assigns them for you.</StepHead>
    <div className="first-run__choices" role="radiogroup" aria-labelledby={groupId} onKeyDown={onRadioKey}>
      <span id={groupId} className="visually-hidden">Provider</span>
      {choices.map((c) => {
        const open = c.available && c.method === 'api-key';
        const selected = choice?.id === c.id;
        return (
          <DesignButton key={c.id} className="first-run__choice" role="radio" aria-checked={selected} data-choice={c.id} tabIndex={selected ? 0 : -1} disabled={!open || busy} onClick={() => pick(c)}>
            <span className="first-run__radio" aria-hidden="true" />
            <span className="first-run__choice-name">{c.custom ? 'OpenAI-compatible endpoint' : c.displayName}</span>
            <span className="first-run__choice-how">{open ? (c.custom ? 'Any server that speaks the OpenAI API' : /subscription/i.test(c.displayName) ? 'API key, not the subscription sign-in' : 'API key') : c.available ? 'Sign-in is not in this build yet' : c.unavailabilityReason ?? 'Not available yet'}</span>
          </DesignButton>
        );
      })}
    </div>
    {choice && usable && (
      <div className="first-run__fields">
        {choice.custom && (<>
          <div className="first-run__field">
            <label htmlFor="first-run-label">Name</label>
            <DesignInput id="first-run-label" value={label} disabled={busy} onChange={(e) => setLabel(e.currentTarget.value)} onKeyDown={onKey} aria-invalid={fieldErrors.label ? true : undefined} placeholder="My endpoint" aria-describedby={fieldErrors.label ? 'first-run-label-error' : undefined} />
            {fieldErrors.label && <span id="first-run-label-error" className="composer__error" role="alert">{fieldErrors.label}</span>}
          </div>
          <div className="first-run__field">
            <label htmlFor="first-run-url">Endpoint URL</label>
            <DesignInput id="first-run-url" className="input mono" value={baseUrl} disabled={busy} onChange={(e) => setBaseUrl(e.currentTarget.value)} onKeyDown={onKey} aria-invalid={fieldErrors.baseUrl ? true : undefined} placeholder="https://…/v1" aria-describedby={fieldErrors.baseUrl ? 'first-run-url-error' : undefined} />
            {fieldErrors.baseUrl && <span id="first-run-url-error" className="composer__error" role="alert">{fieldErrors.baseUrl}</span>}
          </div>
        </>)}
        <div className="first-run__field first-run__field--wide">
          <label htmlFor="first-run-key">API key</label>
          <DesignInput id="first-run-key" className="input mono" type="password" autoComplete="off" value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.currentTarget.value)} onKeyDown={onKey} aria-invalid={fieldErrors.apiKey ? true : undefined} aria-describedby={fieldErrors.apiKey ? 'first-run-key-error first-run-key-note' : 'first-run-key-note'} />
          {fieldErrors.apiKey && <span id="first-run-key-error" className="composer__error" role="alert">{fieldErrors.apiKey}</span>}
          <span id="first-run-key-note" className="first-run__field-note">{choice.custom ? 'Requests go to the endpoint URL above.' : choice.hint} The key is checked against the provider's model list, then stored on this machine.</span>
        </div>
      </div>
    )}
    {ask && (
      <div className="first-run__ask-row" role="group" aria-label={ask.kind === 'replace' ? 'Confirm replacement' : 'No models listed'}>
        <p role="alert">{ask.message}</p>
        <div className="first-run__actions">
          {ask.kind === 'replace'
            ? <><DesignButton variant="secondary" autoFocus onClick={() => setAsk(null)}>Keep the existing one</DesignButton><DesignButton variant="danger" onClick={() => { void submit({ replace: true }); }}>Replace it</DesignButton></>
            : <><DesignButton variant="secondary" autoFocus onClick={() => { void submit({ replace: true }); }}>Try again</DesignButton><DesignButton variant="secondary" onClick={() => { void submit({ replace: true, allowEmpty: true }); }}>Continue without models</DesignButton></>}
        </div>
      </div>
    )}
    {error && <p className="composer__error" role="alert" data-outcome="failed">{error}</p>}
    <div className="first-run__actions">
      <DesignButton variant="primary" data-action="connect" disabled={busy || !usable} onClick={() => { void submit(); }}>{busy ? 'Connecting…' : 'Connect'}</DesignButton>
      {authenticated.length > 0
        ? <DesignButton variant="ghost" data-action="cancel-add" disabled={busy} onClick={() => setAnother(false)}>Cancel</DesignButton>
        : <DesignButton variant="ghost" data-action="back" disabled={busy} onClick={onBack}>Back</DesignButton>}
      {busy && <span className="first-run__busy" role="status"><StatusDot state="run" pulse />Checking the key and reading the model list</span>}
    </div>
  </>);
}

function PromptStep({ titleId, heading, project, mode, onMode, text, onText: setText, leaving, onSend, onOpen, onBack }: StepProps & { project: string | null; mode: PermissionPreset; onMode: (mode: PermissionPreset) => void; text: string; onText: (text: string) => void; leaving: boolean; onSend: (text: string) => Promise<Result>; onOpen: () => Promise<Result>; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeOpen, setModeOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const startersId = useId();
  useLayoutEffect(() => { input.current?.focus(); }, []);
  const send = async () => {
    if (text.trim() === '' || busy || leaving) return;
    setBusy(true);
    setError(null);
    const r = await onSend(text);
    setBusy(false);
    if (!r.ok) setError(r.reason);
  };
  return (<>
    <StepHead titleId={titleId} heading={heading} title="Start your first run">Describe the work{project === null ? '' : <> for <strong>{project}</strong></>}. Agents plan it, do it and report back in the transcript.</StepHead>
    <form className="first-run__composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <DesignTextArea ref={input} className="first-run__prompt" rows={3} value={text} disabled={busy || leaving} aria-label="Your first prompt" placeholder="What should the agents do?"
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <div className="first-run__composer-foot">
        <span className="first-run__composer-hint">Enter sends, Shift+Enter starts a new line</span>
        <SendPill shortLabel={busy ? 'Starting' : 'Send'} sendName="Send the first prompt" disabled={text.trim() === '' || busy || leaving} data-action="send-first-prompt" />
      </div>
    </form>
    {error && <p className="composer__error" role="alert">{error}</p>}
    <div className="first-run__starters" role="group" aria-labelledby={startersId}>
      <span id={startersId} className="first-run__starters-label">Or start from one of these</span>
      {STARTER_PROMPTS.map((p) => <DesignButton key={p} variant="ghost" size="compact" icon="ph-arrow-up-left" className="first-run__starter" disabled={busy || leaving} onClick={() => { setText(p); input.current?.focus(); }}>{p}</DesignButton>)}
    </div>
    <div className="first-run__mode">
      <div className="first-run__mode-line">
        <p><strong>Runs are {MODE_LABELS[mode].toLowerCase()}.</strong> {MODE_HINTS[mode]}</p>
        <DesignButton variant="link" data-action="toggle-mode" aria-expanded={modeOpen} onClick={() => setModeOpen((o) => !o)}>{modeOpen ? 'Done' : 'Change'}</DesignButton>
      </div>
      {modeOpen && <SegmentedControl className="first-run__mode-pick" label="Permission mode" value={mode} onChange={(v) => onMode(v as PermissionPreset)} options={PERMISSION_PRESETS.map((p) => ({ value: p, label: MODE_LABELS[p] }))} />}
    </div>
    <div className="first-run__actions">
      <DesignButton variant="ghost" data-action="open-without-prompt" disabled={busy || leaving} onClick={() => { setError(null); void onOpen().then((r) => { if (!r.ok) setError(r.reason); }); }}>Open Rotaris without a prompt</DesignButton>
      <DesignButton variant="ghost" data-action="back" disabled={busy || leaving} onClick={onBack}>Back</DesignButton>
    </div>
  </>);
}
