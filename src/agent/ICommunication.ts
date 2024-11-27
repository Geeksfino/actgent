import { BaseAgent } from './BaseAgent';
import { logger } from '../core/Logger';
import { Session } from '../core/Session';

export class AgentRequestHandler {

    constructor(
        private agent: BaseAgent<any, any, any>,
    ) {}

    getAgent(): BaseAgent<any, any, any> {
        return this.agent;
    }
    
    async onCreateSession(owner: string, description: string, enhancePrompt?: boolean): Promise<Session> {
        try {
            const session = await this.agent.createSession(owner, description, enhancePrompt);
            return session;
        } catch (error) {
            logger.error(`[AgentRequestHandler] Failed to create session: ${error}`);
            throw error;
        }
    }

    async onChat(sessionId: string, message: string): Promise<void> {
        const session = this.agent.getSession(sessionId);
        if (!session) { 
            throw new Error(`Session not found: ${sessionId}`);
        }

        try {
            await session.chat(message, 'user');
        } catch (error) {
            logger.error(`[AgentRequestHandler] Failed to process chat for session ${sessionId}: ${error}`);
            throw error;
        }
    }
}

export interface CommunicationProtocol {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export abstract class BaseCommunicationProtocol implements CommunicationProtocol {
  constructor(protected handler: AgentRequestHandler) {}
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
} 