import { Goal } from './Goal';

 export interface AgentConfig {
  id: string;                             // Unique agent identifier
  tools?: { [key: string]: Tool };        // Custom tools the agent can use
  goals?: Goal[];                         // Long-term and short-term goals for the agent
  llmConfig?: LLMConfig;                  // Configuration for large language model interaction
  inboxConfig?: InboxConfig;              // Configuration for task inbox settings (priority, queue, etc.)
  memoryConfig?: MemoryConfig;            // Configuration for memory persistence (in-memory, DB, etc.)
  communicationConfig?: CommunicationConfig; // Communication options (NATS, HTTP, gRPC)
  decisionInterval?: string;              // Interval for decision-making loop (used by Bree or other schedulers)
  proactiveInterval?: string;             // Interval for scheduling proactive actions
  customHandlers?: {                      // Optional custom logic hooks for agent's lifecycle
    onMessageReceived?: (message: any) => void; // Custom handler for incoming messages
    onActionPlanned?: (goal: Goal) => void;     // Custom logic when a new action is planned
    onLLMResponse?: (response: string) => void; // Handler for processing LLM responses
  };
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

export interface Prompt {
  name: string;
  template: string;
}

export interface MemoryConfig {
  type: string;
  dbFilePath: string;
}

export interface CommunicationConfig {
  type: string;
  url: string;
}

export interface InboxConfig {
  type: string;
  priority: string;
}
