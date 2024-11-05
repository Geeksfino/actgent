import { IPromptMode } from "../core/IPromptContext";
import { IPromptContext } from "../core/IPromptContext";
import { IPromptStrategy } from "../core/IPromptContext";
import { logger } from "../helpers/Logger";

export type ReActMode = 'react' | 'direct';

export interface TaskContext {
  input: string;
  previousInteractions?: number;
  userPreference?: ReActMode;
  accumulatedContext?: string[];
  complexity?: number;
}

export interface ComplexityScore {
  score: number;
  reason: string;
}

export abstract class ReActModeStrategy implements IPromptStrategy {
  protected complexityThreshold: number = 5;
  
  abstract evaluateMode(context: TaskContext): ReActMode;
  
  protected calculateComplexity(input: string): ComplexityScore {
    return {
      score: 0,
      reason: "Base implementation"
    };
  }

  evaluatePromptMode(context: IPromptContext): IPromptMode {
    const hasContext = context.recentMessages && 
                      context.recentMessages.length >= 3;
    
    return {
      mode: hasContext ? 'direct' : 'react',
      metadata: {
        contextSize: context.recentMessages?.length,
        hasSubstantialContext: hasContext
      }
    };
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
    this.complexityThreshold = config?.complexityThreshold ?? 5;
    
    // Default react patterns
    this.reactPatterns = config?.reactPatterns ?? new Map([
      [/\b(consider|analyze|determine if|depends on|find the best|calculate)\b/i, 3],
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
      }
    });

    this.directPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score -= value;
        reasons.push(`Direct pattern "${pattern.source}": -${value}`);
      }
    });

    return {
      score,
      reason: reasons.join(', ')
    };
  }

  evaluateMode(context: TaskContext): ReActMode {
    const complexity = this.calculateComplexity(context.input);
    logger.debug(`Complexity score: ${complexity.score} (${complexity.reason})`);
    return complexity.score >= this.complexityThreshold ? 'react' : 'direct';
  }
}

export class UserPreferenceStrategy extends ReActModeStrategy {
  evaluateMode(context: TaskContext): ReActMode {
    return context.userPreference || 'direct';
  }
}

export class AutoSwitchingStrategy extends ReActModeStrategy {
  private contextThreshold = 3;
  
  evaluateMode(context: TaskContext): ReActMode {
    const hasSubstantialContext = context.accumulatedContext && 
                                 context.accumulatedContext.length >= this.contextThreshold;
    
    if (hasSubstantialContext) {
      logger.debug('Sufficient context accumulated, switching to direct mode');
      return 'direct';
    }

    const complexity = this.calculateComplexity(context.input);
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

  evaluateMode(context: TaskContext): ReActMode {
    this.mode = this.strategy.evaluateMode(context);
    return this.mode;
  }

  getCurrentMode(): ReActMode {
    return this.mode;
  }
} 