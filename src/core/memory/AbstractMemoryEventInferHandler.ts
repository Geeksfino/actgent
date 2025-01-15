import { IMemoryEventHandler, MemoryEvent, MemoryEventType } from './events';

/**
 * Abstract base class for memory event handlers that use LLM inference
 * to process memory events and generate appropriate responses.
 */
export abstract class AbstractMemoryEventInferHandler implements IMemoryEventHandler {
    /**
     * Handle a memory event by extracting relevant data, prompting LLM,
     * and processing the response.
     */
    public async onEvent(event: MemoryEvent): Promise<void> {
        // Extract data based on event type
        const prompt = this.extractPromptData(event);
        
        // Get LLM response
        const response = await this.promptLLM(prompt);
        
        // Process the response
        await this.processMemory(response, event);
    }

    /**
     * Get the list of event types this handler can process
     */
    public canHandleEventTypes(): MemoryEventType[] {
        return [
            MemoryEventType.MEMORY_ACCESS,
            MemoryEventType.CONTEXT_CHANGE,
            MemoryEventType.EMOTIONAL_PEAK,
            MemoryEventType.GOAL_COMPLETED,
            MemoryEventType.CAPACITY_WARNING,
            MemoryEventType.CONSOLIDATE,
        ];
    }

    /**
     * Extract data from memory event to create a prompt for LLM
     */
    private extractPromptData(event: MemoryEvent): string {
        const basePrompt = `Process the following memory event:\nType: ${event.type}\nTimestamp: ${event.timestamp}\n`;
        
        switch (event.type) {
            case MemoryEventType.MEMORY_ACCESS:
                return `${basePrompt}Memory ID: ${event.metadata?.get('memoryId')}\n`;
                
            case MemoryEventType.CONTEXT_CHANGE:
                return `${basePrompt}New Context: ${JSON.stringify(event.context)}\n`;
                
            case MemoryEventType.EMOTIONAL_PEAK:
                return `${basePrompt}Emotion: ${JSON.stringify(event.emotion)}\n`;
                
            case MemoryEventType.GOAL_COMPLETED:
                return `${basePrompt}Goal ID: ${event.metadata?.get('goalId')}\n`;
                
            case MemoryEventType.CAPACITY_WARNING:
                return `${basePrompt}Memory capacity warning\n`;
                
            case MemoryEventType.CONSOLIDATE:
                return `${basePrompt}Memory consolidation event\n${
                    event.memory ? `Memory: ${JSON.stringify(event.memory)}\n` : ''
                }`;
                
            default:
                return `${basePrompt}${
                    event.memory ? `Memory: ${JSON.stringify(event.memory)}\n` : ''
                }${
                    event.metadata ? `Metadata: ${JSON.stringify(Object.fromEntries(event.metadata))}\n` : ''
                }`;
        }
    }

    /**
     * Send a prompt to the LLM and get its response
     * @param prompt The prompt to send to the LLM
     * @returns Promise resolving to the LLM's response
     */
    protected abstract promptLLM(prompt: string): Promise<string>;

    /**
     * Process the LLM's response in the context of the original event
     * @param response The LLM's response string
     * @param originalEvent The original memory event that triggered this processing
     */
    protected abstract processMemory(response: string, originalEvent: MemoryEvent): Promise<void>;
}
