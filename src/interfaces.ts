import { ClassificationTypeConfig } from "./IAgentPromptTemplate";

export interface AgentCoreConfig {
  name: string;                             // Agent name
  role: string;                             // Agent role
  capabilities: string;  // Capabilities the agent has
  tools?: { [key: string]: Tool };        // Custom tools the agent can use
  goal: string;                         // Long-term and short-term goals for the agent
  inboxConfig?: InboxConfig;              // Configuration for task inbox settings (priority, queue, etc.)
  memoryConfig?: MemoryConfig;            // Configuration for memory persistence (in-memory, DB, etc.)
  classificationTypeConfigs?: ClassificationTypeConfig[]; 
}

export interface AgentServiceConfig {
  llmConfig?: LLMConfig;                  // Configuration for large language model interaction
  communicationConfig?: CommunicationConfig; // Communication options (NATS, HTTP, gRPC)
  decisionInterval?: string;              // Interval for decision-making loop (used by Bree or other schedulers)
  proactiveInterval?: string;             // Interval for scheduling proactive actions
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
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
}