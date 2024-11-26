import { getEventEmitter } from "./AgentEventEmitter";
import { AgentEvent } from "./event_validation";
import { v4 as uuidv4 } from 'uuid';

/**
 * Type for method results that include event data
 */
export interface ObservableResult<T> {
  result: T;
  event?: Partial<AgentEvent>;
}

/**
 * Configuration for the Observe decorator
 */
export interface ObserveConfig {
  // Optional fields
  emitAsync?: boolean;
  observable?: Observable;
  metadata?: {
    version?: string;
    environment?: string;
    tags?: string[];
    source?: string;
  };
}

/**
 * Interface for observable components
 */
export interface IObservable {
  emit(eventType: string, payload: AgentEvent): void;
  emitAsync(eventType: string, payload: AgentEvent): Promise<void>;
  generateEvent(methodName: string, result: any, error?: any): Partial<AgentEvent>;
}

/**
 * Base class for observable components
 */
export abstract class Observable implements IObservable {
  protected emitter = getEventEmitter();
  agentId: string;

  constructor() {
    // Get current agent ID from emitter
    const emitter = getEventEmitter();
    this.agentId = emitter.getCurrentAgent() || 'unknown';
  }

  public emit(eventType: string, payload: AgentEvent): void {
    this.emitter.emit(eventType, payload);
  }

  public async emitAsync(eventType: string, payload: AgentEvent): Promise<void> {
    await this.emitter.emitAsync(eventType, payload);
  }

  /**
   * Generate event data based on method execution results.
   * Base implementation provides only required fields.
   * Subclasses should override this to provide specific event generation logic.
   */
  public generateEvent(methodName: string, result: any, error?: any): Partial<AgentEvent> {
    return {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: error ? 'ERROR' : 'GENERAL',
      agentId: this.agentId,
      metadata: {
        version: '1.0',
        source: this.constructor.name
      }
    };
  }
}

/**
 * Decorator factory that creates an event-emitting decorator
 * @param config Optional configuration for the decorator
 */
export function Observe(config: ObserveConfig = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Get the observable instance from config or this
      const observable = config.observable || this;
      
      if (!(observable instanceof Observable)) {
        throw new Error('@Observe decorator requires either config.observable to be set or this to be an Observable instance');
      }

      try {
        // Execute the original method
        const result = await originalMethod.apply(this, args);

        // Handle both ObservableResult and regular returns
        let eventData: Partial<AgentEvent>;
        let finalResult = result;

        if (result && typeof result === 'object' && 'result' in result && 'event' in result) {
          // Case 1: Method returns ObservableResult
          eventData = result.event || observable.generateEvent(propertyKey, result.result);
          finalResult = result.result;
        } else {
          // Case 2: Use the observable's generateEvent method
          eventData = observable.generateEvent(propertyKey, result);
        }

        // Ensure required fields are present
        const event: AgentEvent = {
          ...eventData,
          eventId: eventData.eventId || uuidv4(),
          timestamp: eventData.timestamp || new Date().toISOString(),
          eventType: eventData.eventType || 'METHOD_EXECUTION',
          agentId: eventData.agentId || observable.agentId,
          metadata: {
            ...eventData.metadata,
            ...config.metadata
          }
        };

        if (config.emitAsync) {
          await observable.emitAsync(event.eventType, event);
        } else {
          observable.emit(event.eventType, event);
        }

        return finalResult;
      } catch (error) {
        // Handle errors
        const errorEvent = observable.generateEvent(propertyKey, null, error);
        const event: AgentEvent = {
          ...errorEvent,
          eventId: errorEvent.eventId || uuidv4(),
          timestamp: errorEvent.timestamp || new Date().toISOString(),
          eventType: errorEvent.eventType || 'ERROR',
          agentId: errorEvent.agentId || observable.agentId,
          metadata: {
            ...errorEvent.metadata,
            ...config.metadata
          }
        };

        if (config.emitAsync) {
          await observable.emitAsync(event.eventType, event);
        } else {
          observable.emit(event.eventType, event);
        }
        
        throw error;
      }
    };

    return descriptor;
  };
}