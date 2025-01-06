import { Session } from "./Session";
import { Message } from "./Message";
import { Instruction } from "./configs";

export enum SessionState {
  Start,
  Active,
  Waiting,
  Paused,
  Terminated,
  TopicIdentification,
  ErrorRecovery,
  Escalation,
};
export class SessionContext {
    private session: Session;
    private state: SessionState = SessionState.Start;
    private messages: Message[] = [];  // transient history
    private startTime: Date;
    private lastInteractionTime: Date;
    private currentTopic: string = '';
    private currentInstruction: Instruction | null = null;

    constructor(session: Session) {
      this.session = session;
      this.state = SessionState.Start;
      this.startTime = new Date();
      this.lastInteractionTime = new Date();
      this.session.setContext(this);
    }
  
    public addMessage(message: Message): void {  // Add message to history
      this.messages.push(message);
    }

    public setLastInteractionTime(): void {
      this.lastInteractionTime = new Date();
    }

    public setCurrentTopic(topic: string): void {
      this.currentTopic = topic;
    }

    public getCurrentTopic(): string {
      return this.currentTopic;
    }

    public setCurrentInstruction(instruction: Instruction): void {
      this.currentInstruction = instruction;
    }

    public getCurrentInstruction(): Instruction | null {
      return this.currentInstruction;
    }

    public getMessages(): Message[] {  // Retrieve all messages
        return this.messages;
    }

    public getSession(): Session {
      return this.session;
    }

    public getSessionId(): string {
      return this.session.sessionId;
    }
  
    public updateState(newState: SessionState): void {
      this.state = newState;
    }
  
    public getState(): SessionState {
      return this.state;
    }

    public getLatestMessage(): Message {
      return this.messages[this.messages.length - 1];
    }
  
    public getStartTime(): Date {
      return this.startTime;
    }
  
    public getLastInteractionTime(): Date {
      return this.lastInteractionTime;
    }
}