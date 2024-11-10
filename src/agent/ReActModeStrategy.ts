import { InferMode } from "../core/InferContext";
import { InferContext } from "../core/InferContext";
import { InferStrategy } from "../core/InferContext";
import { logger } from "../core/Logger";

export type ReActMode = 'react' | 'direct';

export interface ComplexityScore {
  score: number;
  reason: string;
}

export abstract class ReActModeStrategy implements InferStrategy {
  protected complexityThreshold: number = 5;
  protected currentMode: InferMode = {
    value: 'direct',
    metadata: {}
  };
  
  abstract evaluateMode(context: InferContext): ReActMode;
  
  protected calculateComplexity(input: string): ComplexityScore {
    return {
      score: 0,
      reason: "Base implementation"
    };
  }

  evaluateStrategyMode(context: InferContext): InferMode {
    const taskContext: InferContext = {
      ...context,
      input: context.input as string || '',
      accumulatedContext: context.metadata?.accumulatedContext as string[] || [],
      conversationHistory: context.metadata?.conversationHistory || [],
    };
    logger.debug(`Evaluating mode for context: ${JSON.stringify(taskContext, null, 2)}`);
    const mode = this.evaluateMode(taskContext);

    this.currentMode = {
      value: mode,
      metadata: {
        contextSize: context.recentMessages?.length,
        hasSubstantialContext: context.recentMessages && 
                              context.recentMessages.length >= 3,
        accumulatedContextSize: taskContext.accumulatedContext?.length || 0
      }
    };
    
    return this.currentMode;
  }

  getCurrentMode(): InferMode {
    return this.currentMode;
  }
}

export interface PatternConfig {
  reactPatterns?: Map<RegExp, number>;
  directPatterns?: Map<RegExp, number>;
  complexityThreshold?: number;
}

export class KeywordBasedStrategy extends ReActModeStrategy {
  private reactPatterns: Map<RegExp, number>;
  private directPatterns: Map<RegExp, number>;

  constructor(config?: PatternConfig) {
    super();
    logger.info(`Use KeywordBasedStrategy`);
    this.complexityThreshold = config?.complexityThreshold ?? 2;
    
    // Default react patterns
    this.reactPatterns = config?.reactPatterns ?? new Map([
      [/\b(plan|consider|analyze|determine if|depends on|find the best|calculate)\b/i, 3],
      [/\b(if|might|should|could|depending on)\b/i, 2],
      [/\b(compare|better|best|more efficient|most suitable)\b/i, 2],
      [/\b(balance|trade-off|optimize|constraints)\b/i, 3],
      [/\b(and|then|while|but)\b/i, 1],
    ]);

    // Default direct patterns
    this.directPatterns = config?.directPatterns ?? new Map([
      [/^(what|who|when|where|how much|how many)\b/i, 1],
      [/\b(provide|give me|find|look up|define)\b/i, 1],
      [/\b(current|latest|retrieve|fetch|show)\b/i, 1],
    ]);
  }

  protected calculateComplexity(input: string): ComplexityScore {
    let score = 0;
    let reasons: string[] = [];

    this.reactPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score += value;
        reasons.push(`ReAct pattern "${pattern.source}": +${value}`);
      } else {
        logger.debug(`Pattern "${pattern.source}" did not match input: "${input}"`);
      }
    });

    this.directPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score -= value;
        reasons.push(`Direct pattern "${pattern.source}": -${value}`);
      } else {
        logger.debug(`Pattern "${pattern.source}" did not match input: "${input}"`);
      }
    });

    logger.debug(`Final complexity score: ${score} (${reasons.join(', ')})`);
    return {
      score,
      reason: reasons.join(', ')
    };
  }

  evaluateMode(context: InferContext): ReActMode {
    const complexity = this.calculateComplexity(context.input || '');
    logger.debug(`Complexity score: ${complexity.score} (${complexity.reason})`);
    return complexity.score >= this.complexityThreshold ? 'react' : 'direct';
  }
}

export class UserPreferenceStrategy extends ReActModeStrategy {
  private preference: ReActMode;
  
  constructor(preference: ReActMode) {
    super();
    logger.debug(`Use UserPreferenceStrategy`);
    this.preference = preference;
    // Set the currentMode based on preference immediately
    this.currentMode = {
      value: preference,
      metadata: {}
    };
  }

  evaluateMode(context: InferContext): ReActMode {
    return this.preference;
  }
}

export class AutoSwitchingStrategy extends ReActModeStrategy {
  private contextThreshold = 3;
  
  constructor() {
    super();
    logger.debug(`Use AutoSwitchingStrategy`);
  }

  evaluateMode(context: InferContext): ReActMode {
    const hasSubstantialContext = context.accumulatedContext && 
                                 context.accumulatedContext.length >= this.contextThreshold;
    
    if (hasSubstantialContext) {
      logger.debug('Sufficient context accumulated, switching to direct mode');
      return 'direct';
    }

    const complexity = this.calculateComplexity(context.input || '');
    return complexity.score >= this.complexityThreshold ? 'react' : 'direct';
  }
}

export class ReActModeSelector {
  private strategy: ReActModeStrategy;
  private mode: ReActMode = 'direct';

  constructor(strategy: ReActModeStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: ReActModeStrategy): void {
    this.strategy = strategy;
  }

  evaluateMode(context: InferContext): ReActMode {
    this.mode = this.strategy.evaluateMode(context);
    return this.mode;
  }

  getCurrentMode(): ReActMode {
    return this.mode;
  }
} 