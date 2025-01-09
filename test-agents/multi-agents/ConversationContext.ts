import { DefaultSchemaBuilder } from "@finogeeks/actgent";

export type ClarificationNeededMessage = {
    messageType: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED;
    content: {
      questions: string[];
    };
  };
  
  export type ConfirmationNeededMessage = {
    messageType: typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED;
    content: {
      prompt: string;
      options: string[];
    };
  };
  
  export type TaskCompleteMessage = {
    messageType: typeof DefaultSchemaBuilder.TASK_COMPLETE;
    content: {
      result: string;
    };
  };
  
  export type ErrorOrUnableMessage = {
    messageType: typeof DefaultSchemaBuilder.ERROR_OR_UNABLE;
    content: {
      reason: string;
      suggestedAction: string;
    };
  };
  
  export type CommandMessage = {
    messageType: typeof DefaultSchemaBuilder.COMMAND;
    content: {
      action: string;
      parameters: Record<string, string>;
    };
  };
  
  export type UserInputMessage = {
    messageType: "USER_INPUT";
    content: string;
  };
  
  export type ContextAwareMessage = {
    messageType: "CONTEXT_AWARE";
    content: string;
  };
  
  export type AgentMessage =
    | ClarificationNeededMessage
    | ConfirmationNeededMessage
    | TaskCompleteMessage
    | ErrorOrUnableMessage
    | CommandMessage
    | UserInputMessage
    | ContextAwareMessage;

export interface MessageContext {
  originator: string;
  recipient: string;
  content: AgentMessage;
}

export class ConversationContext {
  private context: MessageContext[];
  private maxEntries: number;

  constructor(maxEntries: number = 50) {
    this.context = [];
    this.maxEntries = maxEntries;
  }

  addEntry(originator: string, recipient: string, content: AgentMessage): void {
    // Skip orchestrator's internal messages
    if (originator === "ORCHESTRATOR" && recipient !== "USER") {
      return;
    }

    const entry: MessageContext = {
      originator,
      recipient,
      content,
    };

    this.context.push(entry);

    if (this.context.length > this.maxEntries) {
      this.context.shift(); // Remove oldest entry if we exceed maxEntries
    }

    // Log the current conversation context
    // console.log("Current Conversation Context:");
    // console.log(this.getFullContext());
  }

  getRecentContext(count: number = 5): MessageContext[] {
    return this.context.slice(-count);
  }

  getContextForAgent(agentName: string, count: number = 5): MessageContext[] {
    return this.context
      .filter(
        (entry) =>
          entry.originator === agentName || entry.recipient === agentName
      )
      .slice(-count);
  }

  clearContext(): void {
    this.context = [];
  }

  summarizeContext(): string {
    // This is a simple implementation. In a real-world scenario,
    // you might want to use more sophisticated summarization techniques.
    return this.context
      .map(
        (entry) =>
          `${entry.originator} to ${entry.recipient}: ${JSON.stringify(entry.content)}`
      )
      .join("\n");
  }

  getFullContext(): string {
    return this.context
      .map((entry) => {
        let content: string;
        if (typeof entry.content === 'string') {
          content = entry.content;
        } else if (entry.content.messageType === 'CONTEXT_AWARE') {
          content = entry.content.content;
        } else {
          content = JSON.stringify(entry.content);
        }
        return `[${entry.originator} to ${entry.recipient}]: ${content}`;
      })
      .join("\n");
  }
}
