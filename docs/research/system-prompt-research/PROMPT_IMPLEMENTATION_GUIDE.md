# System Prompt Implementation Guide for Rotaris

This guide shows how to implement the top 10 innovative patterns in Rotaris.

---

## 1. Explicit Workflow Phases

### Implementation

Create a base system prompt with workflow phases:

```python
# src/rotaris_core/agents/prompts/base_system_prompt.py

BASE_SYSTEM_PROMPT = """You are a specialized AI agent within the Rotaris framework.

<ROLE>
Your primary role is to assist users by executing tasks, modifying code, and solving technical problems effectively.
</ROLE>

<PROBLEM_SOLVING_WORKFLOW>
1. EXPLORATION: Thoroughly explore relevant files and understand the context before proposing solutions
2. ANALYSIS: Consider multiple approaches and select the most promising one
3. PLANNING: Create a detailed plan using available tools to organize work
4. IMPLEMENTATION: Execute the plan with focused, minimal changes to address the problem
5. VERIFICATION: Test and validate your implementation thoroughly, including edge cases
</PROBLEM_SOLVING_WORKFLOW>

<EFFICIENCY>
* Each action you take is somewhat expensive. Combine multiple actions into a single action.
* When exploring the codebase, use efficient tools like grep, find, and git commands.
</EFFICIENCY>
"""
```

### Usage

```python
# src/rotaris_core/agents/factory.py

def create_agent(persona_name: str, model: str) -> Agent:
    """Create an agent with the base system prompt."""
    system_prompt = BASE_SYSTEM_PROMPT
    
    # Add persona-specific instructions
    if persona_name == "explorer":
        system_prompt += EXPLORER_ADDITIONS
    elif persona_name == "implementer":
        system_prompt += IMPLEMENTER_ADDITIONS
    
    return Agent(system_prompt=system_prompt, model=model)
```

---

## 2. Reflection Loop for Stuck States

### Implementation

Create a reflection prompt that's injected when an agent fails multiple times:

```python
# src/rotaris_core/agents/prompts/reflection_prompt.py

REFLECTION_PROMPT = """You have made multiple attempts to solve this problem but have not succeeded yet.
Let's take a step back and think systematically about this.

<TROUBLESHOOTING>
1. Reflect on 5-7 different possible sources of the problem:
   - Is the problem statement ambiguous or incomplete?
   - Are there missing dependencies or environment issues?
   - Is the approach fundamentally flawed?
   - Are there edge cases not being handled?
   - Is the implementation incomplete?
   - Are there integration issues with other components?
   - Is the testing methodology incorrect?

2. Assess the likelihood of each possible cause:
   - Which causes are most likely given what you've observed?
   - Which causes would explain all the failures?

3. Methodically address the most likely causes:
   - Start with the highest probability causes
   - For each cause, propose a specific test or investigation
   - Document your reasoning process

4. If you're still stuck after this analysis, ask for clarification or propose a different approach
</TROUBLESHOOTING>
"""

# src/rotaris_core/orchestrator/child_manager.py

class ChildManager:
    async def run_with_reflection(self, child_id: str, max_attempts: int = 3):
        """Run a child task with reflection on repeated failures."""
        attempts = 0
        last_error = None
        
        while attempts < max_attempts:
            try:
                result = await self.run_child(child_id)
                return result
            except Exception as e:
                attempts += 1
                last_error = e
                
                if attempts >= max_attempts - 1:
                    # Inject reflection prompt
                    await self.inject_prompt(child_id, REFLECTION_PROMPT)
                    # Continue with reflection
                    result = await self.run_child(child_id)
                    return result
```

---

## 3. Explicit Format Specification with Examples

### Implementation

Create format specifications for HAET edits:

```python
# src/rotaris_core/haet/prompts/format_specification.py

HAET_FORMAT_SPECIFICATION = """# HAET Edit Format Specification

Every HAET edit must use this exact format:

## Format Rules

1. **File Path**: The absolute file path on its own line
   - Example: `/home/user/project/src/main.py`
   - No quotes, no escaping, no markdown formatting

2. **Opening Fence**: Three backticks with language identifier
   - Example: ```python

3. **Search Block Header**: <<<<<<< SEARCH

4. **Search Content**: The exact lines to find (character-for-character match)
   - Include surrounding context for uniqueness
   - Must match existing file content exactly

5. **Divider**: =======

6. **Replace Content**: The new lines to insert
   - Can be empty for deletions
   - Can be new content for insertions

7. **Replace Block Footer**: >>>>>>> REPLACE

8. **Closing Fence**: ```

## Complete Example

/home/user/project/src/main.py
```python
<<<<<<< SEARCH
def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total
=======
def calculate_total(items):
    \"\"\"Calculate the total price of items.\"\"\"
    return sum(item.price for item in items)
>>>>>>> REPLACE
```

## Rules

- Every SEARCH section must EXACTLY MATCH the existing file content
- SEARCH/REPLACE blocks will only replace the first match occurrence
- Keep blocks concise - break large changes into multiple blocks
- Include just the changing lines plus a few surrounding lines for uniqueness
- Do not include long runs of unchanging lines

## Common Mistakes to Avoid

❌ WRONG: Including entire file in SEARCH section
✅ RIGHT: Include only the lines that need to change plus context

❌ WRONG: Approximate matching in SEARCH section
✅ RIGHT: Exact character-for-character matching

❌ WRONG: Multiple unrelated changes in one block
✅ RIGHT: One logical change per block

❌ WRONG: Relative file paths
✅ RIGHT: Absolute file paths
"""

# src/rotaris_core/agents/prompts/haet_prompts.py

HAET_SYSTEM_PROMPT = """You are a code editing agent. When making changes to files, you MUST use HAET format.

""" + HAET_FORMAT_SPECIFICATION + """

CRITICAL: ONLY EVER RETURN CODE IN A HAET BLOCK!
"""
```

---

## 4. Behavioral Correction Prompts

### Implementation

Create injectable behavioral prompts:

```python
# src/rotaris_core/agents/prompts/behavioral_prompts.py

THOROUGH_PROMPT = """You are thorough and methodical!
- Explore the codebase comprehensively before proposing solutions
- Consider multiple approaches and their trade-offs
- Test your implementation thoroughly
- Document your reasoning process
"""

FOCUSED_PROMPT = """Pay careful attention to the scope of the user's request.
- Do what they ask, but no more
- Do not improve, comment, fix or modify unrelated parts of the code
- Stay focused on the specific problem
- Avoid scope creep
"""

EFFICIENT_PROMPT = """Be efficient with your actions and token usage.
- Combine multiple actions into single commands
- Use efficient tools like grep and find
- Avoid exploratory actions unless necessary
- Keep responses concise
"""

# src/rotaris_core/agents/factory.py

def create_agent_with_behavior(
    persona_name: str,
    model: str,
    behavior: str = "balanced"  # "thorough", "focused", "efficient"
) -> Agent:
    """Create an agent with specific behavioral characteristics."""
    system_prompt = BASE_SYSTEM_PROMPT
    
    if behavior == "thorough":
        system_prompt += "\n\n" + THOROUGH_PROMPT
    elif behavior == "focused":
        system_prompt += "\n\n" + FOCUSED_PROMPT
    elif behavior == "efficient":
        system_prompt += "\n\n" + EFFICIENT_PROMPT
    
    return Agent(system_prompt=system_prompt, model=model)
```

---

## 5. Extension-Based Capability Discovery

### Implementation

Create dynamic tool discovery in prompts:

```python
# src/rotaris_core/agents/prompts/capability_discovery.py

def generate_capability_prompt(available_tools: list[dict]) -> str:
    """Generate a prompt that lists available tools dynamically."""
    tools_section = "# Available Tools\n\n"
    
    for tool in available_tools:
        tools_section += f"## {tool['name']}\n"
        tools_section += f"{tool['description']}\n"
        if tool.get('instructions'):
            tools_section += f"**Instructions**: {tool['instructions']}\n"
        tools_section += "\n"
    
    return f"""You have access to the following tools:

{tools_section}

Use these tools to complete your tasks efficiently.
"""

# src/rotaris_core/agents/factory.py

def create_agent_with_tools(
    persona_name: str,
    model: str,
    available_tools: list[dict]
) -> Agent:
    """Create an agent with dynamically discovered tools."""
    system_prompt = BASE_SYSTEM_PROMPT
    system_prompt += "\n\n" + generate_capability_prompt(available_tools)
    
    return Agent(system_prompt=system_prompt, model=model)
```

---

## 6. Subagent Pattern with Bounded Operation

### Implementation

Create subagent spawning with constraints:

```python
# src/rotaris_core/orchestrator/subagent.py

from dataclasses import dataclass

@dataclass
class SubagentConfig:
    """Configuration for a subagent."""
    task_instructions: str
    max_turns: int = 10
    timeout_seconds: int = 300
    can_spawn_subagents: bool = False

SUBAGENT_SYSTEM_PROMPT = """You are a specialized subagent within the Rotaris framework.
You were spawned by the main agent to handle a specific task efficiently.

<YOUR_ROLE>
- **Independence**: Make decisions and execute tools within your scope
- **Specialization**: Focus on specific tasks assigned by the main agent
- **Efficiency**: Use tools sparingly and only when necessary
- **Bounded Operation**: Operate within defined limits (turn count, timeout)
- **Security**: Cannot spawn additional subagents
</YOUR_ROLE>

<TASK_INSTRUCTIONS>
{task_instructions}
</TASK_INSTRUCTIONS>

<TOOL_USAGE_GUIDELINES>
**CRITICAL**: Be efficient with tool usage. Use tools only when absolutely necessary.

**Tool Efficiency Rules**:
- Use the minimum number of tools needed to complete your task
- Avoid exploratory tool usage unless explicitly required
- Stop using tools once you have sufficient information
- Provide clear, concise responses without excessive tool calls
</TOOL_USAGE_GUIDELINES>

**Maximum turns**: {max_turns}
**Timeout**: {timeout_seconds} seconds
"""

class SubagentManager:
    async def spawn_subagent(
        self,
        config: SubagentConfig,
        model: str
    ) -> str:
        """Spawn a subagent with bounded operation."""
        system_prompt = SUBAGENT_SYSTEM_PROMPT.format(
            task_instructions=config.task_instructions,
            max_turns=config.max_turns,
            timeout_seconds=config.timeout_seconds
        )
        
        subagent = Agent(system_prompt=system_prompt, model=model)
        
        # Run with constraints
        result = await asyncio.wait_for(
            subagent.run(),
            timeout=config.timeout_seconds
        )
        
        return result
```

---

## 7. Tool Efficiency Emphasis

### Implementation

Add efficiency constraints to prompts:

```python
# src/rotaris_core/agents/prompts/efficiency_prompts.py

TOOL_EFFICIENCY_PROMPT = """# Tool Usage Guidelines

**CRITICAL**: Be efficient with tool usage. Use tools only when absolutely necessary.

**Tool Efficiency Rules**:
- Use the minimum number of tools needed to complete your task
- Avoid exploratory tool usage unless explicitly required
- Stop using tools once you have sufficient information
- Provide clear, concise responses without excessive tool calls

**Examples of Efficient Tool Usage**:
✅ Use `grep -r "pattern" --include="*.py"` to search multiple files at once
✅ Use `find . -name "*.py" -type f` to locate files efficiently
✅ Combine multiple grep patterns into a single command
✅ Use git commands to understand history without reading individual files

**Examples of Inefficient Tool Usage**:
❌ Running the same command multiple times
❌ Exploring files one by one when grep could find them all
❌ Using tools to answer questions you already know the answer to
❌ Making exploratory tool calls without a specific purpose
"""

# src/rotaris_core/agents/factory.py

def create_efficient_agent(persona_name: str, model: str) -> Agent:
    """Create an agent optimized for efficiency."""
    system_prompt = BASE_SYSTEM_PROMPT
    system_prompt += "\n\n" + TOOL_EFFICIENCY_PROMPT
    
    return Agent(system_prompt=system_prompt, model=model)
```

---

## 8. Philosophy-Based Decision Making

### Implementation

Create a philosophy-based decision framework:

```python
# src/rotaris_core/agents/prompts/philosophy_prompts.py

ENGINEERING_PHILOSOPHY_PROMPT = """<ENGINEERING_PHILOSOPHY>

Your decisions should be guided by these core principles:

1. **Simplicity First**
   "If you need more than three levels of indentation, you're screwed and should fix your program."
   - Eliminate unnecessary complexity
   - Prefer simple solutions over clever ones
   - Refactor when complexity grows

2. **Pragmatism Over Theory**
   "Theory and practice sometimes clash. Theory loses. Every single time."
   - Solve real problems, not imaginary ones
   - Reject over-engineering
   - Focus on what works

3. **Backward Compatibility**
   "Never break userspace!"
   - Maintain compatibility with existing code
   - Consider the impact on users
   - Avoid breaking changes when possible

4. **Good Taste in Code**
   "Sometimes you can look at the problem from a different angle, rewrite it so that 
    special cases disappear and become normal cases."
   - Eliminate special cases through better design
   - Seek elegant solutions
   - Refactor to remove edge cases

# Decision Framework

Before making architectural decisions, ask yourself:

1. **Is this a real problem or an imagined one?**
   - Reject over-engineering
   - Focus on actual requirements

2. **Is there a simpler way?**
   - Always seek the simplest solution
   - Eliminate unnecessary abstractions

3. **What will it break?**
   - Consider backward compatibility
   - Assess impact on existing code

# Problem Decomposition

When analyzing a problem, work through these layers:

1. **Data Structure Analysis**
   "Bad programmers worry about the code. Good programmers worry about data structures."
   - What are the core data elements?
   - How are they related?
   - Can the data structure be simplified?

2. **Special Case Identification**
   "Good code has no special cases"
   - Identify all if/else branches
   - Which are real business logic?
   - Can the data structure be redesigned to remove these branches?

3. **Complexity Review**
   - What is the essence of the feature?
   - How many concepts does the solution use?
   - Can it be reduced by half?

4. **Breaking Change Analysis**
   - List all existing features that could be affected
   - Which dependencies would break?
   - How can we improve without breaking anything?

5. **Practicality Verification**
   - Does this problem actually exist?
   - How many users are truly affected?
   - Does the solution's complexity match the problem's severity?

</ENGINEERING_PHILOSOPHY>
"""

# src/rotaris_core/agents/factory.py

def create_architect_agent(model: str) -> Agent:
    """Create an agent with philosophy-based decision making."""
    system_prompt = BASE_SYSTEM_PROMPT
    system_prompt += "\n\n" + ENGINEERING_PHILOSOPHY_PROMPT
    
    return Agent(system_prompt=system_prompt, model=model)
```

---

## 9. File Trust Mechanism

### Implementation

Establish file authority in prompts:

```python
# src/rotaris_core/agents/prompts/file_trust_prompts.py

FILE_TRUST_PROMPT = """# File Authority and Trust

When working with files, understand the authority hierarchy:

1. **Current File Content** (Most Authoritative)
   - The actual content on disk is the source of truth
   - Always verify file content before making changes

2. **Provided File Content** (Authoritative)
   - When I provide file content in this conversation, trust it as the current state
   - This is the version you should edit

3. **Historical References** (Reference Only)
   - Previous mentions of files in this conversation may be outdated
   - Always verify against the current file content

## File Content Signals

When I say: "I have *added these files to the chat*"
- Trust this message as the true, current contents of the files
- Any other messages in the chat may contain outdated versions
- Use this content as the basis for your edits

## Verification Steps

Before editing a file:
1. Confirm the file path is correct
2. Verify the current content matches what you expect
3. Check for any recent changes
4. Ensure your edits will apply cleanly
"""

# src/rotaris_core/session/file_manager.py

class FileManager:
    def provide_file_content(self, file_path: str) -> str:
        """Provide file content with trust signal."""
        content = self.read_file(file_path)
        
        trust_signal = f"""I have *added this file to the chat* so you can see its current contents.

*Trust this message as the true contents of this file!*
Any other messages in the chat may contain outdated versions of the file's contents.

File: {file_path}
"""
        return trust_signal + "\n```\n" + content + "\n```"
```

---

## 10. Task Persistence Across Context Resets

### Implementation

Handle context window resets gracefully:

```python
# src/rotaris_core/session/task_persistence.py

TASK_PERSISTENCE_PROMPT = """<TASK_TRACKING_PERSISTENCE>

When your context is reset or summarized (a "condensation event"), maintain task continuity:

1. **Check for Task Tracking Sections**
   - Look for TASK_TRACKING sections in condensation summaries
   - These contain the current state of your work

2. **Resume from Where You Left Off**
   - If you were using task tracking before condensation, continue using it after
   - Restore the task list from the summary
   - Update task status as you continue

3. **Maintain Continuity**
   - Don't restart tasks that were already completed
   - Continue with tasks marked as "in_progress"
   - Add new tasks as you identify them

Example:
```
TASK_TRACKING:
- [x] Analyze requirements
- [x] Design solution
- [ ] Implement feature (in_progress)
- [ ] Test implementation
- [ ] Deploy changes
```

When resuming after condensation, continue with "Implement feature" and update status as you progress.

</TASK_TRACKING_PERSISTENCE>
"""

# src/rotaris_core/session/session_manager.py

class SessionManager:
    def create_condensation_summary(self, session_id: str) -> str:
        """Create a summary that preserves task tracking."""
        tasks = self.get_current_tasks(session_id)
        
        task_section = "TASK_TRACKING:\n"
        for task in tasks:
            status = "x" if task.completed else " "
            progress = f" ({task.status})" if task.status != "pending" else ""
            task_section += f"- [{status}] {task.name}{progress}\n"
        
        summary = self.generate_summary(session_id)
        
        return f"{summary}\n\n{task_section}"
    
    def resume_from_summary(self, summary: str) -> dict:
        """Extract task tracking from a summary."""
        # Parse TASK_TRACKING section
        tasks = []
        for line in summary.split('\n'):
            if line.startswith('- ['):
                # Parse task line
                completed = 'x' in line
                name = line.split('] ')[1]
                tasks.append({
                    'name': name,
                    'completed': completed
                })
        
        return {'tasks': tasks}
```

---

## Integration Example

Here's how to integrate all patterns into a complete agent:

```python
# src/rotaris_core/agents/advanced_agent.py

from rotaris_core.agents.prompts import (
    BASE_SYSTEM_PROMPT,
    HAET_FORMAT_SPECIFICATION,
    THOROUGH_PROMPT,
    TOOL_EFFICIENCY_PROMPT,
    ENGINEERING_PHILOSOPHY_PROMPT,
    FILE_TRUST_PROMPT,
    TASK_PERSISTENCE_PROMPT,
    REFLECTION_PROMPT
)

class AdvancedAgent:
    """Agent with all 10 innovative patterns integrated."""
    
    def __init__(self, model: str, available_tools: list[dict]):
        self.model = model
        self.available_tools = available_tools
        self.system_prompt = self._build_system_prompt()
    
    def _build_system_prompt(self) -> str:
        """Build comprehensive system prompt with all patterns."""
        prompt = BASE_SYSTEM_PROMPT
        
        # Pattern 1: Explicit workflow phases (already in BASE_SYSTEM_PROMPT)
        
        # Pattern 3: Explicit format specification
        prompt += "\n\n" + HAET_FORMAT_SPECIFICATION
        
        # Pattern 4: Behavioral correction prompts
        prompt += "\n\n" + THOROUGH_PROMPT
        
        # Pattern 5: Extension-based capability discovery
        prompt += "\n\n" + self._generate_capability_prompt()
        
        # Pattern 7: Tool efficiency emphasis
        prompt += "\n\n" + TOOL_EFFICIENCY_PROMPT
        
        # Pattern 8: Philosophy-based decision making
        prompt += "\n\n" + ENGINEERING_PHILOSOPHY_PROMPT
        
        # Pattern 9: File trust mechanism
        prompt += "\n\n" + FILE_TRUST_PROMPT
        
        # Pattern 10: Task persistence
        prompt += "\n\n" + TASK_PERSISTENCE_PROMPT
        
        return prompt
    
    def _generate_capability_prompt(self) -> str:
        """Generate capability discovery section."""
        tools_section = "# Available Tools\n\n"
        for tool in self.available_tools:
            tools_section += f"- **{tool['name']}**: {tool['description']}\n"
        return tools_section
    
    async def run(self, task: str) -> str:
        """Run the agent with all patterns integrated."""
        # Pattern 2: Reflection loop is handled by orchestrator
        # Pattern 6: Subagent pattern is handled by orchestrator
        
        return await self._execute_task(task)
```

---

## Testing the Patterns

```python
# tests/unit/agents/test_system_prompts.py

def test_workflow_phases_in_prompt():
    """Verify workflow phases are in system prompt."""
    agent = AdvancedAgent(model="gpt-4", available_tools=[])
    assert "EXPLORATION" in agent.system_prompt
    assert "ANALYSIS" in agent.system_prompt
    assert "IMPLEMENTATION" in agent.system_prompt
    assert "VERIFICATION" in agent.system_prompt

def test_haet_format_specification():
    """Verify HAET format is specified."""
    agent = AdvancedAgent(model="gpt-4", available_tools=[])
    assert "<<<<<<< SEARCH" in agent.system_prompt
    assert "=======" in agent.system_prompt
    assert ">>>>>>> REPLACE" in agent.system_prompt

def test_tool_efficiency_emphasis():
    """Verify tool efficiency is emphasized."""
    agent = AdvancedAgent(model="gpt-4", available_tools=[])
    assert "Tool Efficiency" in agent.system_prompt
    assert "minimum number of tools" in agent.system_prompt

def test_capability_discovery():
    """Verify tools are dynamically discovered."""
    tools = [
        {"name": "grep", "description": "Search files"},
        {"name": "find", "description": "Find files"}
    ]
    agent = AdvancedAgent(model="gpt-4", available_tools=tools)
    assert "grep" in agent.system_prompt
    assert "find" in agent.system_prompt
```

---

## Summary

These 10 patterns can be implemented incrementally:

1. **Week 1**: Patterns 1, 3, 9 (Workflow, Format, File Trust)
2. **Week 2**: Patterns 2, 4, 7 (Reflection, Behavioral, Efficiency)
3. **Week 3**: Patterns 5, 6, 10 (Capability, Subagent, Persistence)
4. **Week 4**: Pattern 8 (Philosophy) + Integration & Testing

Each pattern is independent and can be adopted separately, but together they create a comprehensive system prompt framework that rivals the best open-source agent systems.
