# Oh My OpenCode Research — Complete Index

## 📚 Documentation Files

This research package contains comprehensive documentation of the Oh My OpenCode (now "Oh My OpenAgent") framework's agent architecture.

### Files Included

1. **OMO_RESEARCH_SUMMARY.md** (15 KB, 397 lines)
   - Quick reference guide
   - All 11 agents at a glance
   - Core architectural patterns
   - Key prompt engineering patterns
   - Configuration system overview
   - GitHub permalinks to key files
   - **START HERE** for quick overview

2. **OMO_AGENT_ARCHITECTURE_RESEARCH.md** (36 KB, 1,009 lines)
   - Complete 18-part deep dive
   - Full system prompt content for each agent
   - Dynamic prompt generation system details
   - Intent gate classification system
   - Delegation & orchestration patterns
   - Tool restrictions & permissions
   - Skill system architecture
   - Configuration system details
   - Hook system (52 lifecycle hooks)
   - Hashline edit tool explanation
   - Anti-patterns & hard blocks
   - Ultrawork mode & Ralph loop
   - Real-world examples
   - Configuration examples
   - Key insights for Rotaris adaptation
   - **COMPREHENSIVE REFERENCE** for deep understanding

3. **OMO_RESEARCH_INDEX.md** (this file)
   - Navigation guide
   - Quick links to sections
   - How to use this research

---

## 🎯 Quick Navigation

### By Use Case

**I want to understand the architecture quickly**
→ Read: OMO_RESEARCH_SUMMARY.md (5-10 min read)

**I want to understand how agents work**
→ Read: OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 1-2 (Agent Inventory & System Prompts)

**I want to understand intent routing**
→ Read: OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 4 (Intent Gate System)

**I want to understand delegation**
→ Read: OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 5 (Delegation & Orchestration)

**I want to understand prompt generation**
→ Read: OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 3 (Dynamic Prompt Generation System)

**I want to adapt this for Rotaris**
→ Read: OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 16 (Key Insights for Rotaris Adaptation)

**I want to see the actual code**
→ Use GitHub permalinks in PART 18 (GitHub Permalinks to Key Files)

---

## 🔗 GitHub Repository

**Official Repository**: https://github.com/code-yeongyu/oh-my-openagent

**Latest Commit**: 99ffb5f (2026-04-16)

**Stats**:
- Stars: 52,096
- Forks: 4,188
- Contributors: 190
- Language: TypeScript (99.8%)

---

## 🤖 The 11 Agents

### Orchestrators (Primary)
1. **Sisyphus** — Main orchestrator; plans, delegates, drives to completion
2. **Hephaestus** — Autonomous deep worker; end-to-end implementation
3. **Atlas** — Todo-list orchestrator; task execution

### Consultants (Subagents)
4. **Oracle** — Read-only consultant; architecture & debugging
5. **Librarian** — External docs/code search; GitHub + web search
6. **Explore** — Contextual grep; fast codebase search
7. **Metis** — Pre-planning consultant; intent analysis
8. **Momus** — Plan reviewer; executability verification
9. **Prometheus** — Strategic planner; interview-mode planning
10. **Multimodal-Looker** — PDF/image analysis
11. **Sisyphus-Junior** — Category-spawned executor

---

## 🏗️ Core Architectural Patterns

### 1. Intent Gate (Phase 0)
Classifies user intent BEFORE acting:
- Research/understanding → explore/librarian → synthesize → answer
- Implementation (explicit) → plan → delegate or execute
- Investigation → explore → report findings
- Evaluation → evaluate → propose → wait for confirmation
- Fix needed → diagnose → fix minimally
- Open-ended change → assess codebase first → propose approach

### 2. Dynamic Prompt Generation
Prompts built at runtime based on:
- Available agents
- Available tools
- Available skills
- Available categories
- Model type

### 3. Delegation Strategy
- Never work alone when specialists available
- Frontend work → visual-engineering category
- Deep research → parallel background agents
- Complex architecture → consult Oracle

### 4. Tool Restrictions
Different agents have different permissions:
- Oracle: read-only (no write, edit, task, call_omo_agent)
- Librarian: read-only (no write, edit, task, call_omo_agent)
- Explore: read-only (no write, edit, task, call_omo_agent)
- Multimodal-Looker: read-only (only read allowed)
- Atlas: no task, call_omo_agent
- Momus: no write, edit, task

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

---

## 📋 Key Prompt Engineering Patterns

### Oracle — Pragmatic Minimalism
- Bias toward simplicity
- Leverage what exists
- Prioritize developer experience
- One clear path
- Match depth to complexity
- Signal the investment (Quick/Short/Medium/Large)
- Know when to stop

### Librarian — Evidence-Based Answers
- TYPE A: CONCEPTUAL → Doc Discovery + context7 + websearch
- TYPE B: IMPLEMENTATION → gh clone + read + blame
- TYPE C: CONTEXT → gh issues/prs + git log/blame
- TYPE D: COMPREHENSIVE → Doc Discovery + ALL tools

### Metis — Intent-Specific Analysis
- Refactoring → SAFETY: regression prevention
- Build from Scratch → DISCOVERY: explore patterns first
- Mid-sized Task → GUARDRAILS: exact deliverables
- Collaborative → INTERACTIVE: incremental clarity
- Architecture → STRATEGIC: long-term impact
- Research → INVESTIGATION: exit criteria

### Momus — Approval Bias
- Purpose: "Can a capable developer execute this plan without getting stuck?"
- OKAY (default): Files exist, tasks have context, no contradictions
- REJECT (only for true blockers): File doesn't exist, task impossible, contradictions

---

## 🚀 Special Features

### Ultrawork Mode
**Command**: `ultrawork` or `ulw`

Activates Sisyphus, fires all agents in parallel, doesn't stop until 100% complete.

### Ralph Loop / Continuation
**Command**: `/ulw-loop` or `/ralph-loop`

Continues until 100% done, self-referential, verifies completion before exiting.

### Hashline Edit Tool
Every line tagged with content hash:
```
11#VK| function hello() {
22#XJ|   return "world";
33#MB| }
```

Success rate improvement: **6.7% → 68.3%** (just from changing the edit tool)

---

## 🛑 Hard Blocks (What NOT to do)

- NEVER start implementing without explicit user request
- NEVER create todos/tasks unless user explicitly asks
- NEVER assume implementation mode from prior turns
- NEVER work alone when specialists available
- NEVER skip Oracle for architecture decisions
- NEVER exceed defined scope
- NEVER invent new patterns when existing ones work
- NEVER add features not explicitly requested

---

## 🔄 Anti-Duplication Rules

- NEVER duplicate existing code patterns
- NEVER re-implement what already exists
- NEVER create multiple versions of the same logic
- NEVER add redundant abstractions
- NEVER copy-paste code between files

---

## 🎓 Key Insights for Rotaris Adaptation

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

---

## 📖 How to Use This Research

### For Quick Understanding (15 minutes)
1. Read this index file
2. Read OMO_RESEARCH_SUMMARY.md
3. Skim the GitHub permalinks

### For Implementation (1-2 hours)
1. Read OMO_RESEARCH_SUMMARY.md
2. Read OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 1-5
3. Read OMO_AGENT_ARCHITECTURE_RESEARCH.md, PART 16 (Key Insights)
4. Review GitHub permalinks to actual code

### For Deep Mastery (4-6 hours)
1. Read all of OMO_AGENT_ARCHITECTURE_RESEARCH.md
2. Review all GitHub permalinks
3. Clone the repository and explore the code
4. Study the configuration system (PART 8)
5. Study the hook system (PART 9)

---

## 🔗 GitHub Permalinks to Key Files

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

## 📝 Document Metadata

**Research Date**: 2026-04-16  
**Repository Commit**: 99ffb5f  
**Repository URL**: https://github.com/code-yeongyu/oh-my-openagent  
**Total Documentation**: 51 KB, 1,406 lines  
**Format**: Markdown  

---

## 🎯 Next Steps

1. **Read OMO_RESEARCH_SUMMARY.md** for quick overview
2. **Review GitHub permalinks** to see actual code
3. **Read OMO_AGENT_ARCHITECTURE_RESEARCH.md** for deep understanding
4. **Adapt patterns** into Rotaris's model-agnostic framework
5. **Implement** agent personas with dynamic prompt generation
6. **Test** intent-based routing and delegation patterns

---

**Happy researching! 🚀**
