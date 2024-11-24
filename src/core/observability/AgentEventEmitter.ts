import { EventEmitter } from 'events';
import { AgentEvent, validateAgentEvent } from './event_validation';

// Event middleware type
export type EventMiddleware = (event: AgentEvent) => AgentEvent | null;

// Singleton event emitter with middleware support
export class AgentEventEmitter extends EventEmitter {
  private static instance: AgentEventEmitter;
  private middleware: EventMiddleware[] = [];
  private currentAgentId?: string;
  private currentSessionId?: string;

  private constructor() {
    super();
  }

  public static getInstance(): AgentEventEmitter {
    if (!AgentEventEmitter.instance) {
      AgentEventEmitter.instance = new AgentEventEmitter();
    }
    return AgentEventEmitter.instance;
  }

  // Add middleware to the pipeline
  public use(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
  }

  // Remove middleware from the pipeline
  public remove(middleware: EventMiddleware): void {
    const index = this.middleware.indexOf(middleware);
    if (index !== -1) {
      this.middleware.splice(index, 1);
    }
  }

  // Clear all middleware
  public clearMiddleware(): void {
    this.middleware = [];
  }

  // Set current agent ID
  public setCurrentAgent(agentId: string): void {
    this.currentAgentId = agentId;
  }

  // Set current session ID
  public setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  // Get current agent ID
  public getCurrentAgent(): string {
    return this.currentAgentId || 'unknown';
  }

  // Get current session ID
  public getCurrentSession(): string {
    return this.currentSessionId || 'unknown';
  }

  // Clear session context (but keep agent)
  public clearSessionContext(): void {
    this.currentSessionId = undefined;
  }

  // Process event through middleware pipeline
  private processEvent(event: AgentEvent): AgentEvent | null {
    // Add agent and session IDs if not present
    const enrichedEvent: AgentEvent = {
      ...event,
      agentId: event.agentId || this.getCurrentAgent(),
      sessionId: event.sessionId || this.getCurrentSession(),
    };

    return this.middleware.reduce(
      (processedEvent: AgentEvent | null, middleware) => {
        if (!processedEvent) return null;
        return middleware(processedEvent);
      },
      enrichedEvent
    );
  }

  // Override emit to include validation and middleware processing
  public emit(eventType: string, event: AgentEvent): boolean {
    try {
      // Validate the event
      validateAgentEvent(event);

      // Process through middleware
      const processedEvent = this.processEvent(event);
      if (!processedEvent) {
        return false;
      }

      // Emit the processed event
      return super.emit(eventType, processedEvent);
    } catch (error) {
      console.error('Error emitting event:', error);
      return false;
    }
  }

  // Async emit with validation and middleware
  public async emitAsync(eventType: string, event: AgentEvent): Promise<boolean> {
    try {
      // Validate the event
      validateAgentEvent(event);

      // Process through middleware
      const processedEvent = this.processEvent(event);
      if (!processedEvent) {
        return false;
      }

      // Emit the processed event
      return super.emit(eventType, processedEvent);
    } catch (error) {
      console.error('Error emitting event:', error);
      return false;
    }
  }
}

// Helper function to get the singleton instance
export function getEventEmitter(): AgentEventEmitter {
  return AgentEventEmitter.getInstance();
}