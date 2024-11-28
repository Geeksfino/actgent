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

  private findBalancedSubstring(str: string, startIndex: number): { content: string, endIndex: number } | null {
    let depth = 0;
    let i = startIndex;
    
    while (i < str.length) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) {
          return {
            content: str.substring(startIndex, i + 1),
            endIndex: i
          };
        }
      }
      i++;
    }
    return null;
  }

  private extractProgressiveKeys(buffer: string): { extracted: { [key: string]: any }, remainingBuffer: string } {
    let extracted: { [key: string]: any } = {};
    let remainingBuffer = buffer;

    try {
      // Find any key that's followed by an object
      const keyStartRegex = /"([^"]+)"\s*:\s*(?=\{)/g;
      let match;

      while ((match = keyStartRegex.exec(remainingBuffer)) !== null) {
        const key = match[1];
        const bracketStart = remainingBuffer.indexOf('{', match.index);
        
        // Use balanced substring finding for reliable JSON extraction
        const balanced = this.findBalancedSubstring(remainingBuffer, bracketStart);
        if (balanced) {
          try {
            extracted[key] = JSON.parse(balanced.content);
            // Only move forward in the buffer
            remainingBuffer = remainingBuffer.slice(balanced.endIndex + 1);
            // Reset regex to start from beginning of new buffer
            keyStartRegex.lastIndex = 0;
          } catch (e) {
            logger.warning(`Failed to parse ${key} JSON:`, e);
          }
        }
      }
    } catch (error) {
      logger.warning('Error in extractProgressiveKeys:', error);
    }

    return { extracted, remainingBuffer };
  }

  processChunk(chunk: string): void {
    const cleanedChunk = chunk.replace(/```json\s*|\s*```/g, '');
    this.buffer += cleanedChunk;
    logger.debug(`Buffer after adding chunk: ${this.buffer}`);

    try {
      const { extracted, remainingBuffer } = this.extractProgressiveKeys(this.buffer);
      if (Object.keys(extracted).length > 0) {
        logger.debug('Extracted data:', extracted);
        // Transform the extracted data to match the expected structure
        const parsedData: any = {};
        if ('context' in extracted) {
          parsedData.context = extracted.context;
        }
        if ('additional_info' in extracted) {
          parsedData.additional_info = extracted.additional_info;
        }
        
        // Only update if we have relevant keys
        if (Object.keys(parsedData).length > 0) {
          this.updatePartialResponse(parsedData);
        }
      }

      this.buffer = remainingBuffer;
    } catch (error) {
      logger.error(`Error processing stream chunk: ${error}`);
    }
  }

  processChunk_old(chunk: string): void {
    // Remove formatting markers (e.g., ```json ... ```)
    const cleanedChunk = chunk.replace(/```json\s*|\s*```/g, '');
    this.buffer += cleanedChunk;
    logger.debug(`Buffer after adding chunk: ${this.buffer}`);

    try {
      let result;
      while ((result = this.findCompleteJson(this.buffer)) !== null) {
        logger.debug(`Found complete JSON: ${result.json}`);
        try {
          const parsed = JSON.parse(result.json);
          logger.debug('Successfully parsed JSON:', parsed);
          this.updatePartialResponse(parsed); // Emit or process parsed JSON
          this.buffer = result.remainingBuffer; // Update buffer with remaining data
          logger.debug(`Remaining buffer: ${this.buffer}`);
        } catch (e) {
          logger.warning(`Failed to parse JSON: ${e}`);
          logger.debug('Failed JSON string:', result.json);
          break; // Avoid infinite loop if parsing fails
        }
      }

      if (!result) {
        logger.debug('No complete JSON found in buffer');
      }
    } catch (error) {
      logger.error(`Error processing stream chunk: ${error}`);
    }
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

  // Update our partial response and emit events when we have new metadata
  private updatePartialResponse(parsed: any): void {
    logger.debug('Updating partial response with:', parsed);

    // Emit context event if we have it
    if (parsed.context) {
      const contextEvent = this.generateEvent('emitContextEvent', parsed);
      logger.debug('Emitting context event:', contextEvent);
      this.emitAsync('LLM_RESPONSE', contextEvent);
    }

    // Emit additional info event if we have it
    if (parsed.additional_info) {
      const additionalEvent = this.generateEvent('emitAdditionalInfoEvent', parsed);
      logger.debug('Emitting additional info event:', additionalEvent);
      this.emitAsync('LLM_RESPONSE', additionalEvent);
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
  }
}