export interface InferMode {
  value: string;
  metadata?: Record<string, any>;
}

export interface InferContext {
  input?: string;
  previousInteractions?: number;
  accumulatedContext?: string[];
  conversationHistory?: Array<any>;
  recentMessages?: Array<any>;
  systemContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface InferStrategy {
  evaluateStrategyMode(context: InferContext): InferMode;
  getCurrentMode(): InferMode;
}