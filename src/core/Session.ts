import { AgentCore } from "./AgentCore";
import { ClassificationTypeConfig } from "./IClassifier";
import { Message } from "./Message";
import { InferClassificationUnion } from "./TypeInference";
import { Tool } from "./interfaces";
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
        const instructionName = obj.messageType;
        const tool:Tool | undefined = this.core.getTool(instructionName);
        if (tool) {
            const result = await tool.execute(obj);
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
