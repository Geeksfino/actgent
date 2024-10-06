import { Session } from "./Session";
import { Message } from "./Message";
export class SessionContext {
    private session: Session;
    private conversationHistory: string[] = [];
    private state: { [key: string]: any } = {};
    private subtasks: SessionContext[] = [];
    private messages: Message[] = [];  // Store messages

    constructor(session: Session) {
      this.session = session;
      this.conversationHistory = [];
      this.state = {};
    }
  
    public addToHistory(response: string): void {
      this.conversationHistory.push(response);
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

    public getHistory(): string[] {
      return this.conversationHistory;
    }
  
    public getSessionVariables(): { [key: string]: string } {
      return { sessionId: this.session.sessionId, history: this.conversationHistory.join('\n') };
    }
  
    public updateState(newState: { [key: string]: any }): void {
      this.state = { ...this.state, ...newState };
    }
  
    public getState(): { [key: string]: any } {
      return this.state;
    }

    public addSubtaskContext(subtaskContext: SessionContext): void {
        this.subtasks.push(subtaskContext);
      }
    
      public getSubtasks(): SessionContext[] {
        return this.subtasks;
      }
    
      public hasSubtasks(): boolean {
        return this.subtasks.length > 0;
      }
  
      public getParentSessionId(): string | undefined {
        return this.session.parentSessionId;
      }
  }