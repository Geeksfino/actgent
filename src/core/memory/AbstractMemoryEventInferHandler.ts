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
            'working:add:item',
            'working:update:items',
            'working:forget:item',
            'semantic:extract:entities',
            'semantic:update:triples',
            'episodic:create:entry',
            'system:warn:capacity',
            'system:change:context',
            'system:complete:task'
        ];
    }

    /**
     * Extract data from memory event to create a prompt for LLM
     */
    private extractPromptData(event: MemoryEvent): string {
        const basePrompt = `Process the following memory event:\nType: ${event.type}\nTimestamp: ${event.timestamp}\n`;
        
        switch (event.type) {
            case 'working:add:item':
                return `${basePrompt}Memory added to working memory: ${JSON.stringify(event.memory)}\n`;
                
            case 'working:update:items':
                return `${basePrompt}Working memory updated: ${JSON.stringify(event.memory)}\n`;
                
            case 'working:forget:item':
                return `${basePrompt}Memory forgotten from working memory: ${JSON.stringify(event.memory)}\n`;
                
            case 'semantic:extract:entities':
                return `${basePrompt}Extracting entities from: ${JSON.stringify(event.memory)}\n`;
                
            case 'semantic:update:triples':
                return `${basePrompt}Updating semantic triples: ${JSON.stringify(event.memory)}\n`;
                
            case 'episodic:create:entry':
                return `${basePrompt}New episodic memory: ${JSON.stringify(event.memory)}\n`;
                
            case 'system:warn:capacity':
                return `${basePrompt}Memory capacity warning\n${
                    event.metadata ? `Details: ${JSON.stringify(Object.fromEntries(event.metadata))}\n` : ''
                }`;
                
            case 'system:change:context':
                return `${basePrompt}Context changed: ${JSON.stringify(event.context)}\n`;
                                
            case 'system:complete:task':
                return `${basePrompt}Task completed: ${JSON.stringify(event.metadata?.get('taskId'))}\n`;
                
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
