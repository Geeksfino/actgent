import { AgentCore } from "./AgentCore";
import { ClassificationTypeConfig } from "./IClassifier";
import { Message, PayloadType } from "./Message";
import { InferClassificationUnion } from "./TypeInference";
import { Tool, ValidationError, ToolOutput } from "./Tool";
import { logger } from './Logger';
import { SessionContext } from './SessionContext';
export class Session {
    core: AgentCore;
    owner: string;
    sessionId: string;
    context: SessionContext | null = null;
    description: string;
    parentSessionId?: string;  // Optional reference to the parent session
    subtasks?: Session[];  

    // this is to handle responses as structured results of LLM inference with instructions and matching handlers
    private eventHandlers: Array<(obj: any, session: Session) => void> = []; 

    // this is to handle responses as results of tool calls
    private toolResultHandlers: Array<(result: any, session: Session) => void> = []; 

    // this is to handle responses as non-structured results of LLM inference with instructions but without registered handlers
    private conversationHandlers: Array<(obj: any, session: Session) => void> = []; 

    // this is to handle responses as results of anything exceptional
    private exceptionHandlers: Array<(obj: any, session: Session) => void> = []; 

    // New routing handler
    private routingHandlers: Array<(message: any, session: Session) => void> = [];

    constructor(core: AgentCore, owner: string, sessionId: string, description: string, parentSessionId?: string) {
        this.core = core;
        this.owner = owner;
        this.sessionId = sessionId;
        this.description = description;
        this.parentSessionId = parentSessionId;
        
        logger.debug('Session created:', this.sessionId);
    }

    // Overloaded method signatures for createMessage
    public createMessage(message: string): Message;
    public createMessage(message: string, sender?: string): Message;
    public createMessage(message: string, sender?: string, context?: Record<string, any>): Message;
    public createMessage(message: string, sender: string = this.owner, context: Record<string, any> = {}): Message {
        const msg = new Message(this.sessionId, message, PayloadType.TEXT, {}, context, sender);
        return msg;
    }

    // Overloaded method signatures for chat
    public chat(message: string): Promise<void>;
    public chat(message: string, sender?: string): Promise<void>;
    public chat(message: string, sender?: string, context?: Record<string, any>): Promise<void>;
    public async chat(message: string, sender: string = this.owner, context: Record<string, any> = {}): Promise<void> {
        const msg = this.createMessage(message, sender, context);
        this.core.receive(msg);
    }

    public setContext(context: SessionContext): void {
        this.context = context;
    }

    public getContext(): SessionContext | null {
        return this.context;
    }
    
    public onEvent<
        InstructionType extends InferClassificationUnion<T>,
        ToolOutputType extends ToolOutput,
        T extends readonly ClassificationTypeConfig[]
    >(handler: (result: ToolOutputType | InstructionType, session: Session) => void): void {
        this.eventHandlers.push(handler);
    }

    // Add method to register tool result handlers
    public onToolResult<TOutput extends ToolOutput>(
        handler: (result: TOutput, session: Session) => void
    ): void {
        this.toolResultHandlers.push(handler);
    }

    public onConversation(handler: (obj: any, session: Session) => void): void {
        this.conversationHandlers.push(handler);
    }

    public onException(handler: (obj: any, session: Session) => void): void {
        this.exceptionHandlers.push(handler);
    }

    public onRouting(handler: (message: any, session: Session) => void): void {
        this.routingHandlers.push(handler);
    }

    // Updated triggerEventHandlers method with proper generic typing
    public async triggerEventHandlers<
        TInput extends InferClassificationUnion<T>,
        TOutput extends ToolOutput,
        T extends readonly ClassificationTypeConfig[]
    >(obj: TInput): Promise<void> { 
        logger.debug(`Session: Triggering event handlers for object:`, obj);
        const instructionName = obj.messageType;
        const toolName = this.core.getToolForInstruction(instructionName);
        
        if (toolName) {
            const tool = this.core.getTool(toolName) as Tool<TInput, TOutput> | undefined;
            
            if (tool) {
                const result = await tool.run(obj, {});
                this.eventHandlers.forEach(handler => {
                    if (typeof handler === 'function') {  
                        handler(result, this);
                    }
                });
            } else {
                // If no tool found, pass through the original object
                this.eventHandlers.forEach(handler => {
                    if (typeof handler === 'function') {  
                        handler(obj, this);
                    }
                });
            }
        } else {
            // Handle direct messages or responses without tools
            this.eventHandlers.forEach(handler => {
                if (typeof handler === 'function') {  
                    handler(obj, this);
                }
            });
        }
    }

    // Similarly, update triggerToolCallsHandlers with proper typing
    public async triggerToolCallsHandlers<
        TInput extends InferClassificationUnion<T>,
        TOutput extends ToolOutput,
        T extends readonly ClassificationTypeConfig[]
    >(obj: TInput): Promise<void> { 
        logger.debug(`Session: Triggering tool call handlers for object:`, obj);
        const toolName = obj.toolName;
        const tool = this.core.getTool(toolName) as Tool<TInput, TOutput> | undefined;
        
        if (tool) {
            try {
                const toolInput = (obj as any).arguments;
                const result = await tool.run(toolInput, {});
                const successResult = { status: 'success', data: result };
                this.toolResultHandlers.forEach(handler => {
                    if (typeof handler === 'function') { 
                        handler(successResult, this);
                    }
                });
            } catch (error) {
                const failureResult = {
                    status: 'failure',
                    data: null,
                    error: error instanceof Error ? error.message : String(error)
                };
                if (error instanceof ValidationError) {
                    logger.warning(`Validation error in tool ${toolName}:`, error.message, error.errors);
                    failureResult.error = `Validation error: ${error.message}`;
                } else {
                    logger.error(`Error executing tool ${toolName}:`, error);
                }
                this.toolResultHandlers.forEach(handler => {
                    if (typeof handler === 'function') {
                        handler(failureResult, this);
                    }
                });
            }
        }
    }

    public async triggerConversationHandlers(obj: any): Promise<void> {
        logger.debug(`Session: Triggering conversation handlers for object:`, obj);
        this.conversationHandlers.forEach(handler => {
            if (typeof handler === 'function') {
                handler(obj, this);
            }
        });
    }

    public async triggerExceptionHandlers(obj: any): Promise<void> {
        logger.debug(`Session: Triggering exception handlers for object:`, obj);
        this.exceptionHandlers.forEach(handler => {
            if (typeof handler === 'function') {
                handler(obj, this);
            }
        });
    }

    public async triggerRoutingHandlers(message: any): Promise<void> {
        logger.debug(`Session: Triggering routing handlers for message:`, message);
        for (const handler of this.routingHandlers) {
            try {
                await handler(message, this);
            } catch (error) {
                logger.error("Error in routing handler:", error);
            }
        }
    }
}
