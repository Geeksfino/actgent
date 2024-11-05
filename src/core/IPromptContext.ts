export interface IPromptMode {
  value: string;
  metadata?: Record<string, any>;
}

export interface IPromptContext {
  recentMessages?: Array<any>;
  systemContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface IPromptStrategy {
  evaluatePromptMode(context: IPromptContext): IPromptMode;
  getCurrentMode(): IPromptMode;
}