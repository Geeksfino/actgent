import { MemoryConfig } from "./interfaces";
import { SessionContext } from './SessionContext';
import { Message } from './Message';
// Define an interface for agent memory
export interface Memory {
  storeContext(sessionContext: SessionContext): void;
  getContext(sessionId: string): SessionContext | null;
  flushOldMemory(): void;
}

// Default implementation of AgentMemory
export class DefaultAgentMemory implements Memory {
  private sessionContexts: Map<string, SessionContext> = new Map();

  storeContext(sessionContext: SessionContext): void {
    this.sessionContexts.set(sessionContext.getSessionId(), sessionContext);
  }

  getContext(sessionId: string): SessionContext | null {
    return this.sessionContexts.get(sessionId) || null;
  }

  flushOldMemory(): void {
    // Logic to flush old memory based on limits
    // This is a placeholder for actual implementation
  }
}