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
        console.log(`⭐ Session.triggerEventHandlers for messageType: ${obj.messageType}`);
        
        const instructionName = obj.messageType;
        const toolName = this.core.getToolForInstruction(instructionName);
        console.log(`⭐ Session: Tool for instruction ${instructionName}: ${toolName || 'none'}`); 
        
        if (toolName) {
            console.log(`⭐ Session: Looking up tool ${toolName} in registry`);
            const tool = this.core.getTool(toolName) as Tool<TInput, TOutput> | undefined;
            
            if (tool) {
                console.log(`⭐ Session: Found tool ${toolName}, executing...`);
                try {
                    const result = await tool.run(obj, {});
                    console.log(`⭐ Session: Tool ${toolName} execution successful: `, typeof result);
                    this.eventHandlers.forEach(handler => {
                        if (typeof handler === 'function') {  
                            handler(result, this);
                        }
                    });
                } catch (error) {
                    console.log(`❌ Session: Error executing tool ${toolName}:`, error);
                }
            } else {
                console.log(`❌ Session: Tool ${toolName} not found in registry`);
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

    // Handle tool calls from LLM and route the results properly
    public async triggerToolCallsHandlers<
        TInput extends InferClassificationUnion<T>,
        TOutput extends ToolOutput,
        T extends readonly ClassificationTypeConfig[]
    >(obj: TInput): Promise<void> { 
        logger.debug(`Session: Triggering tool call handlers for object:`, obj);
        const toolName = obj.name;
        logger.error(`Tool name: ${toolName}`);
        
        // Ensure we extract toolCallId consistently from multiple potential sources
        // This is important for proper OpenAI tool call response formatting
        const toolCallId = (obj as any).id || 
                          (obj as any).toolCallId || 
                          ((obj as any).originalToolCalls?.[0]?.id) || 
                          undefined;
        
        if (!toolName) {
            // Handle missing tool name
            const availableTools = Array.from(this.core['toolRegistry'].keys());
            logger.warning(`Tool call received without a valid tool name. Available tools: ${availableTools.join(', ')}`);
            
            const errorResult = {
                status: 'failure',
                error: `Tool call missing a valid tool name. Available tools: ${availableTools.join(', ')}`,
                toolCallId
            };
            
            this.toolResultHandlers.forEach(handler => {
                if (typeof handler === 'function') {
                    handler(errorResult, this);
                }
            });
            return;
        }
        
        const tool = this.core.getTool(toolName) as Tool<TInput, TOutput> | undefined;
        
        if (!tool) {
            // Handle tool not found
            const availableTools = Array.from(this.core['toolRegistry'].keys());
            logger.warning(`Tool "${toolName}" not found. Available tools: ${availableTools.join(', ')}`);
            
            const errorResult = {
                status: 'failure',
                error: `Tool "${toolName}" not found. Available tools: ${availableTools.join(', ')}`,
                toolCallId
            };
            
            this.toolResultHandlers.forEach(handler => {
                if (typeof handler === 'function') {
                    handler(errorResult, this);
                }
            });
            return;
        }
        
        // Tool exists, try to execute it
        try {
            const toolInput = (obj as any).arguments;
            const result = await tool.run(toolInput, {});
            
            // Success case
            const successResult = {
                status: 'success',
                data: result,
                toolName,
                toolCallId
            };
            
            this.toolResultHandlers.forEach(handler => {
                if (typeof handler === 'function') { 
                    handler(successResult, this);
                }
            });
        } catch (error) {
            // Handle execution error
            let errorMessage = error instanceof Error ? error.message : String(error);
            
            if (error instanceof ValidationError) {
                logger.warning(`Validation error in tool ${toolName}:`, errorMessage, (error as ValidationError).errors);
                errorMessage = `Validation error in tool "${toolName}": ${errorMessage}`;
            } else {
                logger.error(`Error executing tool ${toolName}:`, error);
                errorMessage = `Error executing tool "${toolName}": ${errorMessage}`;
            }
            
            const failureResult = {
                status: 'failure',
                error: errorMessage,
                toolName,
                toolCallId
            };
            
            this.toolResultHandlers.forEach(handler => {
                if (typeof handler === 'function') {
                    handler(failureResult, this);
                }
            });
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
