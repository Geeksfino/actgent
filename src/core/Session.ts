import { AgentCore } from "./AgentCore";
import { ClassificationTypeConfig } from "./IClassifier";
import { Message } from "./Message";
import { InferClassificationUnion } from "./TypeInference";
import { JSONOutput, Tool, ValidationError } from "./Tool";
import { logger } from '../helpers/Logger';


export class Session {
    core: AgentCore;
    owner: string;
    sessionId: string;
    description: string;
    parentSessionId?: string;  // Optional reference to the parent session
    subtasks?: Session[];  

    private eventHandlers: Array<(obj: any) => void> = [];

    // Add new property for tool result handlers
    private toolResultHandlers: Array<(result: any) => void> = [];

    constructor(core: AgentCore, owner: string, sessionId: string, description: string, parentSessionId?: string) {
        this.core = core;
        this.owner = owner;
        this.sessionId = sessionId;
        this.description = description;
        this.parentSessionId = parentSessionId
        logger.debug('Session created:', this.sessionId);
    }

    public createMessage(message: string): Message {
        const msg = new Message(this.sessionId, message);
        //this.core.getSessionContext(this.sessionId).addMessage(msg);  
        return msg;
    }

    public async chat(message: string): Promise<void> {
        const msg = this.createMessage(message);
        this.core.receive(msg);
    }

    public onEvent<T extends readonly ClassificationTypeConfig[]>(handler: (obj: InferClassificationUnion<T>) => void): void {
        this.eventHandlers.push(handler);
    }

    // Add method to register tool result handlers
    public onToolResult(handler: (result: any) => void): void {
        this.toolResultHandlers.push(handler);
    }

    // Updated triggerEventHandlers method
    public async triggerEventHandlers<T extends readonly ClassificationTypeConfig[]>(obj: InferClassificationUnion<T>): Promise<void> { 
        logger.debug(`Session: Triggering event handlers for object:`, obj);
        const instructionName = obj.messageType;
        const toolName = this.core.getToolForInstruction(instructionName);
        if (toolName) {
            const tool:Tool<T> | undefined = this.core.getTool(toolName);
            if (tool) {
            const result = await tool.run(obj, {});
            // Notify tool result handlers
            this.toolResultHandlers.forEach(handler => {
                if (typeof handler === 'function') {
                    handler(result);
                }
            });
        }
        
        this.eventHandlers.forEach(handler => {
            if (typeof handler === 'function') {  
                handler(obj);
            }
            });
        }
    }

    public async triggerToolCallsHandlers<T extends readonly ClassificationTypeConfig[]>(obj: InferClassificationUnion<T>): Promise<void> { 
        logger.debug(`Session: Triggering tool call handlers for object:`, obj);
        const toolName = obj.toolName;
        const tool: Tool<T> | undefined = this.core.getTool(toolName);
        if (tool) {
            try {
                // Extract the arguments from the tool call object
                const toolInput = (obj as any).arguments;
                const result = await tool.run(toolInput, {});
                this.toolResultHandlers.forEach(handler => {
                    if (typeof handler === 'function') { 
                        handler(result);
                    }
                });
            } catch (error) {
                // Handle validation errors specifically
                if (error instanceof ValidationError) {
                    logger.warning(`Validation error in tool ${toolName}:`, error.message, error.errors);
                    // You might want to notify handlers with the error information
                    this.toolResultHandlers.forEach(handler => {
                        if (typeof handler === 'function') {
                            handler({ error: error.message, details: error.errors });
                        }
                    });
                } else {
                    // Handle other types of errors
                    logger.error(`Error executing tool ${toolName}:`, error);
                    this.toolResultHandlers.forEach(handler => {
                        if (typeof handler === 'function') {
                            handler({ error: 'Tool execution failed', details: error instanceof Error ? error.message : String(error) });
                        }
                    });
                }
            }
        }
    }
}
