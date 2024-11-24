import { AgentEvent } from './event_validation';
import { Observable, ObservableResult, Observe } from './Observable';
import { v4 as uuidv4 } from 'uuid';

export type MetricValue = {
  value: number;
  timestamp: string;
  dimensions?: Record<string, string>;
};

export type MetricName = 
  | 'latency'
  | 'tokens'
  | 'memory_usage'
  | 'cpu_usage'
  | 'success_rate'
  | 'error_rate'
  | 'tool_usage'
  | 'prompt_length';

export class MetricsCollector extends Observable {
  private static instance: MetricsCollector;
  private metrics: Map<string, MetricValue[]> = new Map();
  private alertThresholds: Map<string, number> = new Map();

  private constructor() {
    super();
    this.setupEventListeners();
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  private setupEventListeners(): void {
    this.emitter.on('METRIC_REPORTED', this.handleMetricEvent.bind(this));
  }

  @Observe({
    metadata: {
      source: 'MetricsCollector',
      tags: ['metrics', 'collection']
    }
  })
  private handleMetricEvent(event: AgentEvent): ObservableResult<void> {
    if (!event.data?.metrics) return { result: undefined };

    const metrics = event.data.metrics;
    const key = this.buildMetricKey(
      'responseTime' in metrics ? 'latency' : 'tokens',
      event.agentId,
      undefined
    );

    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const value: MetricValue = {
      value: 'responseTime' in metrics ? metrics.responseTime! : metrics.tokenUsage!,
      timestamp: new Date().toISOString()
    };

    this.metrics.get(key)!.push(value);

    // Check alert thresholds
    if (this.alertThresholds.has(key) && value.value > this.alertThresholds.get(key)!) {
      return {
        result: undefined,
        event: {
          eventId: uuidv4(),
          timestamp: new Date().toISOString(),
          eventType: 'ERROR',
          agentId: event.agentId,
          data: {
            metrics: {
              responseTime: value.value,
              confidenceScore: 1.0
            }
          },
          metadata: {
            source: 'MetricsCollector',
            tags: ['alert', 'threshold']
          }
        }
      };
    }

    return { result: undefined };
  }

  private buildMetricKey(
    metricName: string,
    agentId: string,
    dimensions?: Record<string, string>
  ): string {
    let key = `${agentId}:${metricName}`;
    if (dimensions) {
      const sortedDims = Object.entries(dimensions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      key += `:${sortedDims}`;
    }
    return key;
  }

  @Observe({
    metadata: {
      source: 'MetricsCollector',
      tags: ['metrics', 'recording']
    }
  })
  public recordMetric(
    agentId: string,
    metricName: MetricName,
    value: number,
    dimensions?: Record<string, string>
  ): ObservableResult<void> {
    const metrics: Record<string, number> = {};
    switch(metricName) {
      case 'latency':
        metrics.responseTime = value;
        break;
      case 'tokens':
        metrics.tokenUsage = value;
        break;
      case 'memory_usage':
        metrics.memoryUsage = value;
        break;
      case 'success_rate':
        metrics.strategySuccessRate = value;
        break;
      default:
        metrics.responseTime = value;
    }

    const event: AgentEvent = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'METRIC_REPORT',
      agentId,
      data: {
        metrics
      },
      metadata: {
        source: 'MetricsCollector',
        tags: ['metric']
      }
    };

    this.emitter.emit('METRIC_REPORTED', event);
    return { 
      result: undefined,
      event: {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType: 'METRIC_REPORT',
        agentId,
        data: {
          metrics: {
            responseTime: value,
            confidenceScore: 1.0
          }
        },
        metadata: {
          source: 'MetricsCollector',
          tags: ['metric', 'recorded']
        }
      }
    };
  }

  @Observe()
  public getMetric(
    agentId: string,
    metricName: MetricName,
    dimensions?: Record<string, string>
  ): ObservableResult<MetricValue[]> {
    const key = this.buildMetricKey(metricName, agentId, dimensions);
    return {
      result: this.metrics.get(key) || [],
      event: {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType: 'METRIC_REPORT',
        agentId,
        data: {
          metrics: {
            responseTime: 0,
            confidenceScore: 1.0
          }
        },
        metadata: {
          source: 'MetricsCollector',
          tags: ['metric', 'query']
        }
      }
    };
  }

  @Observe()
  public getMetricAverage(
    agentId: string,
    metricName: MetricName,
    timeWindowMs: number,
    dimensions?: Record<string, string>
  ): ObservableResult<number> {
    const values = this.getMetric(agentId, metricName, dimensions).result;
    const now = Date.now();
    const filtered = values.filter(
      v => now - new Date(v.timestamp).getTime() <= timeWindowMs
    );

    const average = filtered.length === 0 ? 0 : 
      filtered.reduce((sum, v) => sum + v.value, 0) / filtered.length;

    return {
      result: average,
      event: {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType: 'METRIC_REPORT',
        agentId,
        data: {
          metrics: {
            responseTime: average,
            confidenceScore: 1.0
          }
        },
        metadata: {
          source: 'MetricsCollector',
          tags: ['metric', 'aggregation']
        }
      }
    };
  }

  @Observe()
  public setAlertThreshold(
    agentId: string,
    metricName: MetricName,
    threshold: number,
    dimensions?: Record<string, string>
  ): ObservableResult<void> {
    const key = this.buildMetricKey(metricName, agentId, dimensions);
    this.alertThresholds.set(key, threshold);
    return {
      result: undefined,
      event: {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType: 'METRIC_REPORT',
        agentId,
        data: {
          metrics: {
            responseTime: threshold,
            confidenceScore: 1.0
          }
        },
        metadata: {
          source: 'MetricsCollector',
          tags: ['metric', 'threshold']
        }
      }
    };
  }

  @Observe()
  public clear(): ObservableResult<void> {
    this.metrics.clear();
    this.alertThresholds.clear();
    return {
      result: undefined,
      event: {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType: 'METRIC_REPORT',
        agentId: undefined,
        data: {
          metrics: {
            responseTime: 0,
            confidenceScore: 1.0
          }
        },
        metadata: {
          source: 'MetricsCollector',
          tags: ['metric', 'clear']
        }
      }
    };
  }
}
