import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_TOOLS } from '@rotaris/contracts';
import { BUILT_IN_PERSONAS, DIRECT_WORK_INSTRUCTION, entryInstructionsFor, ROLE_VOCABULARY, ROUTING_WORK_SENTENCE, runOverrideLayer, SWARM_HEADING, SWARM_INSTRUCTION, SWARM_PLAN_HELD_NOTE } from './personas.js';

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

describe('engine/personas — the run override\'s layer of the entry role\'s instructions (REQ-ORCH-025)', () => {
  const orchestrator = BUILT_IN_PERSONAS.orchestrator;

  it('a `swarm` run demands maximum parallel delegation under its own heading, and keeps overlapping ownership forbidden', () => {
    expect(runOverrideLayer('swarm', 'none', orchestrator)).toBe(SWARM_INSTRUCTION);
    expect(runOverrideLayer('swarm', null, orchestrator)).toBe(SWARM_INSTRUCTION);
    expect(SWARM_INSTRUCTION.startsWith(`${SWARM_HEADING}\n\n`)).toBe(true);
    expect(SWARM_INSTRUCTION).toMatch(/in parallel/);
    expect(SWARM_INSTRUCTION).toMatch(/never hold two implementation delegations for the same todo item/);
  });
  it('"taking precedence over the matrix cell": the text says it overrides the playbook\'s CHUNKING and BUDGET guidance where they differ, within the limits the run enforces', () => {
    expect(SWARM_INSTRUCTION).toMatch(/last layer of your instructions and takes precedence over the playbook above/);
    expect(SWARM_INSTRUCTION).toMatch(/CHUNKING says to finish one milestone before starting the next/);
    expect(SWARM_INSTRUCTION).toMatch(/BUDGET says to delegate sparingly/);
    expect(SWARM_INSTRUCTION).toMatch(/within the child limits the run enforces/);
  });
  it('REQ-ORCH-153: while the plan gate holds the run the demand is pointed at the plan, not at spawning implementers the gate refuses', () => {
    expect(runOverrideLayer('swarm', 'none', orchestrator, true)).toBe(`${SWARM_INSTRUCTION}\n\n${SWARM_PLAN_HELD_NOTE}`);
    expect(runOverrideLayer('swarm', 'none', orchestrator, false)).not.toContain(SWARM_PLAN_HELD_NOTE);
  });
  it('no override and `single` render nothing: `single` is a capability change, never advice', () => {
    expect(runOverrideLayer(null, 'none', orchestrator)).toBe('');
    expect(runOverrideLayer('single', 'direct-work', orchestrator)).toBe('');
  });
  it('an entry role that declares no `delegate` is never told to delegate', () => {
    expect(runOverrideLayer('swarm', 'none', BUILT_IN_PERSONAS['coding-agent'])).toBe('');
    expect(runOverrideLayer('swarm', 'none', null)).toBe('');
  });
  it('PD-ORCH-006 revision 3 (OQ-205 as ruled, R-072): a run granted the direct-work bundle carries no `swarm` text beside the directive\'s statement, on any turn', () => {
    expect(runOverrideLayer('swarm', 'direct-work', orchestrator)).toBe('');
    expect(runOverrideLayer('swarm', 'direct-work', orchestrator, true)).toBe('');
  });
});

/**
 * OQ-212, ruled 2026-10-07 under the owner's delegation (R-072): no built-in role publishes. Publishing is a grant a workspace's
 * configuration makes with both keys REQ-CONFIG-106 names, so a built-in role that came to declare `artifact_write` or carry
 * the flag would be a decision, and this fails on it.
 */
describe('engine/personas — no built-in persona publishes (OQ-212; REQ-CONFIG-106, REQ-TOOLS-004, REQ-TOOLS-150)', () => {
  it('no built-in role declares `artifact_write`, in the contracts table or the persona table', () => {
    for (const [role, tools] of Object.entries(BUILT_IN_ROLE_TOOLS)) expect({ role, publishes: tools.includes('artifact_write') }).toEqual({ role, publishes: false });
    for (const [role, p] of Object.entries(BUILT_IN_PERSONAS)) expect({ role, publishes: p.tools.includes('artifact_write') }).toEqual({ role, publishes: false });
  });

  it('every built-in persona\'s `canPublishArtifacts` is false', () => {
    for (const [role, p] of Object.entries(BUILT_IN_PERSONAS)) expect({ role, flag: p.canPublishArtifacts }).toEqual({ role, flag: false });
  });
});

describe('engine/personas — the coordinator\'s routing table (REQ-ORCH-028)', () => {
  /*
   * REQ-ORCH-028's default routing carries two capability clauses the built table dropped, and in both duress live runs of
   * 2026-10-06 the coordinator gave `codebase-analyst` a write task
   * (docs/defects/fixed/the-built-routing-table-drops-req-orch-028s-capability-clauses.md; OQ-216).
   */
  it('names codebase-analyst as reading the workspace without modifying it, and librarian as likewise not modifying it', () => {
    const prompt = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
    expect(prompt).toContain('a question about the repository as it stands → codebase-analyst, which reads the workspace but does not modify it;');
    expect(prompt).toContain('→ librarian, which likewise does not modify the workspace;');
  });

  /*
   * PD-TOOLS-006 revision 8 (OQ-241, ruled 2026-10-07 under R-072): the table closes with one fixed sentence sending the work a
   * route implies to a persona whose catalogue entry allows it. In the duress run at a68f121 the coordinator gave architect
   * docs/decisions.md with a write_scope (call 115), as "design → architect" read
   * (docs/defects/fixed/the-routing-table-leads-the-coordinator-past-delegates-catalogue.md).
   */
  it('closes the routes with the revision 8 sentence, verbatim, after the last route', () => {
    const prompt = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
    expect(prompt).toContain(`final acceptance → verifier. ${ROUTING_WORK_SENTENCE}`);
    expect(ROUTING_WORK_SENTENCE).toBe("Each route names the persona whose judgement the need calls for; give the work itself to a persona whose entry in delegate's list allows it: a file to write, whether a design or decision document, a plan or a report, needs one that writes workspace files, and a test or other command to run needs one that runs commands. Where the route's persona lacks what the work needs, ask it for its answer and hand that answer to one that has it, through depends_on or inherited_context.");
  });

  it('the sentence names no persona of the vocabulary, so it stays true under every tools: override and delegates_to', () => {
    for (const role of ROLE_VOCABULARY) expect({ role, named: ROUTING_WORK_SENTENCE.includes(role) }).toEqual({ role, named: false });
  });

  it('the direct-work swap still replaces the built-in prompt, and a configured system_prompt carries neither the routes nor the sentence', () => {
    const direct = entryInstructionsFor(BUILT_IN_PERSONAS.orchestrator.systemPrompt, 'direct-work', BUILT_IN_PERSONAS.orchestrator);
    expect(direct).not.toContain(ROUTING_WORK_SENTENCE);
    expect(direct).not.toContain('Route work to specialists');
    const configured = entryInstructionsFor('You are a lead engineer.', 'none', BUILT_IN_PERSONAS.orchestrator);
    expect(configured).toBe('You are a lead engineer.');
  });
});
