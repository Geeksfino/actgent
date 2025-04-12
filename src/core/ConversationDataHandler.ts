import { Message } from './Message';

/**
 * Handler for processing conversation messages
 * 
 * This interface allows agent developers to implement custom handlers for various purposes:
 * - Persistence: Store conversation messages in databases or log files
 * - Monitoring: Track specific content or patterns in conversations
 * - Forwarding: Send conversation data to external systems or other agents
 * - Analytics: Collect metrics and insights from conversations
 * - Compliance: Implement audit logging and regulatory requirements
 * 
 * Handlers are registered with an agent and form a processing chain. Each message flowing
 * through the agent will be processed by all registered handlers in priority order.
 * 
 * @example
 * ```typescript
 * // Example email notification handler
 * class EmailNotificationHandler implements ConversationDataHandler {
 *   priority = 20; // Optional priority (lower executes first)
 *   
 *   async handleMessage(message: Message, agentId: string): Promise<void> {
 *     // Check for keywords of interest
 *     if (message.payload.input.includes('urgent')) {
 *       await this.sendEmailAlert(message, agentId);
 *     }
 *   }
 *   
 *   private async sendEmailAlert(message: Message, agentId: string): Promise<void> {
 *     // Implementation of email sending logic
 *   }
 * }
 * 
 * // Register with an agent
 * agent.registerConversationDataHandler(new EmailNotificationHandler());
 * ```
 */
export interface ConversationDataHandler {
  /**
   * Process a conversation message
   * 
   * This method is called for each message flowing through the agent, including:
   * - User input messages
   * - Assistant response messages
   * - Tool call messages
   * - Tool response messages
   * 
   * Implementations should be designed to handle errors gracefully and not throw exceptions
   * that would disrupt the message flow. Any errors should be caught and logged within the
   * implementation.
   * 
   * @param message The message to handle (user, assistant, or tool)
   * @param agentId The ID of the agent processing the message
   * @returns Promise that resolves when processing is complete, or void for synchronous handlers
   */
  handleMessage(message: Message, agentId: string): Promise<void> | void;
  
  /**
   * Optional priority for handler ordering in the chain
   * 
   * Handlers with lower priority values execute first. If not specified,
   * the handler will be assigned the lowest priority (executed last).
   * 
   * This allows for creating processing chains where, for example, monitoring
   * handlers run before persistence handlers.
   */
  priority?: number;
}
