import { InferContext } from './InferContext';
import { Memory } from './Memory';
import { SessionContext } from './SessionContext';

export class InferContextBuilder {
  private context: Partial<InferContext> = {};
  private sessionContext: SessionContext;

  constructor(sessionContext: SessionContext) {
    this.sessionContext = sessionContext;
  }

  withRecentMessages(): InferContextBuilder {
    this.context.recentMessages = this.sessionContext.getMessages();
    this.context.input = this.sessionContext.getLatestMessage().payload.input;
    return this;
  }

  async withSystemContext(): Promise<InferContextBuilder> {
    // not implemented yet
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