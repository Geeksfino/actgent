 export interface AgentConfig {
  name: string;                             // Aggent name
  capabilities: CapabilityDescription[];  // Capabilities the agent has
  tools?: { [key: string]: Tool };        // Custom tools the agent can use
  goal: string;                         // Long-term and short-term goals for the agent
  llmConfig?: LLMConfig;                  // Configuration for large language model interaction
  inboxConfig?: InboxConfig;              // Configuration for task inbox settings (priority, queue, etc.)
  memoryConfig?: MemoryConfig;            // Configuration for memory persistence (in-memory, DB, etc.)
  communicationConfig?: CommunicationConfig; // Communication options (NATS, HTTP, gRPC)
  promptLibrary?: { [key: string]: PromptTemplate }; // Library of prompts for the agent
  decisionInterval?: string;              // Interval for decision-making loop (used by Bree or other schedulers)
  proactiveInterval?: string;             // Interval for scheduling proactive actions
  isNetworkService?: boolean;           // Whether the agent is a network service or a worker
  customHandlers?: {                      // Optional custom logic hooks for agent's lifecycle
    onMessageReceived?: (message: any) => void; // Custom handler for incoming messages
    onActionPlanned?: (goal: string) => void;     // Custom logic when a new action is planned
    onLLMResponse?: (response: string) => void; // Handler for processing LLM responses
  };
}

export interface CapabilityDescription {
  name: string; 
  description: string;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
}

export interface Task {
  type: string;
  data: any;
}

export interface Tool {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<any>;
}

export interface MemoryConfig {
  type: string;
  dbFilePath: string;
}

export interface CommunicationConfig {
  host?: string;
  natsUrl?: string;
  httpPort?: number;
  grpcPort?: number;
}

export interface InboxConfig {
  type: string;
  priority: string;
}

export interface PromptTemplate {
  id: string;
  template: string;
  description?: string; // A brief description of when to use this prompt
}
