import { InferContext } from './InferContext';
import { Memory } from './Memory';
import { SessionContext } from './SessionContext';

export class InferContextBuilder {
  private context: Partial<InferContext> = {};
  private memory: Memory;
  private sessionContext: SessionContext;

  constructor(memory: Memory, sessionContext: SessionContext) {
    this.memory = memory;
    this.sessionContext = sessionContext;
  }

  withRecentMessages(): InferContextBuilder {
    this.context.recentMessages = this.sessionContext.getMessages();
    this.context.input = this.sessionContext.getLatestMessage().payload.input;
    return this;
  }

  // TODO: this is not correct. conversation history is not the same as the history in the session context
  async withConversationHistory(): Promise<InferContextBuilder> {
    if (!this.context.metadata) {
      this.context.metadata = {};
    }
    this.context.metadata.conversationHistory = this.sessionContext.getHistory();
    return this;
  }

  async withSystemContext(): Promise<InferContextBuilder> {
    this.context.systemContext = await this.memory.getSystemContext();
    return this;
  }

  withMetadata(metadata: Record<string, any>): InferContextBuilder {
    this.context.metadata = {
      ...this.context.metadata,
      ...metadata
    };
    return this;
  }

  withAccumulatedContext(context: string[]): InferContextBuilder {
    if (!this.context.metadata) {
      this.context.metadata = {};
    }
    this.context.metadata.accumulatedContext = context;
    return this;
  }

  build(): InferContext {
    return this.context as InferContext;
  }
} 