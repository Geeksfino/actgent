import { AgentEvent, EventTypeValues } from "./event_validation";
import { EventMiddleware } from "./AgentEventEmitter";

type FilterPredicate = (event: AgentEvent) => boolean;
type TransformFunction = (event: AgentEvent) => AgentEvent;
type Pattern = Record<string, any>;

export class EventFilterBuilder {
  private filters: FilterPredicate[] = [];

  byEventType(eventTypes: EventTypeValues | EventTypeValues[]) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    this.filters.push((event) => types.includes(event.eventType as EventTypeValues));
    return this;
  }

  byAgentId(agentIds: string | string[]) {
    const ids = Array.isArray(agentIds) ? agentIds : [agentIds];
    this.filters.push((event) => ids.includes(event.agentId));
    return this;
  }

  bySessionId(sessionIds: string | string[]) {
    const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
    this.filters.push((event) => {
      return typeof event.sessionId === 'string' && ids.includes(event.sessionId);
    });
    return this;
  }

  byMetadata(metadata: Record<string, any>) {
    this.filters.push((event) => {
      if (!event.metadata) return false;
      return this.matchesPattern(event.metadata, metadata);
    });
    return this;
  }

  byDataPath(path: string, value: any) {
    this.filters.push((event) => {
      if (!event.data) return false;
      const result = this.getNestedValue(event.data, path);
      return result === value;
    });
    return this;
  }

  byTimeRange(start: Date, end: Date) {
    this.filters.push((event) => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= start && eventTime <= end;
    });
    return this;
  }

  byPredicate(predicate: FilterPredicate) {
    this.filters.push(predicate);
    return this;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      if (Array.isArray(current)) {
        // Handle array access with index or map over array
        const index = parseInt(key);
        if (!isNaN(index)) return current[index];
        return current.map(item => item[key]);
      }
      return current[key];
    }, obj);
  }

  private matchesPattern(obj: any, pattern: Pattern): boolean {
    for (const [key, value] of Object.entries(pattern)) {
      const actual = this.getNestedValue(obj, key);
      
      if (actual === undefined) return false;
      
      if (Array.isArray(actual)) {
        // Handle array matching
        if (Array.isArray(value)) {
          if (!this.arraysMatch(actual, value)) return false;
        } else if (!actual.includes(value)) {
          return false;
        }
      } else if (typeof value === 'object' && value !== null) {
        if (!this.matchesPattern(actual, value)) return false;
      } else if (actual !== value) {
        return false;
      }
    }
    return true;
  }

  private arraysMatch(arr1: any[], arr2: any[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((item, index) => {
      const value = arr2[index];
      if (typeof item === 'object' && item !== null) {
        return this.matchesPattern(item, value);
      }
      return item === value;
    });
  }

  build(): FilterPredicate {
    return (event) => this.filters.every(filter => filter(event));
  }
}

// Middleware factory for filtering events
export const createFilterMiddleware = (filter: FilterPredicate): EventMiddleware => {
  return (event) => filter(event) ? event : null;
};

// Middleware factory for transforming events
export const createTransformMiddleware = (transform: TransformFunction): EventMiddleware => {
  return (event) => transform(event);
};