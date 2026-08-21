# Agent Architecture Mapping: OMO (11 agents) → Rotaris (6 personas)

**Date:** 2026-04-16  
**Purpose:** Map OMO's 11-agent architecture to Rotaris's 6-persona model and identify gaps

---

## Overview

| OMO Agent | Role | Rotaris Equivalent | Status | Gap |
|-----------|------|----------------------|--------|-----|
| **Sisyphus** | Main orchestrator | `orchestrator` | ✅ Mapped | None |
| **Hephaestus** | Deep autonomous worker | `backend-dev` / `coding_agent` | ⚠️ Partial | Missing GPT-native autonomy |
| **Oracle** | Read-only pragmatist | N/A | ❌ Missing | No read-only consultant |
| **Librarian** | Evidence-based search | `librarian` | ⚠️ Minimal | Prompt too short (30 vs 320 LOC) |
| **Explore** | Codebase grep specialist | N/A | ❌ Missing | No dedicated grep agent |
| **Metis** | Pre-planning analyst | N/A | ❌ Missing | No pre-planning phase |
| **Momus** | Plan reviewer/approver | N/A | ❌ Missing | No quality gate agent |
| **Prometheus** | Modular planner | `planner` | ⚠️ Minimal | Prompt too short (47 vs 85 LOC) |
| **Atlas** | Todo/progress manager | N/A | ❌ Missing | No dedicated todo agent |
| **Multimodal-Looker** | Vision/PDF analyzer | N/A | ❌ Missing | No vision agent |
| **Sisyphus-Junior** | Category-spawned child | N/A | ❌ Missing | No category-based spawning |

---

## Detailed Mapping

### 1. Sisyphus → orchestrator ✅

**OMO Role:** Main orchestrator, tech lead, intent classifier, delegation coordinator

**Rotaris Equivalent:** `orchestrator` persona

**Alignment:**
- ✅ Intent classification gate (Phase 0)
- ✅ Phase-driven execution pipeline (Phases 0-5)
- ✅ Todo-driven workflow
- ✅ Delegation strategy
- ✅ Communication style rules
- ⚠️ Missing hard blocks section
- ⚠️ Missing anti-patterns enforcement

**OMO Prompt Size:** 562 LOC  
**Rotaris Prompt Size:** 88 lines  
**Gap:** Rotaris prompt is 6.4x shorter; missing detailed hard blocks and anti-patterns

**Recommendation:** Enhance orchestrator.md with:
1. Explicit hard blocks (NEVER start without request, NEVER duplicate, NEVER invent patterns)
2. Anti-patterns section (common mistakes to avoid)
3. Expanded phase descriptions with entry/exit conditions

---

### 2. Hephaestus → backend-dev / coding_agent ⚠️

**OMO Role:** Autonomous deep worker, GPT-native, end-to-end implementation without hand-holding

**Rotaris Equivalent:** `backend-dev` or `coding_agent` persona

**Alignment:**
- ✅ Implementation capability
- ✅ File editing (HAET or file_editor)
- ✅ Shell execution
- ✅ Git commit
- ⚠️ Missing GPT-native autonomy guidance
- ⚠️ Missing "end-to-end without hand-holding" philosophy

**OMO Prompt Size:** 161 LOC  
**Rotaris Prompt Size:** 2,311 bytes (coding_agent.md)  
**Gap:** Rotaris has more content but lacks GPT-specific autonomy guidance

**Recommendation:** Add model-specific variant for GPT models emphasizing:
1. Autonomous decision-making without asking for permission
2. End-to-end task completion
3. Minimal hand-holding expectations

---

### 3. Oracle → (MISSING) ❌

**OMO Role:** Read-only pragmatist, 3-tier response structure (essential/expanded/edge-cases), verbosity constraints

**Rotaris Equivalent:** None

**OMO Characteristics:**
- Read-only tools only (no file_editor, shell, git_commit)
- Pragmatic minimalism
- 3-tier response structure
- Verbosity constraints
- Verification bias

**Gap:** No read-only consultant persona in Rotaris

**Recommendation:** Create `oracle` persona with:
1. Read-only tools: grep, glob, find, fetch, haet_read
2. 3-tier response structure in prompt
3. Verbosity constraints
4. Pragmatic minimalism guidance

---

### 4. Librarian → librarian ⚠️

**OMO Role:** Evidence-based search, TYPE A/B/C/D classification, documentation discovery

**Rotaris Equivalent:** `librarian` persona

**Alignment:**
- ✅ Search capability
- ✅ Evidence-based reporting
- ⚠️ Missing TYPE A/B/C/D classification
- ⚠️ Missing documentation discovery protocol

**OMO Prompt Size:** 320 LOC  
**Rotaris Prompt Size:** 30 lines  
**Gap:** Rotaris prompt is 10.7x shorter; missing classification system and discovery protocol

**Recommendation:** Expand librarian.md with:
1. TYPE A/B/C/D classification system
2. Documentation discovery protocol (Phase 0.5)
3. Sitemap discovery workflow
4. Targeted investigation strategy

---

### 5. Explore → (MISSING) ❌

**OMO Role:** Codebase grep specialist, AST-aware pattern matching, fast code search

**Rotaris Equivalent:** None (partially via grep/glob tools)

**OMO Characteristics:**
- Specialized in codebase exploration
- AST-aware pattern matching
- Fast code search
- Symbol resolution
- Pattern discovery

**Gap:** No dedicated Explore persona; grep/glob are tools, not agents

**Recommendation:** Create `explore` persona with:
1. Specialized grep/glob/find tools
2. AST-aware pattern matching guidance
3. Symbol resolution strategy
4. Codebase navigation expertise

---

### 6. Metis → (MISSING) ❌

**OMO Role:** Pre-planning analyst, intent-specific analysis, AI-slop prevention

**Rotaris Equivalent:** None

**OMO Characteristics:**
- Pre-planning phase (before main planning)
- Intent-specific analysis
- AI-slop prevention
- Scope assessment
- Risk identification

**Gap:** No pre-planning phase or Metis persona

**Recommendation:** Create `metis` persona with:
1. Pre-planning analysis capability
2. Intent-specific scope assessment
3. AI-slop prevention guidance
4. Risk identification
5. Scope clarification

---

### 7. Momus → (MISSING) ❌

**OMO Role:** Plan reviewer, approval bias, blocking issues only, reference verification

**Rotaris Equivalent:** None

**OMO Characteristics:**
- Plan review and approval
- Approval bias (assume plan is good unless blocking issues found)
- Blocking issues only (don't nitpick)
- Reference verification
- Quality gate

**Gap:** No plan reviewer or quality gate agent

**Recommendation:** Create `momus` persona with:
1. Plan review capability
2. Approval bias guidance
3. Blocking issues identification
4. Reference verification
5. Quality gate enforcement

---

### 8. Prometheus → planner ⚠️

**OMO Role:** Modular planner, interview-mode protocol, model-specific variants

**Rotaris Equivalent:** `planner` persona

**Alignment:**
- ✅ Planning capability
- ✅ Structured plan output
- ⚠️ Missing interview-mode protocol
- ⚠️ Missing model-specific variants

**OMO Prompt Size:** 85 LOC  
**Rotaris Prompt Size:** 47 lines  
**Gap:** Rotaris prompt is shorter; missing interview-mode and model variants

**Recommendation:** Enhance planner.md with:
1. Interview-mode protocol (ask clarifying questions)
2. Model-specific variants (Claude vs GPT guidance)
3. Modular plan structure
4. Task breakdown with acceptance criteria

---

### 9. Atlas → (MISSING) ❌

**OMO Role:** Todo/progress manager, state tracking, iteration management

**Rotaris Equivalent:** Partially via `todo` tool

**OMO Characteristics:**
- Dedicated todo/progress management
- State tracking
- Iteration management
- Progress reporting

**Gap:** Todo is a tool, not an agent; no dedicated progress manager persona

**Recommendation:** Consider creating `atlas` persona for:
1. Todo state management
2. Progress tracking
3. Iteration coordination
4. State reporting

---

### 10. Multimodal-Looker → (MISSING) ❌

**OMO Role:** Vision/PDF analyzer, image understanding, document extraction

**Rotaris Equivalent:** None

**OMO Characteristics:**
- Vision/PDF analysis
- Image understanding
- Document extraction
- Multimodal reasoning

**Gap:** No vision or PDF analysis capability

**Recommendation:** Create `multimodal-looker` persona with:
1. Vision/PDF analysis capability
2. Image understanding
3. Document extraction
4. Multimodal reasoning

---

### 11. Sisyphus-Junior → (MISSING) ❌

**OMO Role:** Category-spawned child agent, specialized by task category

**Rotaris Equivalent:** None

**OMO Characteristics:**
- Spawned dynamically by category
- Specialized behavior per category
- Category-based routing

**Gap:** No category-based agent spawning

**Recommendation:** Implement category-based spawning:
1. Define categories (quick, deep, planning, research, etc.)
2. Map categories to personas
3. Spawn appropriate persona based on category
4. Inject category-specific guidance

---

## Persona Inventory Comparison

### OMO (11 Agents)

**Orchestrators (Primary):**
1. Sisyphus — Main orchestrator
2. Hephaestus — Deep worker
3. Atlas — Todo manager

**Consultants (Read-Only):**
4. Oracle — Pragmatic minimalist
5. Librarian — Evidence-based search
6. Explore — Codebase grep specialist
7. Multimodal-Looker — Vision/PDF

**Specialists:**
8. Metis — Pre-planning
9. Momus — Plan reviewer
10. Prometheus — Planner
11. Sisyphus-Junior — Category-spawned

### Rotaris (6 Personas)

**Orchestrators:**
1. orchestrator — Main orchestrator
2. backend-dev / coding_agent — Implementation

**Specialists:**
3. architect — Design decisions
4. planner — Plan synthesis
5. librarian — Search and report
6. tester — Test execution
7. docs_writer — Documentation
8. refactorer — Code cleanup

**Missing:**
- Oracle (read-only consultant)
- Explore (codebase specialist)
- Metis (pre-planning)
- Momus (plan reviewer)
- Atlas (todo manager)
- Multimodal-Looker (vision)
- Sisyphus-Junior (category-spawned)

---

## Implementation Priority

### Phase 1: Critical Quality Gates (High Priority)
1. **Momus** (plan reviewer) — Blocks implementation quality
2. **Metis** (pre-planning) — Blocks scope clarity
3. **Enhance Orchestrator** — Add hard blocks and anti-patterns

### Phase 2: Feature Parity (Medium Priority)
4. **Oracle** (read-only consultant) — Pragmatic analysis
5. **Explore** (codebase specialist) — Specialized search
6. **Enhance Librarian** — Add classification system
7. **Enhance Planner** — Add interview-mode

### Phase 3: Advanced Features (Low Priority)
8. **Atlas** (todo manager) — Progress coordination
9. **Multimodal-Looker** (vision) — PDF/image analysis
10. **Sisyphus-Junior** (category-spawned) — Dynamic spawning

---

## Summary

| Dimension | OMO | Rotaris | Gap |
|-----------|-----|-----------|-----|
| Total Agents | 11 | 6 | -5 agents |
| Orchestrators | 3 | 2 | -1 (missing Atlas) |
| Read-Only Consultants | 4 | 1 | -3 (missing Oracle, Explore, Multimodal-Looker) |
| Specialists | 4 | 6 | +2 (architect, tester, docs_writer, refactorer) |
| Intent Classification | ✅ | ✅ | None |
| Phase-Driven Pipeline | ✅ | ✅ | None |
| Plan Review Gate | ✅ (Momus) | ❌ | Missing |
| Pre-Planning Phase | ✅ (Metis) | ❌ | Missing |
| Vision/PDF Support | ✅ | ❌ | Missing |
| Category-Based Spawning | ✅ | ❌ | Missing |

