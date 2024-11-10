import { KeywordBasedStrategy, PatternConfig } from '../agent/ReActModeStrategy';

export class KeywordBasedStrategyBuilder {

  private static defaultReactPatternsEn(): Map<RegExp, number> {
    return new Map([
      [/\b(plan|consider|analyze|determine if|depends on|find the best|calculate)\b/i, 3],
      [/\b(if|might|should|could|depending on)\b/i, 2],
      [/\b(compare|better|best|more efficient|most suitable)\b/i, 2],
      [/\b(balance|trade-off|optimize|constraints)\b/i, 3],
      [/\b(and|then|while|but)\b/i, 1],
      [/\b(because|due to|implies|suggests)\b/i, 2],
      [/\b(possibly|potentially|estimate|assume)\b/i, 2],
      [/\b(strategy|policy|factors|scenarios|outcomes)\b/i, 3]
    ]);
  }

  private static defaultDirectPatternsEn(): Map<RegExp, number> {
    return new Map([
      [/^(what|who|when|where|how much|how many)\b/i, 1],
      [/\b(provide|give me|find|look up|define)\b/i, 1],
      [/\b(current|latest|retrieve|fetch|show)\b/i, 1],
      [/\b(list|summarize|show|display|detail)\b/i, 1],
      [/\b(give|state|tell me|reveal)\b/i, 1],
      [/\b(confirm|verify|double-check)\b/i, 1]
    ]);
  }

  private static defaultReactPatternsZh(): Map<RegExp, number> {
    return new Map([
      [/规划|考虑|分析|确定是否|取决于|找到最好的|计算/gi, 3],
      [/如果|可能|应该|可以|取决于/gi, 2],
      [/比较|更好|最好|更高效|最适合/gi, 2],
      [/平衡|权衡|优化|约束/gi, 3],
      [/和|然后|当|但是/gi, 1],
    ]);
  }

  private static defaultDirectPatternsZh(): Map<RegExp, number> {
    return new Map([
      [/^(什么|谁|何时|哪里|多少)/gi, 1],
      [/提供|给我|寻找|查找|定义/gi, 1],
      [/当前|最新|检索|获取|显示/gi, 1],
    ]);
  }

  static async buildStrategy(): Promise<KeywordBasedStrategy> {
    const strategy = new KeywordBasedStrategy();
    strategy.addLanguagePattern('en', {
      complexityThreshold: 2,
      reactPatterns: this.defaultReactPatternsEn(),
      directPatterns: this.defaultDirectPatternsEn(),
    });
    strategy.addLanguagePattern('zh', {
      complexityThreshold: 2,
      reactPatterns: this.defaultReactPatternsZh(),
      directPatterns: this.defaultDirectPatternsZh(),
    });
    return strategy;
  }
}
