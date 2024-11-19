import { Session } from '../core/Session';

export interface RequestHandler {
  onCreateSession(owner: string, description: string, enhancePrompt?: boolean): Promise<Session>;
  onChat(sessionId: string, message: string): Promise<void>;
}

export interface CommunicationProtocol {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export abstract class BaseCommunicationProtocol implements CommunicationProtocol {
  constructor(protected handler: RequestHandler) {}
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
} 