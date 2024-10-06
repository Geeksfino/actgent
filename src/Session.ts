import { AgentCore } from "./AgentCore";
import { ClassificationTypeConfig } from "./IClassifier";
import { Message } from "./Message";
import { InferClassificationUnion } from "./TypeInference";

export class Session {
    core: AgentCore;
    owner: string;
    sessionId: string;
    description: string;
    parentSessionId?: string;  // Optional reference to the parent session
    subtasks?: Session[];  

    private clarificationHandlers: Array<(obj: any) => void> = [];
    private responseHandlers: Array<(obj: any) => void> = [];

    constructor(core: AgentCore, owner: string, sessionId: string, description: string, parentSessionId?: string) {
        this.core = core;
        this.owner = owner;
        this.sessionId = sessionId;
        this.description = description;
        this.parentSessionId = parentSessionId
    }

    public createMessage(message: string): Message {
        const msg = new Message(this.sessionId, message);
        this.core.getSessionContext(this.sessionId).addMessage(msg);  // Add message to context
        return msg;
    }

    public async chat(message: string): Promise<void> {
        const msg = this.createMessage(message);
        this.core.receive(msg);
    }

    public onClarificationNeeded<T extends readonly ClassificationTypeConfig[]>(handler: (obj: InferClassificationUnion<T>) => void): void {
        this.clarificationHandlers.push(handler);
    }

    public onResult<T extends readonly ClassificationTypeConfig[]>(handler: (obj: InferClassificationUnion<T>) => void): void {
        this.responseHandlers.push(handler);
    }

    // Method to trigger clarification needed handlers
    public triggerClarificationNeeded<T extends readonly ClassificationTypeConfig[]>(obj: InferClassificationUnion<T>): void {
        //console.log("trigger:" + JSON.stringify(obj));
        this.clarificationHandlers.forEach(handler => {
            if (typeof handler === 'function') {  // Check if handler is a function
                handler(obj);
            }
        });
    }

    // Method to trigger response handlers
    public triggerHandleResult<T extends readonly ClassificationTypeConfig[]>(obj: InferClassificationUnion<T>): void {
        this.responseHandlers.forEach(handler => handler(obj));
    }
}