import { Observable, Observe } from '../core/observability/Observable';
import { AgentEvent } from '../core/observability/event_validation';
import { logger } from '../core/Logger';
import { v4 as uuidv4 } from 'uuid';

interface PartialLLMResponse {
  question_nature?: string;
  context?: {
    understanding?: string;
    approach?: string;
    considerations?: string[];
  };
  primary_action?: {
    response_purpose?: string;
    response_content?: {
      messageType?: string;
      actionPlan?: {
        task?: string;
        subtasks?: string[];
      };
    };
  };
  additional_info?: {
    results?: string;
    analysis?: string;
    next_steps?: string[];
  };
}

export class ReActLLMResponseStreamParser extends Observable {
  private buffer: string = '';
  private partialResponse: PartialLLMResponse = {};
  private step: number = 1;
  private hasEmittedContext: boolean = false;

  constructor() {
    super();
  }

  // Override generateEvent to provide LLM-specific event data
  public override generateEvent(methodName: string, result: any, error?: any): AgentEvent {
    const baseEvent = super.generateEvent(methodName, result, error);
    
    const eventData: AgentEvent = {
      ...baseEvent,
      eventId: baseEvent.eventId || uuidv4(),
      timestamp: baseEvent.timestamp || new Date().toISOString(),
      eventType: error ? 'ERROR' : 'LLM_RESPONSE',
      agentId: baseEvent.agentId || this.agentId,
      data: {
        reasoningInfo: {}
      }
    };

    switch (methodName) {
      case 'emitContextEvent':
        const contextData = result as PartialLLMResponse;
        if (contextData.context) {
          eventData.data!.reasoningInfo = {
            analysis: contextData.context.understanding,
            thoughts: contextData.context.approach,
            plan: contextData.context.considerations || [],
          };
        }
        break;

      case 'emitAdditionalInfoEvent':
        const additionalData = result as PartialLLMResponse;
        if (additionalData.additional_info) {
          eventData.data!.reasoningInfo = {
            review: additionalData.additional_info.analysis,
            suggestions: additionalData.additional_info.next_steps || [],
            expectation: additionalData.additional_info.results,
          };
        }
        break;
    }

    return eventData;
  }

  private findCompleteJson(buffer: string): { json: string, remainingBuffer: string } | null {
    let depth = 0;
    let startIndex = -1;
    
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      
      if (char === '{') {
        if (depth === 0) {
          startIndex = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        
        if (depth === 0 && startIndex !== -1) {
          // Found a complete, balanced JSON object
          const json = buffer.substring(startIndex, i + 1);
          const remainingBuffer = buffer.substring(i + 1);
          return { json, remainingBuffer };
        }
      }
    }
    
    return null;
  }

  processChunk(chunk: string): void {
    const cleanedChunk = chunk.replace(/```json\s*|\s*```/g, '');
    this.buffer += cleanedChunk;
    logger.debug(`Buffer after adding chunk: ${this.buffer}`);
    
    try {
      const result = this.findCompleteJson(this.buffer);
      if (result) {
        logger.debug(`Found complete JSON: ${result.json}`);
        try {
          const parsed = JSON.parse(result.json);
          logger.debug('Successfully parsed JSON:', parsed);
          this.updatePartialResponse(parsed);
          this.buffer = result.remainingBuffer;
          logger.debug(`Remaining buffer: ${this.buffer}`);
        } catch (e) {
          logger.warning(`Failed to parse JSON: ${e}`);
          logger.debug('Failed JSON string:', result.json);
        }
      } else {
        logger.debug('No complete JSON found in buffer');
      }
    } catch (error) {
      logger.error(`Error processing stream chunk: ${error}`);
    }
  }

  // Update our partial response and emit events when we have new metadata
  private updatePartialResponse(parsed: any): void {
    logger.debug('Updating partial response with:', parsed);
    
    // Emit context event if we have context and haven't emitted it yet
    if (parsed.context && !this.hasEmittedContext) {
      const contextEvent = this.generateEvent('emitContextEvent', parsed);
      logger.debug('Emitting context event:', contextEvent);
      this.emitAsync('LLM_RESPONSE', contextEvent); // Use sync emit for reliability
      this.hasEmittedContext = true;
    }

    // Emit additional info event if we have it
    if (parsed.additional_info) {
      const additionalEvent = this.generateEvent('emitAdditionalInfoEvent', parsed);
      logger.debug('Emitting additional info event:', additionalEvent);
      this.emitAsync('LLM_RESPONSE', additionalEvent); // Use sync emit for reliability
    }

    // Update our partial response for future reference
    if (parsed.context) {
      this.partialResponse.context = {
        ...this.partialResponse.context,
        ...parsed.context
      };
    }
    if (parsed.additional_info) {
      this.partialResponse.additional_info = {
        ...this.partialResponse.additional_info,
        ...parsed.additional_info
      };
    }
  }

  // Clear the parser state
  reset(): void {
    this.buffer = '';
    this.partialResponse = {};
    this.hasEmittedContext = false;
    this.step = 1;
  }
}