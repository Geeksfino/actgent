export interface IPromptContext {
    input: string;
    recentMessages?: string[];
    metadata?: {
      interactionCount?: number;
      [key: string]: any;
    };
  }
  
  export interface IPromptMode {
    mode: string;
    metadata?: Record<string, any>;
  }
  
  export interface IPromptStrategy {
    evaluatePromptMode(context: IPromptContext): IPromptMode;
  }