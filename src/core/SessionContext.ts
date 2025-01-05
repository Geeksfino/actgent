import { Session } from "./Session";
import { Message } from "./Message";

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

    constructor(session: Session) {
      this.session = session;
      this.state = SessionState.Start;
      this.startTime = new Date();
      this.lastInteractionTime = new Date();
    }
  
    public addMessage(message: Message): void {  // Add message to history
      this.messages.push(message);
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