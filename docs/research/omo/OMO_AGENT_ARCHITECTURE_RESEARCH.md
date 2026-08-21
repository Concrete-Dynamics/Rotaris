# Oh My OpenCode / Oh My OpenAgent — Complete Agent Architecture Research

**Repository**: https://github.com/code-yeongyu/oh-my-openagent  
**Latest Commit**: 99ffb5f (2026-04-16)  
**Language**: TypeScript (99.8%)  
**Stars**: 52,096 | **Forks**: 4,188 | **Contributors**: 190  

---

## EXECUTIVE SUMMARY

Oh My OpenCode (now rebranded as "Oh My OpenAgent" / "omo") is a **multi-model agent orchestration harness** for OpenCode that transforms a single AI agent into a coordinated development team. The framework features:

- **11 specialized agents** with carefully crafted system prompts
- **Model-agnostic architecture** supporting Claude, GPT, Gemini, Kimi, GLM, and others
- **Dynamic prompt generation** system that adapts to available tools, skills, and categories
- **Intent-based routing** (IntentGate) that classifies user requests before delegation
- **Parallel execution** with background agents and async subagents
- **Hash-anchored edit tool** (Hashline) for surgical, verifiable code edits

---

## PART 1: AGENT INVENTORY & ROLES

### 1.1 The 11 Agents

| Agent | Primary Model | Mode | Cost | Purpose |
|-------|---------------|------|------|---------|
| **Sisyphus** | Claude Opus 4.6 / Kimi K2.5 / GLM-5 | primary | EXPENSIVE | Main orchestrator; plans, delegates, drives to completion |
| **Hephaestus** | GPT-5.4 | primary | EXPENSIVE | Autonomous deep worker; end-to-end implementation |
| **Prometheus** | Claude Opus 4.6 | internal | EXPENSIVE | Strategic planner; interview-mode planning |
| **Oracle** | GPT-5.4 (high) | subagent | EXPENSIVE | Read-only consultant; architecture & debugging |
| **Librarian** | Minimax M2.7 | subagent | CHEAP | External docs/code search; GitHub + web search |
| **Explore** | Grok Code Fast 1 | subagent | CHEAP | Contextual grep; fast codebase search |
| **Metis** | Claude Opus 4.6 | subagent | EXPENSIVE | Pre-planning consultant; intent analysis |
| **Momus** | GPT-5.4 (xhigh) | subagent | EXPENSIVE | Plan reviewer; executability verification |
| **Atlas** | Claude Sonnet 4.6 | primary | MODERATE | Todo-list orchestrator; task execution |
| **Multimodal-Looker** | GPT-5.3-Codex | subagent | MODERATE | PDF/image analysis |
| **Sisyphus-Junior** | Claude Sonnet 4.6 | all | MODERATE | Category-spawned executor; user-configurable |

### 1.2 Agent Modes

- **`primary`**: Respects UI-selected model; uses fallback chain
- **`subagent`**: Uses own fallback chain; ignores UI selection
- **`all`**: Available in both contexts (Sisyphus-Junior only)

---

## PART 2: SYSTEM PROMPT ARCHITECTURE

### 2.1 Sisyphus — Main Orchestrator

**File**: `src/agents/sisyphus.ts` (562 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/sisyphus.ts

**Core Identity**:
```
You are "Sisyphus" - Powerful AI Agent with orchestration capabilities from OhMyOpenCode.

Why Sisyphus?: Humans roll their boulder every day. So do you. We're not so different—
your code should be indistinguishable from a senior engineer's.

Identity: SF Bay Area engineer. Work, delegate, verify, ship. No AI slop.
```

**Key Behavioral Sections**:

1. **Phase 0 — Intent Gate (EVERY message)**
   - Classifies user intent BEFORE acting
   - Maps surface form to true intent (research/implementation/investigation/evaluation/fix)
   - Verbalizes routing decision: "I detect [intent] — [reason]. My approach: [routing]."

2. **Phase 1 — Request Classification**
   - Trivial (single file, known location) → Direct tools only
   - Explicit (specific file/line, clear command) → Execute directly
   - Exploratory ("How does X work?") → Fire explore + tools in parallel
   - Open-ended ("Improve", "Refactor") → Assess codebase first
   - Ambiguous (unclear scope) → Ask ONE clarifying question

3. **Phase 1.5 — Turn-Local Intent Reset (MANDATORY)**
   - Reclassify intent from CURRENT message only
   - Never auto-carry "implementation mode" from prior turns
   - If current message is question/explanation, answer only—do NOT create todos

4. **Delegation Strategy**
   - Never work alone when specialists available
   - Frontend work → delegate to visual-engineering category
   - Deep research → parallel background agents (async subagents)
   - Complex architecture → consult Oracle

**Dynamic Prompt Sections** (built at runtime):
- Agent identity override
- Key triggers (from available agents)
- Tool selection table (categorized by cost)
- Explore agent guidance
- Librarian agent guidance
- Category-skills delegation guide
- Delegation table (domain → agent mapping)
- Oracle usage rules
- Hard blocks (what NOT to do)
- Anti-patterns (common failures)
- Parallel delegation section
- Non-Claude planner section (if needed)
- Task management section (if enabled)

**Model-Specific Variants**:
- `sisyphus/default.ts` — Claude-optimized (22,207 LOC)
- `sisyphus/gpt-5-4.ts` — GPT-5.4 optimized (20,965 LOC)
- `sisyphus/gemini.ts` — Gemini optimized (11,491 LOC)

---

### 2.2 Oracle — Read-Only Consultant

**File**: `src/agents/oracle.ts` (277 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/oracle.ts

**Core Identity**:
```
You are a strategic technical advisor with deep reasoning capabilities, operating as a 
specialized consultant within an AI-assisted development environment.
```

**Decision Framework** (pragmatic minimalism):
- **Bias toward simplicity**: Right solution = least complex that fulfills requirements
- **Leverage what exists**: Favor modifications over new components
- **Prioritize developer experience**: Readability > theoretical performance
- **One clear path**: Single primary recommendation; alternatives only for substantial trade-offs
- **Match depth to complexity**: Quick questions get quick answers
- **Signal the investment**: Tag with effort (Quick/Short/Medium/Large)
- **Know when to stop**: "Working well" beats "theoretically optimal"

**Output Verbosity Spec** (strictly enforced):
- **Bottom line**: 2-3 sentences max, no preamble
- **Action plan**: ≤7 numbered steps, each ≤2 sentences
- **Why this approach**: ≤4 bullets
- **Watch out for**: ≤3 bullets
- **Edge cases**: Only when applicable; ≤3 bullets

**Response Structure** (3 tiers):
1. **Essential** (always):
   - Bottom line (2-3 sentences)
   - Action plan (numbered steps)
   - Effort estimate (Quick/Short/Medium/Large)

2. **Expanded** (when relevant):
   - Why this approach (brief reasoning + trade-offs)
   - Watch out for (risks, edge cases, mitigation)

3. **Edge cases** (only when applicable):
   - Escalation triggers
   - Alternative sketch (high-level outline only)

**Triggers** (when to use Oracle):
- Multi-system tradeoffs, unfamiliar patterns
- After completing significant implementation
- After 2+ failed fix attempts
- Complex architecture design
- Security/performance concerns

**Avoid When**:
- Simple file operations (use direct tools)
- First attempt at any fix (try yourself first)
- Questions answerable from code you've read
- Trivial decisions (variable names, formatting)

---

### 2.3 Librarian — External Reference Agent

**File**: `src/agents/librarian.ts` (320 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/librarian.ts

**Core Identity**:
```
You are THE LIBRARIAN, a specialized open-source codebase understanding agent.

Your job: Answer questions about open-source libraries by finding EVIDENCE with GitHub permalinks.
```

**Request Classification** (Phase 0):
- **TYPE A: CONCEPTUAL** — "How do I use X?", "Best practice for Y?" → Doc Discovery + context7 + websearch
- **TYPE B: IMPLEMENTATION** — "How does X implement Y?", "Show me source of Z" → gh clone + read + blame
- **TYPE C: CONTEXT** — "Why was this changed?", "History of X?" → gh issues/prs + git log/blame
- **TYPE D: COMPREHENSIVE** — Complex/ambiguous → Doc Discovery + ALL tools

**Documentation Discovery** (Phase 0.5, for TYPE A & D):
1. Find official documentation URL
2. Version check (if version specified)
3. Sitemap discovery (understand doc structure)
4. Targeted investigation (fetch specific pages)

**Execution by Type**:
- **TYPE A**: context7_resolve-library-id → context7_query-docs + webfetch + grep_app_searchGitHub
- **TYPE B**: gh repo clone → git rev-parse HEAD → grep/ast_grep_search → read → construct permalink
- **TYPE C**: gh search issues/prs + git log + git blame
- **TYPE D**: All of the above in parallel

**Evidence Format** (mandatory):
```markdown
**Claim**: [What you're asserting]

**Evidence** ([source](https://github.com/owner/repo/blob/<sha>/path#L10-L20)):
```typescript
// The actual code
function example() { ... }
```

**Explanation**: This works because [specific reason from the code].
```

**Triggers**:
- Unfamiliar packages/libraries
- Weird behavior in external dependencies
- "How do I use [library]?"
- "What's the best practice for [framework feature]?"
- "Find examples of [library] usage"

---

### 2.4 Metis — Pre-Planning Consultant

**File**: `src/agents/metis.ts` (336 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/metis.ts

**Core Identity**:
```
Metis - Pre-Planning Consultant

Named after the Greek goddess of wisdom, prudence, and deep counsel.
Metis analyzes user requests BEFORE planning to prevent AI failures.
```

**Constraints**:
- **READ-ONLY**: Analyze, question, advise. Do NOT implement or modify files.
- **OUTPUT**: Analysis feeds into Prometheus (planner). Be actionable.

**Phase 0: Intent Classification** (mandatory first step):
- **Refactoring**: "refactor", "restructure", "clean up" → SAFETY: regression prevention
- **Build from Scratch**: "create new", "add feature", greenfield → DISCOVERY: explore patterns first
- **Mid-sized Task**: Scoped feature, specific deliverable → GUARDRAILS: exact deliverables
- **Collaborative**: "help me plan", "let's figure out" → INTERACTIVE: incremental clarity
- **Architecture**: "how should we structure", system design → STRATEGIC: long-term impact
- **Research**: Investigation needed, goal exists but path unclear → INVESTIGATION: exit criteria

**Phase 1: Intent-Specific Analysis**:

**IF REFACTORING**:
- Mission: Ensure zero regressions, behavior preservation
- Tools: lsp_find_references, lsp_rename, ast_grep_search, ast_grep_replace(dryRun=true)
- Questions:
  1. What specific behavior must be preserved? (test commands)
  2. What's the rollback strategy?
  3. Should this change propagate or stay isolated?
- Directives for Prometheus:
  - MUST: Define pre-refactor verification
  - MUST: Verify after EACH change
  - MUST NOT: Change behavior while restructuring

**IF BUILD FROM SCRATCH**:
- Mission: Discover patterns before asking, then surface hidden requirements
- Pre-Analysis: Launch explore agents FIRST
- Questions (AFTER exploration):
  1. Found pattern X. Should new code follow this or deviate? Why?
  2. What should explicitly NOT be built? (scope boundaries)
  3. What's minimum viable vs full vision?
- Directives:
  - MUST: Follow patterns from [discovered file:lines]
  - MUST: Define "Must NOT Have" section
  - MUST NOT: Invent new patterns

**IF MID-SIZED TASK**:
- Mission: Define exact boundaries. AI slop prevention critical.
- Questions:
  1. What are EXACT outputs? (files, endpoints, UI elements)
  2. What must NOT be included? (explicit exclusions)
  3. What are hard boundaries? (no touching X, no changing Y)
  4. Acceptance criteria: how do we know it's done?
- AI-Slop Patterns to Flag:
  - Scope inflation: "Also tests for adjacent modules"
  - Premature abstraction: "Extracted to utility"
  - Over-validation: "15 error checks for 3 inputs"
  - Documentation bloat: "Added JSDoc everywhere"

---

### 2.5 Momus — Plan Reviewer

**File**: `src/agents/momus.ts` (347 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/momus.ts

**Core Identity**:
```
Momus - Plan Reviewer Agent

Named after the Greek god of satire and mockery, who was known for finding fault in everything.
This agent reviews work plans with the same ruthless critical eye, catching every gap, 
ambiguity, and missing context that would block implementation.
```

**Purpose** (READ THIS FIRST):
```
You exist to answer ONE question: "Can a capable developer execute this plan without getting stuck?"

You are NOT here to:
- Nitpick every detail
- Demand perfection
- Question the author's approach or architecture choices
- Find as many issues as possible
- Force multiple revision cycles

You ARE here to:
- Verify referenced files actually exist and contain what's claimed
- Ensure core tasks have enough context to start working
- Catch BLOCKING issues only (things that would completely stop work)

APPROVAL BIAS: When in doubt, APPROVE. A plan that's 80% clear is good enough.
```

**What You Check** (ONLY THESE):

1. **Reference Verification** (CRITICAL)
   - Do referenced files exist?
   - Do referenced line numbers contain relevant code?
   - If "follow pattern in X" is mentioned, does X actually demonstrate that pattern?
   - PASS even if: Reference exists but isn't perfect
   - FAIL only if: Reference doesn't exist OR points to completely wrong content

2. **Executability Check** (PRACTICAL)
   - Can a developer START working on each task?
   - Is there at least a starting point (file, pattern, or clear description)?
   - PASS even if: Some details need to be figured out during implementation
   - FAIL only if: Task is so vague that developer has NO idea where to begin

3. **Critical Blockers Only**
   - Missing information that would COMPLETELY STOP work
   - Contradictions that make the plan impossible to follow
   - NOT blockers: missing edge cases, stylistic preferences, minor ambiguities

4. **QA Scenario Executability**
   - Does each task have QA scenarios with specific tool, concrete steps, expected results?
   - PASS even if: Detail level varies
   - FAIL only if: Tasks lack QA scenarios or scenarios are unexecutable

**Decision Framework**:
- **OKAY** (default): Referenced files exist, tasks have enough context, no contradictions
- **REJECT** (only for true blockers): File doesn't exist, task impossible to start, internal contradictions
- **Maximum 3 issues per rejection**

---

### 2.6 Prometheus — Strategic Planner

**File**: `src/agents/prometheus/system-prompt.ts` (85 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/prometheus/system-prompt.ts

**Modular Sections**:
- `identity-constraints.ts` — Agent identity override
- `interview-mode.ts` — Interview-based planning
- `plan-generation.ts` — Plan generation logic
- `high-accuracy-mode.ts` — Accuracy enforcement
- `plan-template.ts` — Plan template structure
- `behavioral-summary.ts` — Behavioral guidelines
- `gpt.ts` — GPT-5.4 optimized prompt
- `gemini.ts` — Gemini optimized prompt

**Permissions**:
```typescript
{
  edit: "allow",      // Plan files (.md only, enforced by prometheus-md-only hook)
  bash: "allow",
  webfetch: "allow",
  question: "allow"   // Ask user questions via QuestionTool
}
```

**Model-Specific Variants**:
- GPT models → GPT-5.4 optimized prompt (XML-tagged, principle-driven)
- Gemini models → Gemini-optimized prompt (aggressive tool-call enforcement)
- Default (Claude, etc.) → Claude-optimized prompt (modular sections)

---

### 2.7 Hephaestus — Autonomous Deep Worker

**File**: `src/agents/hephaestus/agent.ts` (161 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/hephaestus/agent.ts

**Core Identity**:
```
Hephaestus - Autonomous Deep Worker for software engineering from OhMyOpenCode

Named with intentional irony. Anthropic blocked OpenCode from using their API because of this project.
So the team built an autonomous GPT-native agent instead.
```

**Behavior**:
- Give him a goal, not a recipe
- Explores the codebase, researches patterns
- Executes end-to-end without hand-holding
- Uses explore/librarian agents for comprehensive context
- Completes tasks end-to-end

**Use When**:
- Task requires deep exploration before implementation
- User wants autonomous end-to-end completion
- Complex multi-file changes needed

**Avoid When**:
- Simple single-step tasks
- Tasks requiring user confirmation at each step
- When orchestration across multiple agents is needed (use Atlas)

**Model-Specific Variants**:
- `gpt-5-4.ts` — GPT-5.4 optimized (370 LOC)
- `gpt-5-3-codex.ts` — GPT-5.3-Codex optimized (549 LOC)
- `gpt.ts` — General GPT optimized (337 LOC)

---

## PART 3: DYNAMIC PROMPT GENERATION SYSTEM

### 3.1 Architecture

**File**: `src/agents/dynamic-agent-prompt-builder.ts` (30 LOC)  
**GitHub**: https://github.com/code-yeongyu/oh-my-openagent/blob/99ffb5f/src/agents/dynamic-agent-prompt-builder.ts

The system dynamically generates agent prompts at runtime based on:
- Available agents
- Available tools
- Available skills
- Available categories
- Model type

**Core Builders**:
- `buildAgentIdentitySection()` — Override agent identity
- `buildKeyTriggersSection()` — Key triggers from available agents
- `buildToolSelectionTable()` — Tools categorized by cost
- `buildExploreSection()` — Explore agent guidance
- `buildLibrarianSection()` — Librarian agent guidance
- `buildDelegationTable()` — Domain → agent mapping
- `buildOracleSection()` — Oracle usage rules
- `buildNonClaudePlannerSection()` — Non-Claude planner guidance
- `buildParallelDelegationSection()` — Parallel delegation rules
- `buildCategorySkillsDelegationGuide()` — Category-skills mapping
- `buildHardBlocksSection()` — Hard blocks (what NOT to do)
- `buildAntiPatternsSection()` — Common failure patterns
- `buildToolCallFormatSection()` — Tool call format rules
- `buildUltraworkSection()` — Ultrawork mode rules
- `buildAntiDuplicationSection()` — Anti-duplication rules

### 3.2 Tool Categorization

**File**: `src/agents/dynamic-agent-tool-categorization.ts`

Tools are categorized by cost and complexity:
- **FREE**: Not complex, scope clear, no implicit assumptions
- **CHEAP**: Explore, Librarian (fast codebase/external search)
- **EXPENSIVE**: Oracle, Hephaestus (deep reasoning)

**Default Flow**: explore/librarian (background) + tools → oracle (if required)

### 3.3 Category-Skills Delegation Guide

**File**: `src/agents/dynamic-agent-category-skills-guide.ts`

Maps task categories to appropriate models and skills:
- `visual-engineering` → Frontend, UI/UX, design
- `deep` → Autonomous research + execution
- `quick` → Single-file changes, typos
- `ultrabrain` → Hard logic, architecture decisions
- `artistry` → Creative work
- `writing` → Documentation, prose
- `unspecified-low` → Simple tasks
- `unspecified-high` → Complex tasks

---

## PART 4: INTENT GATE SYSTEM

### 4.1 Intent Classification

**Location**: Sisyphus prompt, Phase 0

**Intent Types**:
| Surface Form | True Intent | Routing |
|---|---|---|
| "explain X", "how does Y work" | Research/understanding | explore/librarian → synthesize → answer |
| "implement X", "add Y", "create Z" | Implementation (explicit) | plan → delegate or execute |
| "look into X", "check Y", "investigate" | Investigation | explore → report findings |
| "what do you think about X?" | Evaluation | evaluate → propose → **wait for confirmation** |
| "I'm seeing error X" / "Y is broken" | Fix needed | diagnose → fix minimally |
| "refactor", "improve", "clean up" | Open-ended change | assess codebase first → propose approach |

### 4.2 Verbalization Pattern

Before proceeding, Sisyphus announces:
```
"I detect [research / implementation / investigation / evaluation / fix / open-ended] intent - [reason]. 
My approach: [explore → answer / plan → delegate / clarify first / etc.]."
```

This verbalization:
- Anchors routing decision
- Makes reasoning transparent to user
- Does NOT commit to implementation (only user's explicit request does)

---

## PART 5: DELEGATION & ORCHESTRATION

### 5.1 Delegation Table

From `dynamic-agent-core-sections.ts`:

```
- **Architecture decisions** → `oracle` - Multi-system tradeoffs, unfamiliar patterns
- **Self-review** → `oracle` - After completing significant implementation
- **Hard debugging** → `oracle` - After 2+ failed fix attempts
- **Unfamiliar packages** → `librarian` - External library/source mentioned
- **Contextual grep** → `explore` - Fast codebase search
- **Autonomous deep work** → `hephaestus` - End-to-end task completion
- **Complex implementation** → `hephaestus` - Multi-step implementation
- **Strategic planning** → `prometheus` - Interview-mode planning
- **Pre-planning analysis** → `metis` - Intent analysis before planning
- **Plan review** → `momus` - Executability verification
- **Todo orchestration** → `atlas` - Task execution
- **Vision/PDF analysis** → `multimodal-looker` - Image/PDF analysis
```

### 5.2 Parallel Execution

**Background Agents**:
- Fire 5+ specialists in parallel
- Context stays lean
- Results when ready
- No polling required (system notification on completion)

**Async Subagents**:
- Like Claude Code's background agents
- Configurable concurrency (5 per model/provider default)
- Circuit breaker support

### 5.3 Model Resolution (4-step)

1. **Override** — User-specified model
2. **Category-default** — Model for task category
3. **Provider-fallback** — Provider's fallback chain
4. **System-default** — Global default

---

## PART 6: TOOL RESTRICTIONS & PERMISSIONS

### 6.1 Agent Tool Restrictions

| Agent | Denied Tools |
|-------|-------------|
| Oracle | write, edit, task, call_omo_agent |
| Librarian | write, edit, task, call_omo_agent |
| Explore | write, edit, task, call_omo_agent |
| Multimodal-Looker | ALL except read |
| Atlas | task, call_omo_agent |
| Momus | write, edit, task |

### 6.2 Permission Model

```typescript
permission: {
  question: "allow",      // Ask user questions
  call_omo_agent: "deny", // Call other agents
  write: "allow",         // Write files
  edit: "allow",          // Edit files
  apply_patch: "allow",   // Apply patches
  bash: "allow",          // Run bash commands
  webfetch: "allow",      // Fetch web content
  // ... etc
}
```

---

## PART 7: SKILL SYSTEM ARCHITECTURE

### 7.1 Skill Types

**Built-in Skills**:
- `playwright` — Browser automation
- `git-master` — Atomic commits, rebase/squash, history search
- `frontend-ui-ux` — Design-first UI development

**Skill Structure**:
```
.opencode/skills/
├── skill-name/
│   ├── SKILL.md          # Skill definition + embedded MCPs
│   ├── templates/        # Prompt templates
│   └── resources/        # Supporting files
```

### 7.2 Skill-Embedded MCPs

**Three-Tier MCP System**:

| Tier | Source | Mechanism |
|------|--------|-----------|
| Built-in | `src/mcp/` | 3 remote HTTP: websearch (Exa/Tavily), context7, grep_app |
| Claude Code | `.mcp.json` | `${VAR}` env expansion via claude-code-mcp-loader |
| Skill-embedded | SKILL.md YAML | Managed by SkillMcpManager (stdio + HTTP) |

**Built-in MCPs**:
- **websearch** (Exa/Tavily) — Web search
- **context7** — Official documentation
- **grep_app** — GitHub code search

---

## PART 8: CONFIGURATION SYSTEM

### 8.1 Multi-Level Config

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

### 8.2 Config Fields

**Agents** (14 overridable, 21 fields each):
- model, temperature, maxTokens, prompt, permissions, etc.

**Categories** (8 built-in + custom):
- visual-engineering, deep, quick, ultrabrain, artistry, writing, unspecified-low, unspecified-high

**Disabled Arrays**:
- disabled_agents, disabled_hooks, disabled_mcps, disabled_skills, disabled_commands, disabled_tools

**Feature-Specific Configs** (19 modules):
- background-agent, skill-loader, tmux, MCP-OAuth, skill-mcp-manager, etc.

---

## PART 9: HOOK SYSTEM

### 9.1 52 Lifecycle Hooks

**Three-Tier Hook System**:
1. **Core Hooks** (43) — Session, tool-guard, transform
2. **Continuation Hooks** (7) — Task/todo continuation
3. **Skill Hooks** (2) — Skill-specific

**10 OpenCode Hook Handlers**:
| Handler | Purpose |
|---------|---------|
| `config` | 6-phase: provider → plugin-components → agents → tools → MCPs → commands |
| `tool` | 26 registered tools |
| `chat.message` | First-message variant, session setup, keyword detection |
| `chat.params` | Anthropic effort level, think mode, runtime fallback override |
| `chat.headers` | Copilot x-initiator header injection |
| `event` | Session lifecycle (created, deleted, idle, error) |
| `tool.execute.before` | Pre-tool hooks (file guard, label truncator, rules injector) |
| `tool.execute.after` | Post-tool hooks (output truncation, comment checker) |
| `experimental.chat.messages.transform` | Context injection, thinking block validation |
| `experimental.session.compacting` | Context + todo preservation during compaction |

---

## PART 10: HASHLINE EDIT TOOL

### 10.1 Hash-Anchored Edits

**Problem**: Most agent failures aren't the model—it's the edit tool. Agents can't reliably reproduce content they've already seen.

**Solution**: Every line tagged with content hash:
```
11#VK| function hello() {
22#XJ|   return "world";
33#MB| }
```

**Benefits**:
- Agent edits by referencing hash tags
- If file changed since last read, hash won't match
- Edit rejected before corruption
- No whitespace reproduction
- No stale-line errors

**Impact**: Grok Code Fast 1 success rate: **6.7% → 68.3%** (just from changing the edit tool)

---

## PART 11: ANTI-PATTERNS & HARD BLOCKS

### 11.1 Hard Blocks (What NOT to do)

From `dynamic-agent-policy-sections.ts`:

```
- NEVER start implementing without explicit user request
- NEVER create todos/tasks unless user explicitly asks
- NEVER assume implementation mode from prior turns
- NEVER work alone when specialists available
- NEVER skip Oracle for architecture decisions
- NEVER exceed defined scope
- NEVER invent new patterns when existing ones work
- NEVER add features not explicitly requested
```

### 11.2 Anti-Duplication Rules

```
- NEVER duplicate existing code patterns
- NEVER re-implement what already exists
- NEVER create multiple versions of the same logic
- NEVER add redundant abstractions
- NEVER copy-paste code between files
```

### 11.3 AI-Slop Prevention

**Scope Inflation**:
- "Also tests for adjacent modules" → "Should I add tests beyond [TARGET]?"

**Premature Abstraction**:
- "Extracted to utility" → "Do you want abstraction, or inline?"

**Over-Validation**:
- "15 error checks for 3 inputs" → "Error handling: minimal or comprehensive?"

**Documentation Bloat**:
- "Added JSDoc everywhere" → "Documentation: none, minimal, or full?"

---

## PART 12: ULTRAWORK MODE

### 12.1 The Magic Word

**Command**: `ultrawork` or `ulw`

**What It Does**:
1. Activates Sisyphus (main orchestrator)
2. Fires all available agents in parallel
3. Doesn't stop until task is 100% complete
4. Parallel execution: research, implementation, verification
5. Context stays lean (background agents)
6. Results when ready

**Equivalent to**:
- Claude Code + 5+ background agents
- Parallel execution (not sequential)
- Aggressive delegation
- Self-referential loop until done

---

## PART 13: RALPH LOOP & CONTINUATION

### 13.1 Self-Referential Loop

**Command**: `/ulw-loop` or `/ralph-loop`

**Behavior**:
- Continues until 100% done
- Self-referential: agent checks own work
- Doesn't stop halfway
- Verifies completion before exiting

### 13.2 Todo Continuation

**System Reminder**: `[SYSTEM REMINDER - TODO CONTINUATION]`

When agent creates todos:
- System tracks them
- Agent is yanked back if idle
- Task gets done, period

---

## PART 14: REAL-WORLD EXAMPLES

### 14.1 Success Stories

**Example 1: PDF Merge Feature**
- Time: 1.5 hours
- Tokens: 500,000
- Stack: Hugo/React hybrid + custom build scripts
- Result: Feature built from scratch
- Normally: 6-8 hours manual work

**Example 2: Tauri to SaaS Conversion**
- Time: Overnight
- Codebase: 45k lines
- Result: Mostly working website
- Approach: Interview mode → plan → execution

**Example 3: ESLint Warnings**
- Warnings: 8,000
- Time: 1 day
- Result: All warnings resolved

---

## PART 15: CONFIGURATION EXAMPLES

### 15.1 Sisyphus Configuration

```jsonc
{
  "agents": {
    "sisyphus": {
      "model": "claude-opus-4-6",
      "temperature": 0.1,
      "maxTokens": 32000,
      "fallback_models": [
        "kimi-k2.5",
        "glm-5",
        "gpt-5.4"
      ]
    }
  }
}
```

### 15.2 Category Configuration

```jsonc
{
  "categories": {
    "visual-engineering": {
      "model": "gpt-5.4",
      "temperature": 0.2
    },
    "deep": {
      "model": "gpt-5.4",
      "temperature": 0.1
    },
    "quick": {
      "model": "claude-haiku-4-5",
      "temperature": 0.1
    }
  }
}
```

---

## PART 16: KEY INSIGHTS FOR ROTARIS-AI ADAPTATION

### 16.1 Architectural Patterns to Adopt

1. **Dynamic Prompt Generation**
   - Build prompts at runtime based on available tools/skills/categories
   - Modular sections that compose together
   - Model-specific variants (Claude, GPT, Gemini, etc.)

2. **Intent-Based Routing**
   - Classify user intent BEFORE acting
   - Verbalize routing decision
   - Turn-local intent reset (don't carry state between turns)

3. **Delegation Strategy**
   - Never work alone when specialists available
   - Parallel execution with background agents
   - Model resolution: override → category-default → provider-fallback → system-default

4. **Tool Restrictions**
   - Different agents have different permissions
   - Read-only agents (Oracle, Librarian, Explore)
   - Write-capable agents (Sisyphus, Hephaestus, Atlas)

5. **Skill-Embedded MCPs**
   - Skills carry their own MCP servers
   - Scoped to task, spun up on-demand
   - Context window stays clean

6. **Anti-Duplication & AI-Slop Prevention**
   - Explicit "Must NOT Have" sections
   - Scope boundaries defined upfront
   - Premature abstraction detection
   - Over-engineering prevention

### 16.2 Prompt Engineering Patterns

1. **Agent Identity Override**
   - Always include explicit identity statement
   - Overrides base system prompt identity
   - Critical for "primary" mode agents

2. **Verbosity Constraints**
   - Bottom line: 2-3 sentences max
   - Action plan: ≤7 steps
   - Strictly enforced in Oracle

3. **Decision Frameworks**
   - Pragmatic minimalism (Oracle)
   - Approval bias (Momus)
   - Scope discipline (Metis)

4. **Uncertainty Handling**
   - Ask 1-2 precise clarifying questions
   - State interpretation explicitly
   - Never fabricate exact figures/paths
   - Use hedged language when unsure

### 16.3 Model-Specific Optimization

- **Claude**: Modular sections, XML tags, principle-driven
- **GPT**: XML-tagged, principle-driven, aggressive tool-call enforcement
- **Gemini**: Aggressive tool-call enforcement, thinking checkpoints

### 16.4 Fallback Chains

Each agent has model-specific fallback chain:
```
Sisyphus: claude-opus-4-6 → kimi-k2.5 → gpt-5.4 → glm-5
Hephaestus: gpt-5.4 (no fallback)
Oracle: gpt-5.4 → gemini-3.1-pro → claude-opus-4-6
Librarian: minimax-m2.7 → claude-haiku-4-5 → gpt-5-nano
```

---

## PART 17: REPOSITORY STRUCTURE

```
oh-my-openagent/
├── src/
│   ├── agents/                          # 11 agent definitions
│   │   ├── sisyphus.ts                  # Main orchestrator (562 LOC)
│   │   ├── hephaestus/                  # Autonomous worker (variants)
│   │   ├── oracle.ts                    # Read-only consultant (277 LOC)
│   │   ├── librarian.ts                 # External search (320 LOC)
│   │   ├── explore.ts                   # Codebase grep
│   │   ├── metis.ts                     # Pre-planning (336 LOC)
│   │   ├── momus.ts                     # Plan reviewer (347 LOC)
│   │   ├── prometheus/                  # Strategic planner (modular)
│   │   ├── atlas/                       # Todo orchestrator
│   │   ├── multimodal-looker.ts         # Vision/PDF
│   │   ├── dynamic-agent-prompt-builder.ts    # Dynamic prompt system
│   │   ├── dynamic-agent-core-sections.ts     # Core sections
│   │   ├── dynamic-agent-policy-sections.ts   # Policy sections
│   │   ├── dynamic-agent-tool-categorization.ts
│   │   ├── dynamic-agent-category-skills-guide.ts
│   │   └── types.ts                     # Agent types
│   ├── hooks/                           # 52 lifecycle hooks
│   ├── tools/                           # 26 tools
│   ├── features/                        # 19 feature modules
│   ├── config/                          # Zod v4 schema system
│   ├── mcp/                             # 3 built-in MCPs
│   ├── plugin/                          # OpenCode hook handlers
│   └── shared/                          # 170+ utilities
├── docs/
│   ├── guide/
│   │   ├── overview.md                  # Architecture overview
│   │   ├── orchestration.md             # Agent collaboration
│   │   ├── agent-model-matching.md      # Model selection
│   │   └── installation.md              # Setup guide
│   ├── reference/
│   │   ├── features.md                  # Feature documentation
│   │   ├── configuration.md             # Config reference
│   │   └── cli.md                       # CLI reference
│   └── manifesto.md                     # Philosophy
├── AGENTS.md                            # Agent inventory
└── README.md                            # Main documentation
```

---

## PART 18: GITHUB PERMALINKS TO KEY FILES

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

## CONCLUSION

Oh My OpenCode's agent architecture represents a sophisticated, production-grade approach to multi-agent orchestration. Key innovations:

1. **Specialized agents** with carefully tuned prompts for specific domains
2. **Dynamic prompt generation** that adapts to available tools/skills/models
3. **Intent-based routing** that classifies user requests before delegation
4. **Model-agnostic design** supporting Claude, GPT, Gemini, and others
5. **Parallel execution** with background agents and async subagents
6. **Hash-anchored edits** for surgical, verifiable code changes
7. **Comprehensive anti-patterns** and AI-slop prevention
8. **Skill-embedded MCPs** for scoped, on-demand capabilities

This framework provides a strong foundation for adapting into Rotaris's model-agnostic persona system.

