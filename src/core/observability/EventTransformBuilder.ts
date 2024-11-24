import { AgentEvent } from './event_validation';

type FieldTransform = {
  [key: string]: (value: any) => any;
};

type TransformPredicate = (event: AgentEvent) => boolean;
type TransformFn = (event: AgentEvent) => AgentEvent;

export class EventTransformBuilder {
  private transforms: TransformFn[] = [];
  private filters: TransformPredicate[] = [];

  // Add metadata to event
  withMetadata(metadata: Record<string, any>) {
    this.transforms.push((event) => ({
      ...event,
      metadata: {
        ...event.metadata,
        ...metadata
      }
    }));
    return this;
  }

  // Add or update any data field
  withData(path: string, value: any) {
    this.transforms.push((event) => {
      const result = { ...event };
      const parts = path.split('.');
      let current: any = result;
      
      // Navigate to the parent object
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      // Set the value
      const lastPart = parts[parts.length - 1];
      if (typeof value === 'object' && value !== null) {
        current[lastPart] = {
          ...(current[lastPart] || {}),
          ...value
        };
      } else {
        current[lastPart] = value;
      }
      
      return result;
    });
    return this;
  }

  // Filter events by predicate
  where(predicate: TransformPredicate) {
    this.filters.push(predicate);
    return this;
  }

  // Filter events by time range
  inTimeRange(start: Date, end: Date) {
    return this.where(event => {
      const timestamp = new Date(event.timestamp);
      return timestamp >= start && timestamp <= end;
    });
  }

  // Filter events by type
  ofType(eventType: string) {
    return this.where(event => event.eventType === eventType);
  }

  // Filter events by agent
  fromAgent(agentId: string) {
    return this.where(event => event.agentId === agentId);
  }

  // Redact sensitive fields
  withRedaction(paths: string[]) {
    this.transforms.push((event) => {
      const redactedEvent = JSON.parse(JSON.stringify(event));
      for (const path of paths) {
        const parts = path.split('.');
        let current: any = redactedEvent;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) break;
          current = current[parts[i]];
        }
        const lastPart = parts[parts.length - 1];
        if (current && current[lastPart] !== undefined) {
          current[lastPart] = '[REDACTED]';
        }
      }
      return redactedEvent;
    });
    return this;
  }

  // Transform specific fields
  withFieldTransform(transforms: FieldTransform) {
    this.transforms.push((event) => {
      const transformedEvent = JSON.parse(JSON.stringify(event));
      for (const [path, transform] of Object.entries(transforms)) {
        const parts = path.split('.');
        let current: any = transformedEvent;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) break;
          current = current[parts[i]];
        }
        const lastPart = parts[parts.length - 1];
        if (current && current[lastPart] !== undefined) {
          current[lastPart] = transform(current[lastPart]);
        }
      }
      return transformedEvent;
    });
    return this;
  }

  // Build final transform function
  build(): (event: AgentEvent) => AgentEvent | null {
    return (event) => {
      // Apply all filters first
      if (this.filters.some(filter => !filter(event))) {
        return null;
      }

      // Then apply all transforms
      return this.transforms.reduce(
        (transformedEvent, transform) => transform(transformedEvent),
        event
      );
    };
  }
}
