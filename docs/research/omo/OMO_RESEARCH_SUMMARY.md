# Oh My OpenCode Research — Quick Reference

## Repository
- **URL**: https://github.com/code-yeongyu/oh-my-openagent
- **Latest**: 99ffb5f (2026-04-16)
- **Stars**: 52,096 | **Forks**: 4,188 | **Contributors**: 190
- **Language**: TypeScript (99.8%)

## The 11 Agents

### Orchestrators (Primary)
1. **Sisyphus** — Main orchestrator; plans, delegates, drives to completion
   - Models: Claude Opus 4.6 / Kimi K2.5 / GLM-5
   - File: `src/agents/sisyphus.ts` (562 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/sisyphus.ts

2. **Hephaestus** — Autonomous deep worker; end-to-end implementation
   - Model: GPT-5.4
   - File: `src/agents/hephaestus/agent.ts` (161 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/hephaestus/agent.ts

3. **Atlas** — Todo-list orchestrator; task execution
   - Model: Claude Sonnet 4.6
   - File: `src/agents/atlas/agent.ts`

### Consultants (Subagents)
4. **Oracle** — Read-only consultant; architecture & debugging
   - Model: GPT-5.4 (high)
   - File: `src/agents/oracle.ts` (277 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/oracle.ts
   - Key: Pragmatic minimalism, verbosity constraints, 3-tier response structure

5. **Librarian** — External docs/code search; GitHub + web search
   - Model: Minimax M2.7
   - File: `src/agents/librarian.ts` (320 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/librarian.ts
   - Key: TYPE A/B/C/D classification, documentation discovery, evidence-based answers

6. **Explore** — Contextual grep; fast codebase search
   - Model: Grok Code Fast 1
   - File: `src/agents/explore.ts`

7. **Metis** — Pre-planning consultant; intent analysis
   - Model: Claude Opus 4.6
   - File: `src/agents/metis.ts` (336 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/metis.ts
   - Key: Intent classification, AI-slop prevention, scope boundaries

8. **Momus** — Plan reviewer; executability verification
   - Model: GPT-5.4 (xhigh)
   - File: `src/agents/momus.ts` (347 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/momus.ts
   - Key: Approval bias, reference verification, blocking issues only

9. **Prometheus** — Strategic planner; interview-mode planning
   - Model: Claude Opus 4.6
   - File: `src/agents/prometheus/system-prompt.ts` (85 LOC)
   - GitHub: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/prometheus/system-prompt.ts
   - Key: Modular sections, model-specific variants

10. **Multimodal-Looker** — PDF/image analysis
    - Model: GPT-5.3-Codex
    - File: `src/agents/multimodal-looker.ts`

11. **Sisyphus-Junior** — Category-spawned executor
    - Model: Claude Sonnet 4.6
    - File: `src/agents/sisyphus-junior.ts`

## Core Architectural Patterns

### 1. Intent Gate (Phase 0)
Sisyphus classifies user intent BEFORE acting:
- Research/understanding → explore/librarian → synthesize → answer
- Implementation (explicit) → plan → delegate or execute
- Investigation → explore → report findings
- Evaluation → evaluate → propose → wait for confirmation
- Fix needed → diagnose → fix minimally
- Open-ended change → assess codebase first → propose approach

**Verbalization**: "I detect [intent] — [reason]. My approach: [routing]."

### 2. Dynamic Prompt Generation
Prompts built at runtime based on:
- Available agents
- Available tools
- Available skills
- Available categories
- Model type

**File**: `src/agents/dynamic-agent-prompt-builder.ts` (30 LOC)
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/dynamic-agent-prompt-builder.ts

**Core Builders**:
- `buildAgentIdentitySection()` — Override agent identity
- `buildKeyTriggersSection()` — Key triggers
- `buildToolSelectionTable()` — Tools by cost
- `buildExploreSection()` — Explore guidance
- `buildLibrarianSection()` — Librarian guidance
- `buildDelegationTable()` — Domain → agent mapping
- `buildOracleSection()` — Oracle usage rules
- `buildHardBlocksSection()` — What NOT to do
- `buildAntiPatternsSection()` — Common failures
- `buildCategorySkillsDelegationGuide()` — Category-skills mapping

### 3. Delegation Strategy
- Never work alone when specialists available
- Frontend work → visual-engineering category
- Deep research → parallel background agents
- Complex architecture → consult Oracle

**Delegation Table**:
- Architecture decisions → Oracle
- Self-review → Oracle
- Hard debugging → Oracle
- Unfamiliar packages → Librarian
- Contextual grep → Explore
- Autonomous deep work → Hephaestus
- Complex implementation → Hephaestus
- Strategic planning → Prometheus
- Pre-planning analysis → Metis
- Plan review → Momus
- Todo orchestration → Atlas
- Vision/PDF analysis → Multimodal-Looker

### 4. Tool Restrictions
Different agents have different permissions:

| Agent | Denied Tools |
|-------|-------------|
| Oracle | write, edit, task, call_omo_agent |
| Librarian | write, edit, task, call_omo_agent |
| Explore | write, edit, task, call_omo_agent |
| Multimodal-Looker | ALL except read |
| Atlas | task, call_omo_agent |
| Momus | write, edit, task |

### 5. Model Resolution (4-step)
1. Override (user-specified)
2. Category-default (task category)
3. Provider-fallback (provider's chain)
4. System-default (global default)

### 6. Parallel Execution
- Fire 5+ specialists in parallel
- Context stays lean (background agents)
- Results when ready
- No polling required (system notification)

## Key Prompt Engineering Patterns

### Oracle — Pragmatic Minimalism
**Decision Framework**:
- Bias toward simplicity
- Leverage what exists
- Prioritize developer experience
- One clear path
- Match depth to complexity
- Signal the investment (Quick/Short/Medium/Large)
- Know when to stop

**Output Verbosity** (strictly enforced):
- Bottom line: 2-3 sentences max
- Action plan: ≤7 steps, each ≤2 sentences
- Why this approach: ≤4 bullets
- Watch out for: ≤3 bullets
- Edge cases: Only when applicable; ≤3 bullets

**Response Structure** (3 tiers):
1. Essential: Bottom line + Action plan + Effort estimate
2. Expanded: Why this approach + Watch out for
3. Edge cases: Escalation triggers + Alternative sketch

### Librarian — Evidence-Based Answers
**Request Classification**:
- TYPE A: CONCEPTUAL → Doc Discovery + context7 + websearch
- TYPE B: IMPLEMENTATION → gh clone + read + blame
- TYPE C: CONTEXT → gh issues/prs + git log/blame
- TYPE D: COMPREHENSIVE → Doc Discovery + ALL tools

**Evidence Format**:
```markdown
**Claim**: [What you're asserting]

**Evidence** ([source](https://github.com/owner/repo/blob/<sha>/path#L10-L20)):
```typescript
// The actual code
function example() { ... }
```

**Explanation**: This works because [specific reason from the code].
```

### Metis — Intent-Specific Analysis
**Intent Types**:
- Refactoring → SAFETY: regression prevention
- Build from Scratch → DISCOVERY: explore patterns first
- Mid-sized Task → GUARDRAILS: exact deliverables
- Collaborative → INTERACTIVE: incremental clarity
- Architecture → STRATEGIC: long-term impact
- Research → INVESTIGATION: exit criteria

**AI-Slop Patterns to Flag**:
- Scope inflation: "Also tests for adjacent modules"
- Premature abstraction: "Extracted to utility"
- Over-validation: "15 error checks for 3 inputs"
- Documentation bloat: "Added JSDoc everywhere"

### Momus — Approval Bias
**Purpose**: "Can a capable developer execute this plan without getting stuck?"

**What You Check**:
1. Reference Verification (CRITICAL)
2. Executability Check (PRACTICAL)
3. Critical Blockers Only
4. QA Scenario Executability

**Decision Framework**:
- OKAY (default): Files exist, tasks have context, no contradictions
- REJECT (only for true blockers): File doesn't exist, task impossible, contradictions
- Maximum 3 issues per rejection

## Ultrawork Mode

**Command**: `ultrawork` or `ulw`

**What It Does**:
1. Activates Sisyphus (main orchestrator)
2. Fires all available agents in parallel
3. Doesn't stop until task is 100% complete
4. Parallel execution: research, implementation, verification
5. Context stays lean (background agents)
6. Results when ready

## Ralph Loop / Continuation

**Command**: `/ulw-loop` or `/ralph-loop`

**Behavior**:
- Continues until 100% done
- Self-referential: agent checks own work
- Doesn't stop halfway
- Verifies completion before exiting

## Hashline Edit Tool

**Problem**: Agents can't reliably reproduce content they've already seen.

**Solution**: Every line tagged with content hash:
```
11#VK| function hello() {
22#XJ|   return "world";
33#MB| }
```

**Benefits**:
- Agent edits by referencing hash tags
- If file changed, hash won't match
- Edit rejected before corruption
- No whitespace reproduction
- No stale-line errors

**Impact**: Success rate: **6.7% → 68.3%** (just from changing the edit tool)

## Hard Blocks (What NOT to do)

- NEVER start implementing without explicit user request
- NEVER create todos/tasks unless user explicitly asks
- NEVER assume implementation mode from prior turns
- NEVER work alone when specialists available
- NEVER skip Oracle for architecture decisions
- NEVER exceed defined scope
- NEVER invent new patterns when existing ones work
- NEVER add features not explicitly requested

## Anti-Duplication Rules

- NEVER duplicate existing code patterns
- NEVER re-implement what already exists
- NEVER create multiple versions of the same logic
- NEVER add redundant abstractions
- NEVER copy-paste code between files

## Configuration System

**Multi-Level Config**:
```
Project (.opencode/oh-my-opencode.jsonc)
    ↓
User (~/.config/opencode/oh-my-opencode.jsonc)
    ↓
Defaults
```

**Merge Strategy**:
- `agents`, `categories`, `claude_code`: deep merged recursively
- `disabled_*` arrays: Set union (concatenated + deduplicated)
- All other fields: override replaces base value

## Skill System

**Built-in Skills**:
- `playwright` — Browser automation
- `git-master` — Atomic commits, rebase/squash, history search
- `frontend-ui-ux` — Design-first UI development

**Three-Tier MCP System**:
| Tier | Source | Mechanism |
|------|--------|-----------|
| Built-in | `src/mcp/` | 3 remote HTTP: websearch (Exa/Tavily), context7, grep_app |
| Claude Code | `.mcp.json` | `${VAR}` env expansion |
| Skill-embedded | SKILL.md YAML | Managed by SkillMcpManager |

## Key Insights for Rotaris

### Architectural Patterns to Adopt
1. Dynamic prompt generation (runtime-based on available tools/skills)
2. Intent-based routing (classify before acting)
3. Delegation strategy (never work alone)
4. Tool restrictions (different agents, different permissions)
5. Skill-embedded MCPs (scoped, on-demand)
6. Anti-duplication & AI-slop prevention

### Prompt Engineering Patterns
1. Agent identity override (explicit statement)
2. Verbosity constraints (2-3 sentences max)
3. Decision frameworks (pragmatic minimalism)
4. Uncertainty handling (ask clarifying questions)
5. Model-specific optimization (Claude/GPT/Gemini variants)
6. Fallback chains (per-agent model chains)

### Model-Specific Optimization
- **Claude**: Modular sections, XML tags, principle-driven
- **GPT**: XML-tagged, principle-driven, aggressive tool-call enforcement
- **Gemini**: Aggressive tool-call enforcement, thinking checkpoints

## Repository Structure

```
oh-my-openagent/
├── src/agents/                          # 11 agent definitions
│   ├── sisyphus.ts                      # Main orchestrator (562 LOC)
│   ├── hephaestus/                      # Autonomous worker (variants)
│   ├── oracle.ts                        # Read-only consultant (277 LOC)
│   ├── librarian.ts                     # External search (320 LOC)
│   ├── explore.ts                       # Codebase grep
│   ├── metis.ts                         # Pre-planning (336 LOC)
│   ├── momus.ts                         # Plan reviewer (347 LOC)
│   ├── prometheus/                      # Strategic planner (modular)
│   ├── atlas/                           # Todo orchestrator
│   ├── multimodal-looker.ts             # Vision/PDF
│   ├── dynamic-agent-prompt-builder.ts  # Dynamic prompt system
│   ├── dynamic-agent-core-sections.ts   # Core sections
│   ├── dynamic-agent-policy-sections.ts # Policy sections
│   └── types.ts                         # Agent types
├── src/hooks/                           # 52 lifecycle hooks
├── src/tools/                           # 26 tools
├── src/features/                        # 19 feature modules
├── src/config/                          # Zod v4 schema system
├── src/mcp/                             # 3 built-in MCPs
├── docs/guide/                          # Architecture guides
└── AGENTS.md                            # Agent inventory
```

## GitHub Permalinks

| File | Purpose | Link |
|------|---------|------|
| Sisyphus | Main orchestrator | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/sisyphus.ts |
| Oracle | Read-only consultant | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/oracle.ts |
| Librarian | External search | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/librarian.ts |
| Metis | Pre-planning | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/metis.ts |
| Momus | Plan reviewer | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/momus.ts |
| Prometheus | Strategic planner | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/prometheus/system-prompt.ts |
| Hephaestus | Autonomous worker | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/hephaestus/agent.ts |
| Dynamic Prompt Builder | Prompt generation | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/dynamic-agent-prompt-builder.ts |
| Core Sections | Prompt sections | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/dynamic-agent-core-sections.ts |
| AGENTS.md | Agent inventory | https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/AGENTS.md |

---

## Full Research Document

See `OMO_AGENT_ARCHITECTURE_RESEARCH.md` for the complete 18-part deep dive covering:
- All 11 agents with full prompt content
- Dynamic prompt generation system
- Intent gate classification
- Delegation & orchestration
- Tool restrictions & permissions
- Skill system architecture
- Configuration system
- Hook system (52 lifecycle hooks)
- Hashline edit tool
- Anti-patterns & hard blocks
- Ultrawork mode & Ralph loop
- Real-world examples
- Configuration examples
- Key insights for Rotaris adaptation
