import { z } from "zod";
import eventSchema from './event_schema.json' assert { type: 'json' };

// Helper function to convert JSON Schema enum to Zod enum
const createZodEnum = (enumValues: string[]): z.ZodEnum<[string, ...string[]]> => {
  if (!enumValues || enumValues.length === 0) {
    throw new Error('Enum values must not be empty');
  }
  return z.enum([enumValues[0], ...enumValues.slice(1)] as [string, ...string[]]);
};

// Create Zod schemas from JSON Schema definitions
export const EventType = createZodEnum(eventSchema.$defs.eventTypes.enum);
export type EventTypeValues = z.infer<typeof EventType>;

const StrategyType = createZodEnum(eventSchema.$defs.strategyTypes.enum);

// Create nested schemas
const TaskInfo = z.object({
  taskId: z.string(),
  taskType: z.string(),
  taskDescription: z.string(),
  priority: z.number().int().min(1).max(5).optional(),
  status: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  requiresTools: z.boolean().optional(),
});

const ContextFactor = z.object({
  factor: z.string(),
  weight: z.number(),
  info: z.record(z.any()).optional()
});

const MatchedPattern = z.object({
  pattern: z.string(),
  weight: z.number(),
  matches: z.array(z.string())
});

const ContextHistoryEntry = z.object({
  timestamp: z.string(),
  length: z.number(),
  threshold: z.number()
});

const UserPreference = z.object({
  value: z.string(),
  source: z.string(),
  timestamp: z.string()
});

const DecisionMetrics = z.object({
  matchedPatterns: z.array(MatchedPattern).optional(),
  contextHistory: z.array(ContextHistoryEntry).optional(),
  userPreference: UserPreference.optional()
});

const StrategyInfo = z.object({
  currentStrategy: StrategyType,
  previousStrategy: z.string().optional(),
  selectionReason: z.string().optional(),
  confidenceScore: z.number().optional(),
  contextFactors: z.array(ContextFactor).optional(),
  decisionMetrics: DecisionMetrics.optional()
});

const PromptInfo = z.object({
  promptId: z.string().optional(),
  promptTemplate: z.string().optional(),
  promptTokens: z.number().int().optional(),
  variables: z.record(z.unknown()).optional(),
  strategy: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  promptConstraints: z.array(z.string()).optional(),
});

const ReasoningInfo = z.object({
  step: z.number().int().optional(),
  type: z.string().optional(),
  thought: z.string().optional(),
  observation: z.string().optional(),
  plan: z.array(z.string()).optional(),
  nextAction: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  confidenceScore: z.number().optional(),
});

const LLMInfo = z.object({
  modelId: z.string().optional(),
  requestTokens: z.number().int().optional(),
  responseTokens: z.number().int().optional(),
  latency: z.number().optional(),
  cost: z.number().optional(),
  cached: z.boolean().optional(),
  outputFormat: z.string().optional(),
  parseSuccess: z.boolean().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().optional(),
});

const ContextInfo = z.object({
  previousContext: z.string().optional(),
  newContext: z.string().optional(),
  switchReason: z.string().optional(),
  contextSize: z.number().int().optional(),
  relevantTools: z.array(z.string()).optional(),
});

const MemoryInfo = z.object({
  operation: z.string().optional(),
  memoryType: z.string().optional(),
  keyTerms: z.array(z.string()).optional(),
  relevanceScore: z.number().optional(),
  memorySize: z.number().int().optional(),
  toolHistory: z.array(
    z.object({
      toolName: z.string(),
      usage: z.number().int(),
      successRate: z.number(),
    })
  ).optional(),
});

const ReflectionInfo = z.object({
  reflectionType: z.string().optional(),
  assessment: z.string().optional(),
  confidence: z.number().optional(),
  improvements: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
  strategyEffectiveness: z.number().optional(),
  toolEffectiveness: z.number().optional(),
});

const Metrics = z.object({
  responseTime: z.number().optional(),
  tokenUsage: z.number().int().optional(),
  memoryUsage: z.number().int().optional(),
  costPerToken: z.number().optional(),
  confidenceScore: z.number().optional(),
  accuracyScore: z.number().optional(),
  toolExecutionTime: z.number().optional(),
  strategySuccessRate: z.number().optional(),
});

const StateInfo = z.object({
  currentState: z.string(),
  previousState: z.string().optional(),
  reason: z.string().optional()
});

// Tool Event Schema
export const ToolInfo = z.object({
  // Core tool identification
  toolId: z.string().optional(),
  toolName: z.string(),
  toolDescription: z.string().optional(),
  
  // Execution details
  status: z.enum(['started', 'completed', 'error', 'pending', 'cancelled']),
  arguments: z.any().optional(),
  result: z.any().optional(),
  executionStart: z.string(),
  executionEnd: z.string().optional(),
  
  // Error handling
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    details: z.record(z.unknown()).optional()
  }).optional(),
  retryCount: z.number().int().optional(),
  
  // Tool selection context
  selectionReason: z.string().optional(),
  alternativeTools: z.array(
    z.object({
      toolName: z.string(),
      relevanceScore: z.number(),
    })
  ).optional(),
});

// Event Data Schema
export const EventDataSchema = z.object({
  stateInfo: StateInfo.optional(),
  toolInfo: ToolInfo.optional(),
  taskInfo: TaskInfo.optional(),
  strategyInfo: StrategyInfo.optional(),
  promptInfo: PromptInfo.optional(),
  reasoningInfo: ReasoningInfo.optional(),
  llmInfo: LLMInfo.optional(),
  contextInfo: ContextInfo.optional(),
  memoryInfo: MemoryInfo.optional(),
  reflectionInfo: ReflectionInfo.optional(),
  metrics: Metrics.optional(),
});

// Base Event Schema
export const AgentEventSchema = z.object({
  eventId: z.string(),
  eventType: EventType,
  timestamp: z.string().datetime(),
  agentId: z.string(),
  sessionId: z.string().optional(),
  parentEventId: z.string().optional(),
  data: EventDataSchema.optional(),
  metadata: z.object({
    version: z.string().optional(),
    environment: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  }).optional(),
});

// Event Type Constants
export const EVENT_TYPES = {
  // State Events
  STATE_CHANGED: 'STATE_CHANGED',
  
  // Tool Events  
  TOOL_STARTED: 'TOOL_STARTED',
  TOOL_COMPLETED: 'TOOL_COMPLETED', 
  TOOL_ERROR: 'TOOL_ERROR',

  // ... other event types
} as const;

// Infer TypeScript type from schema
export type AgentEvent = z.infer<typeof AgentEventSchema>;

// Helper function to validate events
export function validateAgentEvent(event: unknown): AgentEvent {
  return AgentEventSchema.parse(event);
}

// Helper function to safely validate events (returns Result type)
export function validateAgentEventSafe(
  event: unknown
): z.SafeParseReturnType<unknown, AgentEvent> {
  return AgentEventSchema.safeParse(event);
}