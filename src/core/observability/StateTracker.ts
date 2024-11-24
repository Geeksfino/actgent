import { AgentEvent } from './event_validation';
import { Observable, ObservableResult, Observe } from './Observable';
import { v4 as uuidv4 } from 'uuid';

export enum AgentState {
  INITIALIZING = 'INITIALIZING',      // Agent is starting up and configuring
  IDLE = 'IDLE',                      // Agent is ready but not processing
  PROCESSING = 'PROCESSING',          // Agent is actively processing a message/task
  REASONING = 'REASONING',            // Agent is in reasoning/planning phase
  EXECUTING = 'EXECUTING',            // Agent is executing a planned action
  WAITING_FOR_TOOL = 'WAITING_FOR_TOOL', // Agent is waiting for tool execution
  WAITING_FOR_LLM = 'WAITING_FOR_LLM',   // Agent is waiting for LLM response
  ERROR = 'ERROR',                    // Agent encountered an error
  PAUSED = 'PAUSED',                  // Agent execution temporarily paused
  SHUTDOWN = 'SHUTDOWN'               // Agent is shutting down or stopped
}

// Valid state transitions
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.INITIALIZING]: [AgentState.IDLE, AgentState.ERROR],
  [AgentState.IDLE]: [AgentState.PROCESSING, AgentState.SHUTDOWN, AgentState.PAUSED, AgentState.ERROR],
  [AgentState.PROCESSING]: [AgentState.REASONING, AgentState.EXECUTING, AgentState.IDLE, AgentState.ERROR, AgentState.PAUSED],
  [AgentState.REASONING]: [AgentState.EXECUTING, AgentState.WAITING_FOR_LLM, AgentState.PROCESSING, AgentState.ERROR, AgentState.PAUSED],
  [AgentState.EXECUTING]: [AgentState.WAITING_FOR_TOOL, AgentState.PROCESSING, AgentState.IDLE, AgentState.ERROR, AgentState.PAUSED],
  [AgentState.WAITING_FOR_TOOL]: [AgentState.EXECUTING, AgentState.PROCESSING, AgentState.ERROR, AgentState.PAUSED],
  [AgentState.WAITING_FOR_LLM]: [AgentState.REASONING, AgentState.PROCESSING, AgentState.ERROR, AgentState.PAUSED],
  [AgentState.ERROR]: [AgentState.IDLE, AgentState.SHUTDOWN],
  [AgentState.PAUSED]: [AgentState.PROCESSING, AgentState.IDLE, AgentState.SHUTDOWN],
  [AgentState.SHUTDOWN]: []  // Terminal state
};

export type StateTransition = {
  from: AgentState;
  to: AgentState;
  timestamp: string;
  reason?: string;
};

export class StateTracker extends Observable {
  private static instance: StateTracker;
  private currentStates: Map<string, AgentState> = new Map();
  private stateHistory: Map<string, StateTransition[]> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): StateTracker {
    if (!StateTracker.instance) {
      StateTracker.instance = new StateTracker();
    }
    return StateTracker.instance;
  }

  @Observe({
    metadata: {
      source: 'StateTracker',
      tags: ['state_change']
    }
  })
  public setState(agentId: string, newState: AgentState, reason?: string): ObservableResult<boolean> {
    const currentState = this.currentStates.get(agentId);
    
    // Validate state transition
    if (currentState && !this.isValidTransition(currentState, newState)) {
      const error = `Invalid state transition from ${currentState} to ${newState}`;
      return {
        result: false,
        event: this.generateEvent('setState', false, new Error(error))
      };
    }

    const transition: StateTransition = {
      from: currentState || AgentState.SHUTDOWN,
      to: newState,
      timestamp: new Date().toISOString(),
      reason
    };

    this.recordTransition(agentId, transition);
    this.currentStates.set(agentId, newState);

    return {
      result: true,
      event: {
        eventId: uuidv4(),
        eventType: 'STATE_CHANGED',
        timestamp: transition.timestamp,
        agentId,
        data: {
          stateInfo: {
            previousState: transition.from,
            currentState: transition.to,
            reason: transition.reason
          }
        }
      }
    };
  }

  @Observe({
    metadata: {
      source: 'StateTracker',
      tags: ['agent_start']
    }
  })
  public initializeAgent(agentId: string): ObservableResult<void> {
    return {
      result: undefined,
      event: {
        eventId: uuidv4(),
        eventType: 'AGENT_STARTED',
        timestamp: new Date().toISOString(),
        agentId,
        data: {
          stateInfo: {
            currentState: AgentState.INITIALIZING,
            reason: 'Agent initialization'
          }
        }
      }
    };
  }

  @Observe({
    metadata: {
      source: 'StateTracker',
      tags: ['agent_stop']
    }
  })
  public shutdownAgent(agentId: string, reason?: string): ObservableResult<void> {
    const currentState = this.currentStates.get(agentId);
    if (currentState) {
      this.setState(agentId, AgentState.SHUTDOWN, reason || 'Agent shutdown requested');
    }

    return {
      result: undefined,
      event: {
        eventId: uuidv4(),
        eventType: 'AGENT_STOPPED',
        timestamp: new Date().toISOString(),
        agentId,
        data: {
          stateInfo: {
            previousState: currentState,
            currentState: AgentState.SHUTDOWN,
            reason: reason || 'Agent shutdown requested'
          }
        }
      }
    };
  }

  private isValidTransition(from: AgentState, to: AgentState): boolean {
    const validTransitions = VALID_TRANSITIONS[from];
    return validTransitions.includes(to);
  }

  private recordTransition(agentId: string, transition: StateTransition): void {
    if (!this.stateHistory.has(agentId)) {
      this.stateHistory.set(agentId, []);
    }
    this.stateHistory.get(agentId)!.push(transition);
  }

  public getCurrentState(agentId: string): AgentState | undefined {
    return this.currentStates.get(agentId);
  }

  public getStateHistory(agentId: string): StateTransition[] {
    return this.stateHistory.get(agentId) || [];
  }

  public getStateStats(agentId: string): Record<AgentState, number> {
    const stats: Record<AgentState, number> = Object.values(AgentState).reduce(
      (acc, state) => ({ ...acc, [state]: 0 }),
      {} as Record<AgentState, number>
    );

    const history = this.getStateHistory(agentId);
    history.forEach(transition => {
      stats[transition.to]++;
    });

    return stats;
  }
}
