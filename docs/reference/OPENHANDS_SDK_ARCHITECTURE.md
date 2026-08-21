# OpenHands SDK Architecture & API Reference

**Local SDK Version:** 1.23.1 (installed in `.venv` during the June 3, 2026 audit)
**Project Constraint:** `openhands-sdk>=1.21.0,<2.0`, `openhands-tools>=1.21.0,<2.0`
**Python Requirement:** >=3.12
**License:** MIT
**Scope Note:** This is an external SDK reference snapshot, not canonical
Rotaris architecture. Rotaris currently depends on `openhands.sdk` and
`openhands.tools`; upstream workspace/server packages are optional SDK ecosystem
components, not project dependencies.

---

## DOCUMENTATION & RESOURCES

### Official Documentation
- **Main Docs:** https://docs.openhands.dev/sdk
- **API Reference Index:** https://docs.openhands.dev/llms.txt
- **GitHub Repository:** https://github.com/OpenHands/software-agent-sdk
- **PyPI Package:** https://pypi.org/project/openhands-sdk/

---

## I. SDK ECOSYSTEM PACKAGES

The upstream OpenHands SDK ecosystem is organized into these Python packages. In
this repository's current environment, `openhands.sdk` and `openhands.tools` are
installed; `openhands.workspace` and `openhands.agent_server` are upstream
deployment options rather than rotaris-cli runtime dependencies.

| Package | Purpose | Installation | Key Components |
|---------|---------|--------------|-----------------|
| **openhands.sdk** | Core agent framework + base workspace | `pip install openhands-sdk` | `Agent`, `LLM`, `Conversation`, `Tool`, `Workspace` |
| **openhands.tools** | Pre-built tools (bash, file editor, etc.) | `pip install openhands-tools` | `BashTool`, `FileEditorTool`, `GrepTool`, `BrowserTool` |
| **openhands.workspace** | Extended workspace implementations | `pip install openhands-workspace` | `DockerWorkspace`, `RemoteAPIWorkspace` |
| **openhands.agent_server** | FastAPI HTTP/WebSocket server for remote execution | `pip install openhands-agent-server` | Agent server for multi-user/Kubernetes |

### Two Deployment Modes

**Mode 1: Local Development** (Just use `openhands.sdk` + `openhands.tools`)
```python
from openhands.sdk import LLM, Agent, Conversation, LocalWorkspace

# Everything runs in-process
workspace = LocalWorkspace(working_dir="/path/to/project")
conversation = Conversation(agent=agent, workspace=workspace)
```

**Mode 2: Production/Sandboxed** (All 4 packages)
```python
from openhands.workspace import DockerWorkspace

# Isolated container execution
workspace = DockerWorkspace(image="ghcr.io/openhands/agent-server:main-python")
conversation = Conversation(agent=agent, workspace=workspace)
```

---

## II. CORE COMPONENTS & API SIGNATURES

### 1. LLM CONFIGURATION

**Module:** `openhands.sdk.llm`

#### LLM Class
```python
from openhands.sdk import LLM
from pydantic import SecretStr

class LLM(BaseModel):
    """Provider-agnostic language model interface with retry and telemetry."""
    
    # Required
    model: str                          # "anthropic/claude-sonnet-4-5-20250929" (LiteLLM format)
    api_key: SecretStr | None          # API credentials
    
    # Optional
    base_url: str | None               # Custom endpoint (e.g., LiteLLM proxy)
    usage_id: str | None               # Unique identifier for metrics tracking
    api_version: str | None            # For Azure/other providers
    num_retries: int = 3               # Retry attempts on transient errors
    
    # LLM-specific configs
    max_input_tokens: int | None       # Override model's max input
    max_output_tokens: int | None      # Override model's max output
    custom_tokenizer: str | None       # Custom tokenization for accurate token counting
    
    # Extended thinking (for supported models)
    enable_encrypted_reasoning: bool = False
    extended_thinking_budget: int | None
    
    # Advanced
    drop_params: bool = False          # Drop unsupported parameters
    modify_params: bool = False        # Modify unsupported parameters
    caching_prompt: bool = False       # Enable prompt caching
    
    @property
    def metrics(self) -> Metrics       # Token usage, costs, latency
    
    def completion(
        self,
        messages: list[Message],
        tools: list[ChatCompletionToolParam] | None = None,
        **kwargs
    ) -> LLMResponse:
        """Generate a completion from the language model."""
        
    @classmethod
    def subscription_login(
        cls,
        vendor: str,  # "openai" for ChatGPT Plus/Pro
        model: str    # e.g., "gpt-5.2-codex"
    ) -> LLM:
        """OAuth login for subscription-based access."""
```

#### LLMRegistry
```python
from openhands.sdk import LLMRegistry

registry = LLMRegistry()

# Add LLMs
main_llm = LLM(model="anthropic/claude-sonnet-4-5-20250929", api_key=key, usage_id="agent")
registry.add(main_llm)

# Retrieve
retrieved = registry.get("agent")  # Returns LLM by usage_id

# List available
ids = registry.list_usage_ids()  # ["agent", "critic", ...]
```

#### LLM Message Format
```python
from openhands.sdk import Message, TextContent, ImageContent

# Create messages for LLM
messages = [
    Message(
        role="user",  # "user", "assistant", "system", "tool"
        content=[
            TextContent(text="What should I do?"),
            ImageContent(url="https://...", type="image/png")  # multimodal
        ]
    ),
    Message(role="assistant", content=[TextContent(text="I'll help...")])
]

# LLM completes with tool calls
response = llm.completion(messages=messages, tools=[...])
# response.message contains response content with tool calls
```

---

### 2. AGENT CREATION & CONFIGURATION

**Module:** `openhands.sdk.agent`

#### Agent Class
```python
from openhands.sdk import Agent, Tool, AgentContext

class Agent(AgentBase):
    """Main agent implementation for OpenHands."""
    
    # Required
    llm: LLM                                   # Language model
    
    # Tools
    tools: list[Tool | ToolDefinition] = []   # Available tools
    filter_tools_regex: str | None = None      # Regex to filter tools
    include_default_tools: list[str] = []      # Built-in tools (e.g., ["think", "finish"])
    
    # Context & Prompts
    agent_context: AgentContext | None        # Skills and prompts
    system_prompt_filename: str = "system_prompt_template.md"
    security_policy_filename: str = "security_policy.md"
    
    # History Compression
    condenser: CondenserBase | None           # Optional history condenser
    
    # Security
    security_analyzer: SecurityAnalyzerBase | None
    
    # MCP Integration
    mcp_config: dict[str, Any] = {}           # Model Context Protocol config
    
    # Model Context Protocol servers example:
    # mcp_config = {
    #     "mcpServers": {
    #         "fetch": {
    #             "command": "uvx",
    #             "args": ["mcp-server-fetch"]
    #         }
    #     }
    # }
    
    def step(self) -> None:
        """Execute one reasoning-action loop step.
        
        This involves:
        1. Query LLM with event history
        2. Parse LLM response into actions
        3. Check if confirmation needed
        4. Execute tools and create observations
        5. Update conversation state
        """
    
    def init_state(self, state: ConversationState) -> None:
        """Initialize conversation state with system prompt."""
    
    @property
    def system_message(self) -> str:
        """Static system prompt (can be cached)."""
    
    @property
    def dynamic_context(self) -> str | None:
        """Per-conversation context (repo info, runtime config, etc.)."""
    
    @property
    def tools_map(self) -> dict[str, ToolDefinition]:
        """Initialized tools map."""
```

#### AgentContext (for skills and prompts)
```python
from openhands.sdk import AgentContext
from openhands.sdk.context import Skill

context = AgentContext(
    skills=[
        Skill(
            name="domain_knowledge",
            content="You are a Python expert...",
            trigger=None  # Always active
        ),
        Skill(
            name="special_behavior",
            content="When you see 'refactor', think about...",
            trigger="refactor"  # Keyword-triggered
        )
    ],
    system_message_prefix="You are helpful...",
    system_message_suffix="Always explain your reasoning.",
)

agent = Agent(llm=llm, agent_context=context)
```

---

### 3. CONVERSATION MANAGEMENT

**Module:** `openhands.sdk.conversation`

#### Conversation Factory (Auto-selects Local vs Remote)
```python
from openhands.sdk import Conversation

# Automatically returns LocalConversation or RemoteConversation
conversation = Conversation(
    agent=agent,
    workspace="/path/to/project",  # str or Workspace instance
    
    # Callbacks for event handling
    callbacks=[lambda event: print(event)],
    
    # Persistence
    persistence_dir="/tmp/conversations/conv1",
    conversation_id=UUID("..."),
    
    # Execution control
    max_iteration_per_run=20,
    stuck_detection=True,
    
    # Security
    confirmation_policy_active=False,  # Require approval before tool execution
)

# Send message
conversation.send_message("Create a README.md with project summary")
# -or- 
from openhands.sdk import Message, TextContent
conversation.send_message(Message(
    role="user",
    content=[TextContent(text="...")]
))

# Execute agent until finished/paused
conversation.run()

# State access
state: ConversationState = conversation.state
print(f"Status: {state.execution_status}")  # IDLE, RUNNING, FINISHED, ERROR, STUCK
print(f"Events: {len(state.events)}")

# Multi-threaded operations
response = conversation.ask_agent("Quick question?")  # Doesn't affect state, thread-safe

# Pause/resume
conversation.pause()
conversation.run()  # Resumes

# Get statistics
stats = conversation.conversation_stats
print(f"Token cost: ${stats.get_combined_metrics().accumulated_cost}")
```

#### ConversationState (Internal State Structure)
```python
from openhands.sdk.conversation import ConversationState, ConversationExecutionStatus

class ConversationState(BaseModel):
    id: UUID                           # Unique conversation ID
    agent: AgentBase                   # Agent instance
    workspace: BaseWorkspace           # Execution environment
    
    # Event history (immutable append-only)
    events: EventLog                   # All events in order
    
    # Execution state
    execution_status: ConversationExecutionStatus  # IDLE, RUNNING, FINISHED, etc.
    max_iterations: int                # Limit iterations per run
    stuck_detection: bool              # Enable loop detection
    
    # Persistence
    persistence_dir: str | None        # Save state to disk
    
    # Security
    security_analyzer: SecurityAnalyzerBase | None
    confirmation_policy: ConfirmationPolicyBase | None
    
    # Services
    secret_registry: SecretRegistry    # Environment variable management
    stats: ConversationStats           # Metrics
```

#### Execution Status Enum
```python
from openhands.sdk import ConversationExecutionStatus

class ConversationExecutionStatus(str, Enum):
    IDLE = 'idle'                          # Before any run
    RUNNING = 'running'                    # Agent is executing
    FINISHED = 'finished'                  # Task complete (terminal)
    WAITING_FOR_CONFIRMATION = 'waiting_for_confirmation'  # Awaiting action approval
    PAUSED = 'paused'                      # Paused between steps
    ERROR = 'error'                        # Error occurred (terminal)
    STUCK = 'stuck'                        # Detected repetition (terminal)
    DELETING = 'deleting'                  # Cleanup in progress
    
    def is_terminal(self) -> bool:         # True if FINISHED, ERROR, STUCK
        pass
```

---

### 4. TOOL SYSTEM & CUSTOM TOOLS

**Module:** `openhands.sdk.tool`

#### Tool Registration
```python
from openhands.sdk import Tool, ToolDefinition, register_tool, resolve_tool

# By name (resolved from registry)
tools = [
    Tool(name="BashTool"),
    Tool(name="FileEditorTool"),
]

# Programmatically
register_tool("MyTool", MyToolDefinition)  # class or factory function
resolve_tool("MyTool")  # Returns ToolDefinition

# List all
from openhands.sdk import list_registered_tools
all_tools = list_registered_tools()
```

#### Creating Custom Tools (3 Core Components)

**Step 1: Define Action (Input Schema)**
```python
from openhands.sdk import Action
from pydantic import Field

class GrepAction(Action):
    """Input parameters for grep tool."""
    pattern: str = Field(description="Regex to search for")
    path: str = Field(default=".", description="Directory path")
    include: str | None = Field(default=None, description="Glob filter (*.py)")
```

**Step 2: Define Observation (Output Schema)**
```python
from openhands.sdk import Observation, TextContent
from typing import Sequence

class GrepObservation(Observation):
    """Output from grep tool."""
    matches: list[str] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)
    count: int = 0
    
    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        """Format for LLM consumption."""
        return [TextContent(text=f"Found {self.count} matches...")]
```

**Step 3: Define Executor (Business Logic)**
```python
from openhands.sdk import ToolExecutor

class GrepExecutor(ToolExecutor[GrepAction, GrepObservation]):
    def __init__(self, working_dir: str):
        self.working_dir = working_dir
    
    def __call__(
        self,
        action: GrepAction,
        conversation=None
    ) -> GrepObservation:
        """Execute tool logic."""
        # Search files, return results
        return GrepObservation(matches=[...], count=N)
    
    # Optional cleanup
    def close(self):
        pass
```

**Step 4: Create ToolDefinition (Two Patterns)**

**Pattern 1: Stateless (Simple)**
```python
from openhands.sdk import ToolDefinition

# Direct instantiation
think_tool = ToolDefinition(
    name="think",
    description="Reason about next steps",
    action_type=ThinkAction,
    observation_type=ThinkObservation,
    executor=ThinkExecutor()  # Stateless
)
```

**Pattern 2: Stateful with Factory (Recommended)**
```python
class GrepTool(ToolDefinition[GrepAction, GrepObservation]):
    @classmethod
    def create(
        cls,
        conv_state: ConversationState,
        working_dir: str | None = None
    ) -> Sequence[ToolDefinition]:
        """Factory method receives conversation state."""
        wd = working_dir or conv_state.workspace.working_dir
        executor = GrepExecutor(working_dir=wd)
        return [
            cls(
                name="grep",
                description="Search files with regex",
                action_type=GrepAction,
                observation_type=GrepObservation,
                executor=executor
            )
        ]

# Register factory
register_tool("GrepTool", GrepTool)

# Use by name
tools = [Tool(name="GrepTool")]
```

#### Built-in Tools Available
```python
from openhands.tools import (
    BashTool,              # Execute bash commands
    FileEditorTool,        # Edit files
    GrepTool,              # Search files
    TerminalTool,          # Interactive terminal
    TaskTrackerTool,       # Track tasks
    BrowserTool,           # Web browsing
    DelegateTool,          # Sub-agent delegation
)

# Or use preset
from openhands.tools.preset import get_default_tools
tools = get_default_tools(enable_browser=False)
```

---

### 5. MODEL CONTEXT PROTOCOL (MCP) INTEGRATION

**Module:** `openhands.sdk.mcp`

#### Configuring MCP Servers
```python
from openhands.sdk import Agent

agent = Agent(
    llm=llm,
    tools=[...],
    mcp_config={
        "mcpServers": {
            "fetch": {
                "command": "uvx",
                "args": ["mcp-server-fetch"]
            },
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
            }
        }
    }
)
```

#### MCP Tool Types
```python
from openhands.sdk import MCPToolDefinition, MCPToolObservation

# MCP tools are auto-discovered and added to tools_map during agent.initialize()
# They appear alongside native tools in agent execution
# Schema validation happens lazily when tool is called

# Access MCP client directly
from openhands.sdk import MCPClient
client = MCPClient(config={...})
```

---

### 6. MULTI-AGENT SCENARIOS

**Module:** `openhands.sdk.subagent`, `openhands.tools.delegate`

#### Sub-Agent Delegation Pattern
```python
from openhands.tools import DelegateTool

# Register the delegate tool
register_tool("DelegateTool", DelegateTool)

# Add to agent
tools = [Tool(name="DelegateTool")]
agent = Agent(llm=llm, tools=tools)

# Agent can then spawn and delegate to sub-agents via tool calls:
# 1. Spawn: {"command": "spawn", "ids": ["research", "implementation"]}
# 2. Delegate: {"command": "delegate", "tasks": {"research": "Find X", "implementation": "Build Y"}}
# 3. Results are consolidated and returned to main agent
```

#### Registering Custom Sub-Agent Types
```python
from openhands.sdk import register_agent

def create_research_agent(llm: LLM) -> Agent:
    """Factory function for research sub-agent."""
    return Agent(
        llm=llm,
        tools=[...],
        agent_context=AgentContext(
            skills=[Skill(name="research", content="Focus on finding...")]
        )
    )

register_agent(
    name="research_agent",
    factory_func=create_research_agent,
    description="Specialized research sub-agent"
)
```

---

### 7. WORKSPACE & EXECUTION ENVIRONMENTS

**Module:** `openhands.sdk.workspace`, `openhands.workspace`

#### Workspace Types
```python
from openhands.sdk import Workspace, LocalWorkspace
from openhands.workspace import DockerWorkspace, RemoteAPIWorkspace

# Automatic selection
workspace = Workspace(working_dir="/project")  # Returns LocalWorkspace

# Local execution (in-process)
local = LocalWorkspace(working_dir="/project")

# Docker sandboxed (requires openhands.workspace)
docker = DockerWorkspace(
    image="ghcr.io/openhands/agent-server:main-python",
    working_dir="/project"
)

# Remote API (requires openhands.workspace)
remote = RemoteAPIWorkspace(
    runtime_api_url="https://runtime.eval.all-hands.dev",
    runtime_api_key="your-key",
    working_dir="/project"
)

# Execute commands
result = workspace.execute_command("ls -la", timeout=30.0)
# result.stdout, result.stderr, result.exit_code
```

#### BaseWorkspace Interface
```python
class BaseWorkspace(ABC):
    working_dir: str
    
    def execute_command(
        self,
        command: str,
        cwd: str | None = None,
        timeout: float = 30.0
    ) -> CommandResult:
        """Execute bash command."""
        pass
    
    def read_file(self, file_path: str) -> str:
        """Read file contents."""
        pass
    
    def write_file(self, file_path: str, content: str) -> None:
        """Write file."""
        pass
    
    def close(self) -> None:
        """Cleanup resources."""
        pass
```

---

## III. EVENT SYSTEM & CONVERSATION FLOW

**Module:** `openhands.sdk.event`

### Event Types
```python
from openhands.sdk.event import (
    Event,                    # Base class
    UserMessage,              # User input
    SystemPromptEvent,        # System instructions
    MessageEvent,             # LLM response
    ActionEvent,              # Tool call
    ObservationEvent,         # Tool result
    MessageToolCall,          # Parsed tool call
    ErrorEvent,               # Execution error
    FinishAction,             # Task complete
    TokenEvent,               # Streaming tokens
)

# All events inherit from Event and include:
# - id: UUID
# - timestamp: datetime
# - source: str (e.g., "agent", "user")

# Callback pattern
def event_handler(event: Event):
    if isinstance(event, ActionEvent):
        print(f"Agent doing: {event.action}")
    elif isinstance(event, ObservationEvent):
        print(f"Result: {event.observation}")

conversation.callbacks.append(event_handler)
```

### Reasoning-Action Loop Flow
```
1. User sends message → UserMessage event
2. Conversation appends to event log
3. Agent.step() called:
   a. Read event history (condenser may compress old events)
   b. Query LLM with messages
   c. Parse LLM response into ActionEvent(s)
   d. If confirmation needed: set WAITING_FOR_CONFIRMATION, return
   e. Execute tool → ObservationEvent
   f. If tool says finish: set FINISHED, return
   g. Otherwise: return (next step called by Conversation)
4. Loop until FINISHED or error
```

---

## IV. BUILT-IN TOOLS (openhands.tools)

### Available Tools
```python
# All available in openhands.tools

BashTool                 # Execute bash, python, node commands
FileEditorTool          # Create, edit, delete files
GrepTool                # Search file contents with regex
GlobTool                # Find files by pattern
BrowserTool             # Web browsing + interaction
TerminalTool            # Interactive CLI (ipython, python REPL)
TaskTrackerTool         # Track tasks in conversation
DelegateTool            # Multi-agent delegation
SleepTool               # Pause execution
```

### Creating Default Agent with Tools
```python
from openhands.tools.preset import get_default_tools, get_default_agent

# Get tools
tools = get_default_tools(enable_browser=True)

# Or get preset agent (simpler)
agent = get_default_agent(llm=llm, cli_mode=True)
```

---

## V. LIFECYCLE & PERSISTENCE

### Conversation Lifecycle
```python
# 1. Create
conv = Conversation(agent=agent, workspace="/project")

# 2. Initialize (automatic on first run)
# - Creates system prompt
# - Initializes tools
# - Sets up event log

# 3. Run loop
for i in range(max_runs):
    conv.send_message("Do something")
    conv.run()
    if conv.state.execution_status.is_terminal():
        break

# 4. Persistence
# - ConversationState persists to disk
# - Events stored in append-only log
# - Can resume with same conversation ID

# 5. Cleanup
conv.close()  # Cleanup tool executors, close workspace
```

### State Persistence
```python
# Save conversation
conv.state.save_to_file("/tmp/conv.json")

# Resume from persistence
from openhands.sdk.conversation import ConversationState
persisted = ConversationState.load_from_file("/tmp/conv.json")

# Or via factory (validates agent tools match)
state = ConversationState.create(
    id=UUID("..."),
    agent=agent,  # Must have same tools as persisted
    workspace="/project",
    persistence_dir="/tmp/conv",
)
```

---

## VI. PRACTICAL EXAMPLE: FULL WORKFLOW

```python
#!/usr/bin/env python3
"""Complete example: Create an agent and run a task."""

import os
from openhands.sdk import (
    LLM, Agent, Conversation, Tool,
    LLMRegistry, AgentContext, Message, TextContent
)
from openhands.sdk.context import Skill
from openhands.tools import BashTool, FileEditorTool
from pydantic import SecretStr

# 1. Configure LLM
llm = LLM(
    model="anthropic/claude-sonnet-4-5-20250929",
    api_key=SecretStr(os.getenv("LLM_API_KEY")),
    usage_id="main_agent"
)

# 2. Create registry (optional, for multi-agent scenarios)
registry = LLMRegistry()
registry.add(llm)

# 3. Create agent context with skills
context = AgentContext(
    skills=[
        Skill(
            name="python_expert",
            content="You are excellent at Python. Always prefer clean, pythonic code.",
            trigger=None  # Always active
        )
    ]
)

# 4. Create agent with tools
agent = Agent(
    llm=llm,
    tools=[
        Tool(name="BashTool"),
        Tool(name="FileEditorTool"),
    ],
    agent_context=context,
)

# 5. Create conversation
conversation = Conversation(
    agent=agent,
    workspace="/tmp/project",
    callbacks=[lambda e: print(f"Event: {e}")],  # Optional event tracking
)

# 6. Send message and run
conversation.send_message(
    "Create a Python script that lists all files in the current directory "
    "and write the output to a file called 'files.txt'"
)
conversation.run()

# 7. Check results
print(f"Final status: {conversation.state.execution_status}")
print(f"Total events: {len(conversation.state.events)}")
print(f"Cost: ${conversation.conversation_stats.get_combined_metrics().accumulated_cost}")

# 8. Cleanup
conversation.close()
```

---

## VII. ORCHESTRATION LAYER DESIGN PATTERNS

### For Your CLI Multi-Agent Framework

#### Pattern 1: Sequential Orchestration
```python
class SequentialOrchestrator:
    def __init__(self, agents: dict[str, Agent]):
        self.agents = agents
    
    def run(self, task: str, context: dict) -> str:
        """Run task through agent chain."""
        result = context
        for agent_id, agent in self.agents.items():
            conv = Conversation(agent=agent, workspace=context["workspace"])
            conv.send_message(f"{task}\n\nContext: {result}")
            conv.run()
            result = conv.state.events[-1]  # Get last event as result
        return result
```

#### Pattern 2: Parallel Delegation
```python
from threading import Thread

class ParallelOrchestrator:
    def __init__(self, agents: dict[str, Agent]):
        self.agents = agents
    
    def run(self, tasks: dict[str, str], workspace: str) -> dict[str, str]:
        """Run tasks in parallel, gather results."""
        results = {}
        
        def run_task(agent_id, task):
            conv = Conversation(agent=self.agents[agent_id], workspace=workspace)
            conv.send_message(task)
            conv.run()
            results[agent_id] = conv.state.events[-1]
        
        threads = [
            Thread(target=run_task, args=(aid, task))
            for aid, task in tasks.items()
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        return results
```

#### Pattern 3: Dynamic Agent Selection
```python
class SmartOrchestrator:
    def __init__(self, llm: LLM, registry: LLMRegistry):
        self.llm = llm
        self.registry = registry
    
    def select_agent_for_task(self, task: str) -> Agent:
        """Use LLM to pick best agent."""
        response = self.llm.completion(messages=[
            Message(role="user", content=[
                TextContent(text=f"Which agent should handle: {task}? Options: research, coding, testing")
            ])
        ])
        choice = response.message.content[0].text
        # Map to agent
        return self.agents.get(choice)
```

---

## VIII. DEPENDENCIES & REQUIREMENTS

### Core Dependencies
```
python = ">=3.12"
litellm = "==1.80.10"  # LLM provider abstraction (OpenAI, Anthropic, etc.)
pydantic = ">=2.12.5"   # Data validation
httpx = ">=0.27.0"      # HTTP client
tenacity = ">=9.1.2"    # Retry logic
websockets = ">=12"     # WebSocket support
fastmcp = ">=3.0.0"     # Model Context Protocol client
agent-client-protocol = ">=0.8.1"  # Agent communication protocol
```

### LiteLLM Provider Support
```python
# All major providers supported via LiteLLM (litellm.ai):
# - OpenAI (gpt-4, gpt-5, etc.)
# - Anthropic (claude-3-sonnet, claude-sonnet-4-5, etc.)
# - Google (gemini-pro, etc.)
# - Azure (azure/deployment-name)
# - AWS Bedrock (bedrock/model-id)
# - Together AI
# - Replicate
# - Cohere
# - And 30+ more providers

# Model naming: "provider/model-name"
# e.g.: "openai/gpt-4", "anthropic/claude-sonnet-4-5-20250929"
```

---

## IX. PERFORMANCE & SCALING CONSIDERATIONS

### Token Counting & Costs
```python
# Track metrics
metrics = llm.metrics
print(f"Input tokens: {metrics.input_tokens}")
print(f"Output tokens: {metrics.output_tokens}")
print(f"Accumulated cost: ${metrics.accumulated_cost}")

# Cost per model varies - check LiteLLM pricing
```

### Conversation Compression
```python
from openhands.sdk import LLMSummarizingCondenser

# Automatic history compression when approaching token limits
condenser = LLMSummarizingCondenser(
    llm=llm,
    max_tokens_to_condense=1000,  # Trigger at 1k tokens
)

agent = Agent(llm=llm, condenser=condenser)
```

### Stuck Detection
```python
# Automatic loop detection
conversation = Conversation(
    agent=agent,
    stuck_detection=True,
    stuck_detection_thresholds={
        'action_observation': 3,   # Same action-observation cycle 3x
        'action_error': 3,         # Same action-error cycle 3x
        'monologue': 5,            # 5 messages without user input
        'alternating_pattern': 3,  # Alternating cycle 3x
    }
)
```

---

## X. TROUBLESHOOTING & COMMON PATTERNS

### Issue: "Context window exceeded"
**Solution:** Add a condenser to compress old events
```python
condenser = LLMSummarizingCondenser(llm=llm)
agent = Agent(llm=llm, condenser=condenser)
```

### Issue: Agent stuck in loop
**Solution:** Enable stuck detection
```python
conversation = Conversation(
    agent=agent,
    stuck_detection=True,
)
if conversation.state.execution_status == ConversationExecutionStatus.STUCK:
    print("Agent detected as stuck!")
```

### Issue: Tool execution fails silently
**Solution:** Check event log for error events
```python
for event in conversation.state.events:
    if isinstance(event, ErrorEvent):
        print(f"Error: {event.error}")
```

### Issue: Multi-agent coordination complexity
**Solution:** Use DelegateTool for built-in parallel execution
```python
tools = [Tool(name="DelegateTool")]
agent = Agent(llm=llm, tools=tools)
# Agent can spawn and delegate to sub-agents
```

---

## XI. QUICK REFERENCE

### Import Essentials
```python
# Core
from openhands.sdk import (
    LLM, Agent, Conversation,
    Tool, ToolDefinition, Action, Observation,
    LocalWorkspace, Workspace,
    Message, TextContent, ImageContent,
    AgentContext, LLMRegistry, Event
)

# Tools
from openhands.tools import (
    BashTool, FileEditorTool, GrepTool,
    BrowserTool, TerminalTool, TaskTrackerTool
)

# Advanced
from openhands.sdk import (
    LLMSummarizingCondenser,
    ConversationExecutionStatus,
    LocalConversation, RemoteConversation
)
```

### Common Workflows

**1. Basic Agent Execution**
```python
llm = LLM(model="anthropic/claude-sonnet-4-5-20250929", api_key=key)
agent = Agent(llm=llm, tools=[Tool(name="BashTool")])
conv = Conversation(agent=agent, workspace=".")
conv.send_message("Your task")
conv.run()
```

**2. Multi-Model with Registry**
```python
registry = LLMRegistry()
registry.add(llm1.with_usage_id("fast"))
registry.add(llm2.with_usage_id("smart"))
# Switch models by usage_id
```

**3. Custom Tool Creation**
```python
class MyAction(Action):
    param: str

class MyObservation(Observation):
    result: str

class MyExecutor(ToolExecutor[MyAction, MyObservation]):
    def __call__(self, action, conversation=None):
        return MyObservation(result=...)

tool = ToolDefinition(name="MyTool", ..., executor=MyExecutor())
```

**4. Workspace Switching**
```python
# Local to Docker (1 line change!)
workspace = DockerWorkspace(image="ghcr.io/openhands/agent-server:main")
# Same agent code works
```

---

## REFERENCES

- **Full API Docs:** https://docs.openhands.dev/sdk/api-reference/
- **Architecture Deep Dive:** https://docs.openhands.dev/sdk/arch/
- **Tool System:** https://docs.openhands.dev/sdk/arch/tool-system
- **Conversation System:** https://docs.openhands.dev/sdk/arch/conversation
- **Agent Reasoning Loop:** https://docs.openhands.dev/sdk/arch/agent
- **Examples:** https://github.com/OpenHands/software-agent-sdk/tree/main/examples
- **GitHub Issues:** https://github.com/OpenHands/software-agent-sdk/issues

**Last Audited Against Local Environment:** June 3, 2026
