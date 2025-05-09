import { ConversationDataHandler, Message } from "@finogeek/actgent/core";
import fs from "fs";
import path from "path";

/**
 * A simple file-based conversation data handler that logs all messages to a file
 */
export class FileConversationHandler implements ConversationDataHandler {
  // Lower priority means this handler runs earlier in the chain
  priority = 10;
  
  private filePath: string;
  
  /**
   * Create a new file conversation handler
   * @param filePath Path to the log file (defaults to /tmp/actgent-conversations.log)
   */
  constructor(filePath: string = "/tmp/actgent-conversations.log") {
    this.filePath = filePath;
    
    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Initialize the file with a header if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath, 
        "# Actgent Conversation Log\n" +
        "# Format: [timestamp] [session_id] [agent_id] [sender] message\n" +
        "# Created: " + new Date().toISOString() + "\n\n"
      );
    }
  }
  
  /**
   * Handle a conversation message by logging it to a file
   * @param message The message to handle
   * @param agentId The ID of the agent
   */
  async handleMessage(message: Message, agentId: string): Promise<void> {
    try {
      // Format the log entry
      const timestamp = new Date().toISOString();
      const sender = message.metadata?.sender || "unknown";
      
      // Get content based on message type and sender
      let content = message.payload.input;
      let messageType = "TEXT";
      
      // Handle empty content or special message types
      if (content === "" || content === undefined) {
        // Check for tool calls
        if (message.metadata?.context?.tool_calls) {
          content = JSON.stringify(message.metadata.context.tool_calls);
          messageType = "TOOL_CALL";
        }
        // Check for other context data that might contain the actual message
        else if (message.metadata?.context) {
          content = JSON.stringify(message.metadata.context);
          messageType = "CONTEXT_DATA";
        }
      }
      
      // Ensure we have some content to log
      if (!content || content === "") {
        content = "[EMPTY MESSAGE]";
      }
      
      // Clean up content for logging (replace newlines with spaces)
      if (typeof content === "string") {
        content = content.replace(/\n/g, " ");
      } else {
        content = JSON.stringify(content);
      }
      
      // Truncate very long messages
      if (content.length > 1000) {
        content = content.substring(0, 997) + "...";
      }
      
      // Create the log entry
      const logEntry = `[${timestamp}] [${message.sessionId}] [${agentId}] [${sender}] [${messageType}] ${content}\n`;
      
      // Append to the log file
      fs.appendFileSync(this.filePath, logEntry);
    } catch (error) {
      console.error("Error logging conversation to file:", error);
    }
  }
}
