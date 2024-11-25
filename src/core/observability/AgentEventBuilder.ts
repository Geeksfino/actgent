import { v4 as uuidv4 } from 'uuid';
import { AgentEvent } from './event_validation';
import { getEventEmitter } from './AgentEventEmitter';

/**
 * Builder class for creating AgentEvent objects with required fields
 */
export class AgentEventBuilder {
  private event: Partial<AgentEvent>;
  private static instance: AgentEventBuilder;

  private constructor() {
    this.event = {};
  }

  public static getInstance(): AgentEventBuilder {
    if (!AgentEventBuilder.instance) {
      AgentEventBuilder.instance = new AgentEventBuilder();
    }
    return AgentEventBuilder.instance;
  }

  /**
   * Create a new event with required fields
   */
  public create(): AgentEventBuilder {
    const emitter = getEventEmitter();
    const currentAgent = emitter.getCurrentAgent();
    console.log(`[DEBUG] Creating event for agent: ${currentAgent}`);
    
    this.event = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: currentAgent,
      eventType: 'GENERAL',
      metadata: {
        version: '1.0',
        source: 'AgentEventBuilder'
      }
    };
    return this;
  }

  /**
   * Set the event type
   */
  public withType(type: string): AgentEventBuilder {
    console.log(`[DEBUG] Setting event type to: ${type}`);
    this.event.eventType = type.toUpperCase(); // Ensure consistent case
    return this;
  }

  /**
   * Set the source in metadata
   */
  public withSource(source: string): AgentEventBuilder {
    if (!this.event.metadata) {
      this.event.metadata = {};
    }
    this.event.metadata.source = source;
    return this;
  }

  /**
   * Add tags to metadata
   */
  public withTags(tags: string[]): AgentEventBuilder {
    if (!this.event.metadata) {
      this.event.metadata = {};
    }
    this.event.metadata.tags = tags;
    return this;
  }

  /**
   * Set event data
   */
  public withData(data: any): AgentEventBuilder {
    this.event.data = data;
    return this;
  }

  /**
   * Set additional metadata
   */
  public withMetadata(metadata: Record<string, any>): AgentEventBuilder {
    this.event.metadata = {
      ...this.event.metadata,
      ...metadata
    };
    return this;
  }

  /**
   * Build and return the event
   */
  public build(): Partial<AgentEvent> {
    console.log(`[DEBUG] Building event with type: ${this.event.eventType}`);
    const event = { ...this.event };
    this.event = {};
    return event;
  }
}

// Helper function to get the builder instance
export function getEventBuilder(): AgentEventBuilder {
  return AgentEventBuilder.getInstance();
}