import type { InferMode, InferContext, InferStrategy } from "../core/InferContext";
import { logger } from "../core/Logger";
import { loadModule} from 'cld3-asm';
import { Observable, Observe } from "../core/observability/Observable";
import { AgentEvent } from "../core/observability/event_validation";
import { v4 as uuidv4 } from 'uuid';
import { getEventBuilder } from '../core/observability/AgentEventBuilder';

export type ReActMode = 'react' | 'direct';

export interface ComplexityScore {
  score: number;
  reason: string;
}

export abstract class ReActModeStrategy extends Observable implements InferStrategy {
  protected complexityThreshold: number = 5;
  protected currentMode: InferMode = {
    value: 'direct',
    metadata: {}
  };
  
  abstract evaluateMode(context: InferContext): Promise<ReActMode>;
  
  protected abstract getSelectionReason(context: InferContext): string;
  
  @Observe({
    metadata: {
      source: 'ReActModeStrategy',
      tags: ['complexity', 'scoring']
    }
  })
  protected calculateComplexity(input: string): ComplexityScore {
    const score = {
      score: 0,
      reason: "Base implementation"
    };
    
    const event = getEventBuilder()
      .create()
      .withType('METRIC_REPORT')
      .withSource('ReActModeStrategy')
      .withTags(['complexity', 'scoring'])
      .withData({
        strategyInfo: {
          currentStrategy: 'custom',
          confidenceScore: score.score,
          contextFactors: [{
            factor: 'complexity',
            weight: 1.0
          }]
        }
      })
      .build();
    
    this.emit('METRIC_REPORT', event as AgentEvent);
    return score;
  }

  @Observe({
    metadata: {
      source: 'ReActModeStrategy',
      tags: ['mode', 'evaluation', 'strategy']
    }
  })
  async evaluateStrategyMode(context: InferContext): Promise<InferMode> {
    const taskContext: InferContext = {
      ...context,
      input: context.input as string || '',
      accumulatedContext: context.metadata?.accumulatedContext as string[] || [],
      conversationHistory: context.metadata?.conversationHistory || [],
    };

    logger.trace(`Evaluating mode for context: ${JSON.stringify(taskContext, null, 2)}`);
    
    // Emit strategy selection start
    const selectionEvent = getEventBuilder()
      .create()
      .withType('STRATEGY_SELECTION')
      .withSource('ReActModeStrategy')
      .withTags(['mode', 'evaluation', 'strategy'])
      .withData({
        context: {
          input: taskContext.input,
          mode: this.currentMode
        }
      })
      .build();

    this.emit('STRATEGY_SELECTION', selectionEvent as AgentEvent);

    const mode = await this.evaluateMode(taskContext);
    const newMode: InferMode = {
      value: mode,
      metadata: {
        reason: this.getSelectionReason(taskContext)
      }
    };

    // Only emit switch event if mode changed
    if (newMode.value !== this.currentMode.value) {
      const switchEvent = getEventBuilder()
        .create()
        .withType('STRATEGY_SWITCH')
        .withSource('ReActModeStrategy')
        .withTags(['mode', 'switch', 'strategy'])
        .withData({
          previousMode: this.currentMode,
          newMode: newMode,
          reason: newMode.metadata?.reason
        })
        .build();

      this.emit('STRATEGY_SWITCH', switchEvent as AgentEvent);
      this.currentMode = newMode;
    }

    return this.currentMode;
  }

  public getCurrentMode(): InferMode {
    return this.currentMode;
  }

  // Map react/direct modes to schema-defined strategy types
  protected mapModeToStrategy(mode: ReActMode): string {
    return mode === 'react' ? 'REACT_MODE' : 'DIRECT_MODE';
  }

  /**
   * Override generateEvent to provide specific event generation logic
   */
  public generateEvent(methodName: string, result: any, error?: any): Partial<AgentEvent> {
    const event = getEventBuilder()
      .create()
      .withType(error ? 'ERROR' : 'GENERAL')
      .withSource('ReActModeStrategy')
      .withTags(['mode', 'evaluation', 'strategy'])
      .withData({
        strategyInfo: {
          currentStrategy: result?.currentStrategy || 'straight',
          confidenceScore: result?.confidenceScore || 1,
          contextFactors: result?.contextFactors || []
        }
      })
      .build();

    return event;
  }
}

export interface PatternConfig {
  reactPatterns?: Map<RegExp, number>;
  directPatterns?: Map<RegExp, number>;
  complexityThreshold?: number;
}

export class KeywordBasedStrategy extends ReActModeStrategy {
  private activeReactPatterns: Map<RegExp, number>;
  private activeDirectPatterns: Map<RegExp, number>;

  private defaultReactPatterns: Map<RegExp, number>;
  private defaultDirectPatterns: Map<RegExp, number>;

  private detector = loadModule().then(factory => factory.create());
  private langPatterns: Map<string, PatternConfig> = new Map();

  constructor(config?: PatternConfig) {
    super();
    logger.info(`Use KeywordBasedStrategy`);
    this.complexityThreshold = config?.complexityThreshold ?? 2;
    
    // Default react patterns
    this.defaultReactPatterns = new Map([
      [/\b(plan|consider|analyze|determine if|depends on|find the best|calculate)\b/i, 3],
      [/\b(if|might|should|could|depending on)\b/i, 2],
      [/\b(compare|better|best|more efficient|most suitable)\b/i, 2],
      [/\b(balance|trade-off|optimize|constraints)\b/i, 3],
      [/\b(and|then|while|but)\b/i, 1],
      [/\b(because|due to|implies|suggests)\b/i, 2],
      [/\b(possibly|potentially|estimate|assume)\b/i, 2],
      [/\b(strategy|policy|factors|scenarios|outcomes)\b/i, 3]
    ]);
    this.activeReactPatterns = new Map(this.defaultReactPatterns);

    // Default direct patterns
    this.defaultDirectPatterns = new Map([
      [/^(what|who|when|where|how much|how many)\b/i, 1],
      [/\b(provide|give me|find|look up|define)\b/i, 1],
      [/\b(current|latest|retrieve|fetch|show)\b/i, 1],
      [/\b(list|summarize|show|display|detail)\b/i, 1],
      [/\b(give|state|tell me|reveal)\b/i, 1],
      [/\b(confirm|verify|double-check)\b/i, 1]
    ]);
    this.activeDirectPatterns = new Map(this.defaultDirectPatterns);

    this.langPatterns.set('en', {
      reactPatterns: this.defaultReactPatterns,
      directPatterns: this.defaultDirectPatterns,
      complexityThreshold: this.complexityThreshold
    });
  }

  public addLanguagePattern(language: string, pattern: PatternConfig) {
    this.langPatterns.set(language, pattern);
  }

  protected calculateComplexity(input: string): ComplexityScore {
    let score = 0;
    let reasons: string[] = [];

    this.activeReactPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score += value;
        reasons.push(`ReAct pattern "${pattern.source}": +${value}`);
      } else {
        logger.trace(`Pattern "${pattern.source}" did not match input: "${input}"`);
      }
    });

    this.activeDirectPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score -= value;
        reasons.push(`Direct pattern "${pattern.source}": -${value}`);
      } else {
        logger.trace(`Pattern "${pattern.source}" did not match input: "${input}"`);
      }
    });

    logger.debug(`Final complexity score: ${score} (${reasons.join(', ')})`);
    return {
      score,
      reason: reasons.join(', ')
    };
  }

  setActivePatterns(language: string, patterns: PatternConfig) {
    this.activeReactPatterns = patterns.reactPatterns ?? this.defaultReactPatterns;
    this.activeDirectPatterns = patterns.directPatterns ?? this.defaultDirectPatterns;
    this.complexityThreshold = patterns.complexityThreshold ?? this.complexityThreshold;
  }

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    const language = await this.detectLanguage(context.input || '');
    const pattern = this.langPatterns.get(language);
    if (pattern) {
      this.setActivePatterns(language, pattern);
    }
    const complexity = this.calculateComplexity(context.input || '');
    logger.debug(`Complexity score: ${complexity.score} (${complexity.reason})`);
    return complexity.score >= this.complexityThreshold ? 'react' : 'direct';
  }

  protected getSelectionReason(context: InferContext): string {
    return `Context size: ${context.recentMessages?.length}, Has substantial context: ${context.recentMessages && 
                              context.recentMessages.length >= 3}`;
  }

  private async detectLanguage(input: string): Promise<string> {
    const languageResult = await this.detector.then(detector => detector.findLanguage(input));
    return languageResult.language;
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

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    return this.preference;
  }

  protected getSelectionReason(context: InferContext): string {
    return `User preference: ${this.preference}`;
  }
}

export class AutoSwitchingStrategy extends ReActModeStrategy {
  private contextThreshold = 3;
  
  constructor() {
    super();
    logger.debug(`Use AutoSwitchingStrategy`);
  }

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    const hasSubstantialContext = context.accumulatedContext && 
                                 context.accumulatedContext.length >= this.contextThreshold;
    
    if (hasSubstantialContext) {
      logger.debug('Sufficient context accumulated, switching to direct mode');
      return 'direct';
    }

    const complexity = this.calculateComplexity(context.input || '');
    return complexity.score >= this.complexityThreshold ? 'react' : 'direct';
  }

  protected getSelectionReason(context: InferContext): string {
    const hasSubstantialContext = context.accumulatedContext && 
                                 context.accumulatedContext.length >= this.contextThreshold;
    if (hasSubstantialContext) {
      return `Sufficient context accumulated: ${context.accumulatedContext?.length}`;
    } else {
      return `Complexity score: ${this.calculateComplexity(context.input || '').score}`;
    }
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

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    this.mode = await this.strategy.evaluateMode(context);
    return this.mode;
  }

  getCurrentMode(): ReActMode {
    return this.mode;
  }
}