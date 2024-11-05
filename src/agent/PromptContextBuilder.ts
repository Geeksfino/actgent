import { IPromptContext } from '../core/IPromptContext';

export class PromptContextBuilder {
  private context: Partial<IPromptContext> = {};

  withRecentMessages(messages: Array<any>): PromptContextBuilder {
    this.context.recentMessages = messages;
    return this;
  }

  withSystemContext(context: Record<string, any>): PromptContextBuilder {
    this.context.systemContext = context;
    return this;
  }

  withMetadata(metadata: Record<string, any>): PromptContextBuilder {
    this.context.metadata = {
      ...this.context.metadata,
      ...metadata
    };
    return this;
  }

  build(): IPromptContext {
    return this.context as IPromptContext;
  }
} 