import { ClassificationTypeConfig } from './IClassifier';
import { InferClassificationUnion } from './TypeInference';
import { ValidationResult } from './types/ValidationResult';
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
  content: InferClassificationUnion<T>;
  answer?: string;
  validationResult: ValidationResult<InferClassificationUnion<T>>;
  metadata?: Record<string, any>;
  
  // For backward compatibility
  isToolCall?: boolean;
  parsedLLMResponse?: InferClassificationUnion<T>;
}

export interface ResponseHandler<T extends readonly ClassificationTypeConfig[]> {
  canHandle(response: ParsedLLMResponse<T>): boolean;
  handle(response: ParsedLLMResponse<T>, session: Session): Promise<void>;
}
