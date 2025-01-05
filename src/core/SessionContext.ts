import { Session } from "./Session";
import { Message } from "./Message";

export class SessionContext {
    private session: Session;
    private state: { [key: string]: any } = {};
    private messages: Message[] = [];  // Store messages

    constructor(session: Session) {
      this.session = session;
      this.state = {};
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
  
    public updateState(newState: { [key: string]: any }): void {
      this.state = { ...this.state, ...newState };
    }
  
    public getState(): { [key: string]: any } {
      return this.state;
    }

    public getLatestMessage(): Message {
      return this.messages[this.messages.length - 1];
    }
}