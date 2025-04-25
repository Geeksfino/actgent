export type Instruction = {
  name: string;
  description?: string;
  schemaTemplate?: string;
};

export interface AgentCoreConfig {
  name: string;                             // Agent name
  role: string;                             // Agent role
  goal: string;                         // Long-term and short-term goals for the agent
  capabilities: string;  // Capabilities the agent has
  instructions?: Instruction[];
  instructionToolMap?: { [key: string]: string };
  // Tools from MCP servers
  mcpTools?: any[];     // Array of resolved MCP tools
  // tools?: { [key: string]: Tool };        // Custom tools the agent can use
  //inboxConfig?: InboxConfig;              // Configuration for task inbox settings (priority, queue, etc.)
  // memoryConfig?: MemoryConfig;            // Configuration for memory persistence (in-memory, DB, etc.)
  // classificationTypeConfigs?: ClassificationTypeConfig[]; 
}

export interface AgentServiceConfig {
  llmConfig?: LLMConfig;                  // Configuration for large language model interaction
  communicationConfig?: CommunicationConfig; // Communication options (NATS, HTTP, gRPC)
  decisionInterval?: string;              // Interval for decision-making loop (used by Bree or other schedulers)
  proactiveInterval?: string;            // Interval for proactive loop (used by Bree or other schedulers)
  loggingConfig?: LoggingConfig;          // Configuration for logging
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  streamMode?: boolean;
}

/**
 * Function type for query pre-processing
 * Takes the original query and session ID, returns the processed query
 * The original query is still stored in memory
 */
export interface PreprocessResult {
  user: string;              // The original user query (or minimally processed)
  systemContext?: string;    // The knowledge base/system context (optional)
}

export interface QueryPreProcessor {
  process: (query: string, sessionId: string) => Promise<PreprocessResult>;
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
  streamPort?: number;
  wsPort?: number;
  enableStreaming?: boolean;
  enableWebSocket?: boolean;
}

export interface InboxConfig {
  type: string;
  priority: string;
}

export interface PromptTemplate {
  id: string;
  template: string;
}

export interface LoggingConfig {
  type?: 'console' | 'file' | 'both';  // Default to 'console' if not specified
  destination?: string;                 // File path when type is 'file' or 'both'
  level?: 'debug' | 'info' | 'warn' | 'error';  // Optional log level
}