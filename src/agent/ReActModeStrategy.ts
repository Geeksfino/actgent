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
  matches: Array<{pattern: string, weight: number, match: string}>;
}

interface PatternMatch {
  pattern: string;
  weight: number;
  match: string;
}

export abstract class ReActModeStrategy extends Observable implements InferStrategy {
  protected complexityThreshold: number = 5;
  protected currentMode: InferMode = {
    value: 'direct',
    metadata: {}
  };
  
  abstract evaluateMode(context: InferContext): Promise<ReActMode>;
  
  protected abstract getSelectionReason(context: InferContext): string;
  
  protected calculateComplexity(input: string): ComplexityScore {
    const score = {
      score: 0,
      reason: "Base implementation",
      matches: []
    };
    
    return score;
  }

  @Observe()
  async evaluateStrategyMode(context: InferContext): Promise<InferMode> {
    const taskContext: InferContext = {
      ...context,
      input: context.input as string || '',
      accumulatedContext: context.metadata?.accumulatedContext as string[] || [],
      conversationHistory: context.metadata?.conversationHistory || [],
    };

    logger.trace(`Evaluating mode for context: ${JSON.stringify(taskContext, null, 2)}`);
    
    // Calculate complexity once and store it
    const complexity = this.calculateComplexity(taskContext.input || '');
    const mode = await this.evaluateMode(taskContext);
    
    const oldMode = this.currentMode;
    const newMode: InferMode = {
      value: mode,
      metadata: {
        reason: complexity.reason,
        complexity: complexity,
        oldMode
      }
    };

    this.currentMode = newMode;

    return this.currentMode;
  }

  public generateEvent(methodName: string, result: any, error?: any): Partial<AgentEvent> {
    const context = {
      input: result?.metadata?.input || result?.context?.input || '',
      metadata: result?.metadata || {}
    };

    // Let each strategy provide its own metrics
    const strategyInfo = this.getStrategySpecificInfo(context);

    // It's a STRATEGY_SWITCH only if the mode actually changed
    const oldMode = result?.metadata?.oldMode?.value;
    const newMode = this.currentMode.value;
    const isStrategySwitch = oldMode !== undefined && oldMode !== newMode;

    return {
      metadata: {
        version: "1.0",
        source: this.constructor.name,
        tags: ["mode", "evaluation", "strategy"]
      },
      eventType: isStrategySwitch ? "STRATEGY_SWITCH" : "STRATEGY_SELECTION",
      data: {
        strategyInfo: {
          currentStrategy: this.mapModeToStrategy(this.currentMode.value as ReActMode),
          ...strategyInfo  // Each strategy provides its own confidenceScore, contextFactors, and decisionMetrics
        }
      }
    };
  }

  public getCurrentMode(): InferMode {
    return this.currentMode;
  }

  /**
   * Maps internal mode to schema-defined strategy type
   */
  protected mapModeToStrategy(mode: ReActMode): string {
    return mode === 'react' ? 'reasoning_and_act' : 'straight';
  }

  protected getStrategySpecificInfo(context: InferContext): Record<string, any> {
    return {};
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
    logger.debug(`Use KeywordBasedStrategy`);
    this.complexityThreshold = config?.complexityThreshold ?? 2;
    
    // Default react patterns
    this.defaultReactPatterns = new Map([
      [/\b(plan|consider|analyze|determine|depends on|find the best|calculate)\b/i, 3],
      [/\b(if|might|should|could|depending on)\b/i, 2],
      [/\b(compare|better|best|more efficient|most suitable)\b/i, 2],
      [/\b(balance|trade-off|optimize|constraints)\b/i, 3],
      [/\b(and|then|while|but)\b/i, 1],
      [/\b(because|due to|implies|suggests)\b/i, 2],
      [/\b(possibly|potentially|estimate|assume)\b/i, 2],
      [/\b(strategy|policy|factors|scenarios|outcomes)\b/i, 3],
      [/\b(implement|architect|structure|pattern)\b/i, 4]
    ]);
    this.activeReactPatterns = new Map(this.defaultReactPatterns);

    // Default direct patterns
    this.defaultDirectPatterns = new Map([
      [/^(what|who|when|where|how much|how many)\b/i, 1],
      [/\b(provide|give me|find|look up|define)\b/i, 1],
      [/\b(current|latest|retrieve|fetch|show)\b/i, 1],
      [/\b(list|summarize|show|display|detail)\b/i, 1],
      [/\b(give|state|tell me|explain|reveal)\b/i, 1],
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
    const matches: Array<{pattern: string, weight: number, match: string}> = [];

    logger.info(`Calculating complexity for input: "${input}"`);
    
    this.activeReactPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score += value;
        const match = input.match(pattern);
        if (match) {
          matches.push({
            pattern: pattern.source,
            weight: value,
            match: match[0]
          });
          reasons.push(`ReAct pattern "${pattern.source}" matched "${match[0]}": +${value}`);
          logger.info(`Matched ReAct pattern: ${pattern.source}, score: +${value}, match: "${match[0]}"`);
        }
      }
    });

    this.activeDirectPatterns.forEach((value, pattern) => {
      if (pattern.test(input)) {
        score -= value;
        const match = input.match(pattern);
        if (match) {
          matches.push({
            pattern: pattern.source,
            weight: -value,
            match: match[0]
          });
          reasons.push(`Direct pattern "${pattern.source}" matched "${match[0]}": -${value}`);
          logger.info(`Matched Direct pattern: ${pattern.source}, score: -${value}, match: "${match[0]}"`);
        }
      }
    });

    logger.info(`Final complexity score: ${score} (threshold: ${this.complexityThreshold})`);
    if (reasons.length === 0) {
      reasons.push('No patterns matched');
    }
    
    return {
      score,
      reason: reasons.join(', '),
      matches
    };
  }

  protected getStrategySpecificInfo(context: InferContext): Record<string, any> {
    // Use stored complexity from evaluateStrategyMode
    const complexity = context.metadata?.complexity || this.calculateComplexity(context.input || '');
    
    return {
      confidenceScore: Math.abs(complexity.score) / this.complexityThreshold,
      contextFactors: [
        { 
          factor: 'complexity_score', 
          weight: complexity.score,
          info: { 
            threshold: this.complexityThreshold,
            reason: complexity.reason
          }
        }
      ],
      decisionMetrics: {
        matchedPatterns: complexity.matches.map((match: PatternMatch) => ({
          pattern: match.pattern,
          weight: match.weight,
          score: match.weight,
          matches: [match.match]  // Each pattern needs a matches array
        }))
      }
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
    const complexity = this.calculateComplexity(context.input || '');
    return complexity.reason;
  }

  private async detectLanguage(input: string): Promise<string> {
    const languageResult = await this.detector.then(detector => detector.findLanguage(input));
    return languageResult.language;
  }
}

export class AutoSwitchingStrategy extends ReActModeStrategy {
  private contextThreshold = 3;
  private contextHistory: Array<{timestamp: string, length: number, mode: ReActMode}> = [];
  private lastTransition: { from: ReActMode, to: ReActMode, timestamp: string } | null = null;
  
  constructor() {
    super();
    logger.debug(`Use AutoSwitchingStrategy`);
  }

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    const contextLength = context.accumulatedContext?.length || 0;
    const previousMode = this.currentMode.value as ReActMode;
    const newMode = contextLength >= this.contextThreshold ? 'react' : 'direct';
    
    // Record context length and mode history
    this.contextHistory.push({
      timestamp: new Date().toISOString(),
      length: contextLength,
      mode: newMode
    });
    
    // Keep last 10 entries
    if (this.contextHistory.length > 10) {
      this.contextHistory.shift();
    }

    // Track mode transitions
    if (previousMode !== newMode) {
      this.lastTransition = {
        from: previousMode,
        to: newMode,
        timestamp: new Date().toISOString()
      };
    }

    // Update current mode with metadata
    this.currentMode = {
      value: newMode,
      metadata: {
        reason: this.getSelectionReason(context),
        contextLength,
        threshold: this.contextThreshold,
        transition: this.lastTransition
      }
    };
    
    return newMode;
  }

  protected getSelectionReason(context: InferContext): string {
    const contextLength = context.accumulatedContext?.length || 0;
    const hasSubstantialContext = contextLength >= this.contextThreshold;
    
    if (hasSubstantialContext) {
      return `Sufficient context accumulated: ${contextLength} >= ${this.contextThreshold}`;
    } else {
      const remaining = this.contextThreshold - contextLength;
      return `Insufficient context: ${contextLength}/${this.contextThreshold} (needs ${remaining} more)`;
    }
  }

  protected getStrategySpecificInfo(context: InferContext): Record<string, any> {
    const contextLength = context.accumulatedContext?.length || 0;
    const recentHistory = this.contextHistory.slice(-3); // Last 3 entries
    const modeDistribution = this.contextHistory.reduce((acc, entry) => {
      acc[entry.mode] = (acc[entry.mode] || 0) + 1;
      return acc;
    }, {} as Record<ReActMode, number>);

    return {
      confidenceScore: Math.min(contextLength / this.contextThreshold, 1),
      contextFactors: [
        { 
          factor: 'context_length', 
          weight: contextLength,
          info: { 
            threshold: this.contextThreshold,
            progress: `${contextLength}/${this.contextThreshold}`,
            isThresholdMet: contextLength >= this.contextThreshold
          }
        }
      ],
      decisionMetrics: {
        recentHistory,
        modeDistribution,
        lastTransition: this.lastTransition,
        stabilityScore: this.calculateStabilityScore()
      }
    };
  }

  private calculateStabilityScore(): number {
    if (this.contextHistory.length < 2) return 1;
    
    // Count mode changes in recent history
    let changes = 0;
    for (let i = 1; i < this.contextHistory.length; i++) {
      if (this.contextHistory[i].mode !== this.contextHistory[i-1].mode) {
        changes++;
      }
    }
    
    // Return stability score (1 = very stable, 0 = very unstable)
    return Math.max(0, 1 - (changes / this.contextHistory.length));
  }
}

export class UserPreferenceStrategy extends ReActModeStrategy {
  private preference: ReActMode;
  private preferenceTimestamp: string;
  private preferenceSource: string = 'user_explicit';

  constructor(preference: ReActMode, source: string = 'user_explicit') {
    super();
    logger.debug(`Use UserPreferenceStrategy`);
    this.preference = preference;
    this.preferenceSource = source;
    this.preferenceTimestamp = new Date().toISOString();
    this.currentMode = {
      value: preference,
      metadata: {
        reason: `User explicitly set mode to ${preference}`
      }
    };
  }

  async evaluateMode(context: InferContext): Promise<ReActMode> {
    return this.preference;
  }

  protected getSelectionReason(context: InferContext): string {
    return `User preference: ${this.preference}`;
  }

  protected getStrategySpecificInfo(context: InferContext): Record<string, any> {
    return {
      confidenceScore: 1, // User preference is always 100% confident
      contextFactors: [
        { 
          factor: 'user_preference',
          weight: 1,
          info: { source: this.preferenceSource }
        }
      ],
      decisionMetrics: {
        userPreference: {
          value: this.preference,
          source: this.preferenceSource,
          timestamp: this.preferenceTimestamp
        }
      }
    };
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