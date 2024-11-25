import { EventEmitter } from 'events';
import { AgentEvent, validateAgentEvent } from './event_validation';

// Event middleware type
export type EventMiddleware = (event: AgentEvent) => AgentEvent | null;

// Singleton event emitter with middleware support
export class AgentEventEmitter extends EventEmitter {
  private static instance: AgentEventEmitter | null = null;
  private middleware: EventMiddleware[] = [];
  private agentListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private currentAgentId: string = 'unknown';

  private constructor() {
    super();
    console.log('[DEBUG] AgentEventEmitter singleton initialized');
  }

  public static getInstance(): AgentEventEmitter {
    if (!AgentEventEmitter.instance) {
      console.log('[DEBUG] Creating AgentEventEmitter singleton');
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

  public setCurrentAgent(agentId: string): void {
    if (!this.agentListeners.has(agentId)) {
      this.agentListeners.set(agentId, new Set());
    }
    this.currentAgentId = agentId;
    console.log(`[DEBUG] Setting current agent to: ${agentId}`);
  }

  // Set current session ID
  public setCurrentSession(sessionId: string): void {
    // Removed currentSessionId property
  }

  // Get current agent ID
  public getCurrentAgent(): string {
    const stack = new Error().stack;
    if (!stack) return this.currentAgentId;

    // Extract agent ID from call stack
    const match = stack.match(/Agent\[([\w-]+)\]/);
    return match ? match[1] : this.currentAgentId;
  }

  // Get current session ID
  public getCurrentSession(): string {
    // Removed currentSessionId property
    return 'unknown';
  }

  // Clear session context (but keep agent)
  public clearSessionContext(): void {
    // Removed currentSessionId property
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

  public on(eventType: string, listener: (event: AgentEvent) => void): this {
    // Normalize event type to uppercase when registering listeners
    const normalizedType = eventType.toUpperCase();
    console.log(`[DEBUG] Registering listener for event type: ${normalizedType}`);
    
    // Add to agent-specific listeners
    const currentAgent = this.getCurrentAgent();
    if (!this.agentListeners.has(currentAgent)) {
      this.agentListeners.set(currentAgent, new Set());
    }
    this.agentListeners.get(currentAgent)?.add(listener);
    
    // Add to global listeners
    super.on(normalizedType, listener);
    console.log(`[DEBUG] Current listeners for ${normalizedType}: ${this.listenerCount(normalizedType)}`);
    return this;
  }

  public addListener(event: string | symbol, listener: (...args: any[]) => void): this {
    // Use the same implementation as 'on' to avoid duplication
    return this.on(event.toString(), listener as (event: AgentEvent) => void);
  }

  public removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    // Normalize event type to uppercase when removing listeners
    const normalizedType = typeof event === 'string' ? event.toUpperCase() : event;
    
    // Remove from agent-specific listeners
    const currentAgent = this.getCurrentAgent();
    const listeners = this.agentListeners.get(currentAgent);
    listeners?.delete(listener);
    
    return super.removeListener(normalizedType, listener);
  }

  public listenerCount(eventType: string): number {
    // Normalize event type to uppercase when counting listeners
    const normalizedType = eventType.toUpperCase();
    const count = super.listenerCount(normalizedType);
    console.log(`[DEBUG] Listener count for ${normalizedType}: ${count}`);
    return count;
  }

  // Override emit to include validation and middleware processing
  public emit(eventType: string, event: AgentEvent): boolean {
    const currentAgent = this.getCurrentAgent();
    console.log(`[DEBUG] Emitting event for agent: ${currentAgent}`);

    try {
      // Normalize event type to uppercase
      const normalizedType = eventType.toUpperCase();
      
      console.log(`[DEBUG] Emitting event of type ${normalizedType} from agent ${currentAgent}:`, JSON.stringify(event, null, 2));
      
      // Validate the event
      validateAgentEvent(event);
      console.log(`[DEBUG] Event validation passed`);

      // Process event through middleware
      const processedEvent = this.processEvent(event);
      if (!processedEvent) {
        console.log(`[DEBUG] Event filtered out by middleware`);
        return false;
      }

      // Emit to all listeners since we're already tracking agent-specific ones
      return super.emit(normalizedType, processedEvent);
    } catch (error) {
      console.error('[ERROR] Failed to emit event:', error);
      return false;
    }
  }

  // Async emit with validation and middleware
  public async emitAsync(eventType: string, event: AgentEvent): Promise<boolean> {
    try {
      // Validate the event
      validateAgentEvent(event);

      // Process event through middleware
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