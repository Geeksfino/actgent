import { ClassificationTypeConfig } from './IClassifier';
import { InferClassificationUnion } from './TypeInference';
import { Session } from './Session';

export enum ResponseType {
  TOOL_CALL = 'TOOL_CALL',
  EVENT = 'EVENT',
  CONVERSATION = 'CONVERSATION',
  ROUTING = 'ROUTING',
  EXCEPTION = 'EXCEPTION'
}

export interface ParsedLLMResponse<T extends readonly ClassificationTypeConfig[]> {
  type: ResponseType;
  instruction?: string;
  structuredData: InferClassificationUnion<T>;
  textData?: string;
  metadata?: Record<string, any>;
  
  // For backward compatibility
  isToolCall?: boolean;
  parsedLLMResponse?: InferClassificationUnion<T>;
  
  // Standardized tool call properties
  toolCallId?: string;  // The ID of the tool call from LLM response
  originalToolCalls?: Array<{  // Original tool call objects for reference
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
    type?: string;
  }>;
}

export interface ResponseHandler<T extends readonly ClassificationTypeConfig[]> {
  canHandle(response: ParsedLLMResponse<T>): boolean;
  handle(response: ParsedLLMResponse<T>, session: Session): Promise<void>;
}
