import { describe, expect, it } from 'vitest';
import { BUILT_IN_PERSONAS, DIRECT_WORK_INSTRUCTION, entryInstructionsFor, SWARM_INSTRUCTION, withRunOverride } from './personas.js';

describe('engine/personas — the entry role\'s instructions for its grant (OQ-202 as ruled, PD-ORCH-006; REQ-ORCH-016/029)', () => {
  const orchestrator = BUILT_IN_PERSONAS.orchestrator;

  it('a coordinator granted the direct-work bundle is told to do the work itself, and no longer that it modifies nothing', () => {
    const prompt = entryInstructionsFor(orchestrator.systemPrompt, 'direct-work', orchestrator);
    expect(prompt).toMatch(/^You are the orchestrator\. /);
    expect(prompt).toContain(DIRECT_WORK_INSTRUCTION);
    // The contradiction the ruling removes: the coordinating sentence is gone from the instructions of a run that grants the bundle.
    expect(prompt).not.toContain('you do not modify files or run commands yourself');
    expect(prompt).not.toContain('every work item reaches a specialist through the delegate tool');
    expect(prompt).toContain('ask_questions');
  });

  it('a coordinating run keeps the coordinating prompt: no grant, or no pre-flight', () => {
    expect(entryInstructionsFor(orchestrator.systemPrompt, 'none', orchestrator)).toBe(orchestrator.systemPrompt);
    expect(entryInstructionsFor(orchestrator.systemPrompt, null, orchestrator)).toBe(orchestrator.systemPrompt);
    expect(orchestrator.systemPrompt).toContain('you do not modify files or run commands yourself');
  });

  it('a prompt the configuration supplies is kept whole, with the instruction after it', () => {
    expect(entryInstructionsFor('Configured coordinator prompt.', 'direct-work', { coordinatorOnly: true })).toBe(`Configured coordinator prompt.\n\n${DIRECT_WORK_INSTRUCTION}`);
    expect(entryInstructionsFor('', 'direct-work', { coordinatorOnly: true })).toBe(DIRECT_WORK_INSTRUCTION);
  });

  it('an entry role that is not a coordinator keeps its prompt, granted or not', () => {
    const coder = BUILT_IN_PERSONAS['coding-agent'];
    expect(entryInstructionsFor(coder.systemPrompt, 'direct-work', coder)).toBe(coder.systemPrompt);
    expect(entryInstructionsFor('x', 'direct-work', null)).toBe('x');
  });
});

describe('engine/personas — the run override as the entry role\'s final layer (REQ-ORCH-025)', () => {
  const orchestrator = BUILT_IN_PERSONAS.orchestrator;
  const text = `${orchestrator.systemPrompt}\n\nPLAYBOOK`;

  it('a `swarm` run demands maximum parallel delegation after everything it was given, and keeps overlapping ownership forbidden', () => {
    expect(withRunOverride(text, 'swarm', 'none', orchestrator)).toBe(`${text}\n\n${SWARM_INSTRUCTION}`);
    expect(SWARM_INSTRUCTION).toMatch(/in parallel/);
    expect(SWARM_INSTRUCTION).toMatch(/never hold two implementation delegations for the same todo item/);
    expect(withRunOverride('', 'swarm', null, orchestrator)).toBe(SWARM_INSTRUCTION);
  });
  it('no override and `single` render nothing: `single` is a capability change, never advice', () => {
    expect(withRunOverride(text, null, 'none', orchestrator)).toBe(text);
    expect(withRunOverride(text, 'single', 'direct-work', orchestrator)).toBe(text);
  });
  it('an entry role that declares no `delegate` is never told to delegate', () => {
    expect(withRunOverride(text, 'swarm', 'none', BUILT_IN_PERSONAS['coding-agent'])).toBe(text);
    expect(withRunOverride(text, 'swarm', 'none', null)).toBe(text);
  });
  it('OQ-205\'s reading until it is ruled: a run granted the direct-work bundle carries no `swarm` text beside PD-ORCH-006\'s statement', () => {
    const granted = entryInstructionsFor(orchestrator.systemPrompt, 'direct-work', orchestrator);
    expect(withRunOverride(granted, 'swarm', 'direct-work', orchestrator)).toBe(granted);
    expect(granted).toContain(DIRECT_WORK_INSTRUCTION);
  });
});
