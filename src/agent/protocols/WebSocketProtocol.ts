import { Server, WebSocketHandler, ServerWebSocket } from "bun";
import { BaseCommunicationProtocol, AgentRequestHandler } from "../ICommunication";
import { logger } from "../../core/Logger";
import { Session } from "../../core/Session";
import { getEventEmitter } from "../../core/observability/AgentEventEmitter";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface MarkdownState {
  inCodeBlock: boolean;
  inTable: boolean;
  tableHeaderSeen: boolean;
  inList: boolean;
  listIndentLevel: number;
  inBlockquote: boolean;
  buffer: string;
}

interface MarkdownUnit {
  content: string;
  complete: boolean;
  type: 'code' | 'table_header' | 'table_row' | 'list_item' | 'blockquote' | 'heading' | 'paragraph' | 'text';
}

export class WebSocketProtocol extends BaseCommunicationProtocol {
  private server?: Server;
  private port: number;
  private host: string;
  private connections: Map<string, ServerWebSocket> = new Map();
  private sessionConnections: Map<string, Set<ServerWebSocket>> = new Map();
  private markdownBuffers: Map<string, string> = new Map();

  constructor(handler: AgentRequestHandler, port: number = 3002, host: string = "localhost") {
    super(handler);
    this.port = port;
    this.host = host;
    logger.trace(`[WebSocketProtocol] WebSocketProtocol initialized with port ${port} and host ${host}`);
  }

  async start(): Promise<void> {
    logger.trace('[WebSocketProtocol] Starting WebSocket protocol...');
    try {
      logger.trace(`[WebSocketProtocol] Starting server on ${this.host}:${this.port}`);
      
      this.server = Bun.serve({
        port: this.port,
        hostname: this.host,
        development: false,
        fetch: (req: Request): Response | undefined => {
          const url = new URL(req.url);
          
          // Add CORS headers for preflight requests
          if (req.method === 'OPTIONS') {
            return new Response(null, {
              status: 204,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
              },
            });
          }
          
          // Only handle WebSocket connections on /ws path
          if (url.pathname.startsWith('/ws')) {
            // Check if this is a WebSocket upgrade request
            const upgradeHeader = req.headers.get('Upgrade');
            const isWebSocketRequest = upgradeHeader && upgradeHeader.toLowerCase() === 'websocket';
            
            if (isWebSocketRequest) {
              logger.debug(`[WebSocketProtocol] WebSocket upgrade request detected: ${req.url}`);
              try {
                const upgraded = this.server?.upgrade(req);
                if (upgraded) {
                  logger.debug(`[WebSocketProtocol] Upgraded connection to WebSocket: ${req.url}`);
                  return undefined;
                }
              } catch (error) {
                logger.error(`[WebSocketProtocol] Error upgrading connection: ${error}`);
              }
            }
            
            // If we couldn't upgrade the connection but it's a WebSocket path, return 400
            return new Response('Bad Request - WebSocket connection failed', { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain',
              }
            });
          }

          // Handle health checks
          if (url.pathname === '/health') {
            return new Response('OK', { 
              status: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain',
              }
            });
          }

          // Pass through all other requests to be handled by other protocols
          // Return undefined to let Bun pass this request to other handlers
          // This is important for HTTP streaming endpoints to work
          return undefined;
        },
        websocket: this.createWebSocketHandler(),
      });
      
      logger.info(`[WebSocketProtocol] WebSocket server started successfully on ${this.host}:${this.port}`);
    } catch (error) {
      logger.error(`[WebSocketProtocol] Failed to start server: ${error}`);
      throw error;
    }
  }

  private createWebSocketHandler(): WebSocketHandler {
    return {
      open: (ws: ServerWebSocket) => {
        const connId = Math.random().toString(36).substring(7);
        this.connections.set(connId, ws);
        // Set connection data using type assertion since data is 'any' type
        ws.data = { connId, sessionId: null } as any;
        logger.debug(`[WebSocketProtocol] New connection opened: ${connId}`);
      },
      
      message: async (ws: ServerWebSocket, message: string | Buffer) => {
        try {
          const connId = (ws.data as any).connId;
          logger.debug(`[WebSocketProtocol] Received message from connection ${connId}`);
          
          // Parse the message
          const data = JSON.parse(message.toString()) as WebSocketMessage;
          
          // Handle different message types
          switch (data.type) {
            case 'createSession': {
              logger.trace('[WebSocketProtocol] Processing createSession request');
              const { owner, description, enhancePrompt = false, message } = data;
              
              try {
                // Create a new session
                // If an initial message is provided, use it as the description
                // This ensures the message is processed once through createSession
                const actualDescription = message || description;
                const session = await this.handler.onCreateSession(owner, actualDescription, enhancePrompt);
                (ws.data as any).sessionId = session.sessionId;
                
                // Add connection to session map
                if (!this.sessionConnections.has(session.sessionId)) {
                  this.sessionConnections.set(session.sessionId, new Set());
                }
                this.sessionConnections.get(session.sessionId)?.add(ws);
                
                // Set up event listener for this session
                const eventEmitter = getEventEmitter();
                const eventListener = (event: any) => {
                  if (event.sessionId === session.sessionId) {
                    try {
                      const safeEvent = event || {};
                      
                      // If the event has choices with delta, ensure delta is an object
                      if (safeEvent.choices && safeEvent.choices[0] && safeEvent.choices[0].delta === undefined) {
                        // Fix the structure to prevent delta.tool_calls errors
                        safeEvent.choices[0].delta = safeEvent.choices[0].delta || {};
                      }
                      
                      // Ensure sessionId is included
                      if (!safeEvent.sessionId) {
                        safeEvent.sessionId = session.sessionId;
                      }
                      
                      // Convert to string and send
                      ws.send(JSON.stringify(safeEvent));
                    } catch (error) {
                      logger.error(`[WebSocketProtocol] Error processing session event:`, error);
                      // Send a safe version of the event that won't cause errors
                      const safeEventStr = typeof event === 'string' 
                        ? event 
                        : JSON.stringify({ content: JSON.stringify(event), sessionId: session.sessionId });
                      
                      ws.send(safeEventStr);
                    }
                  }
                };
                
                // Store the listener reference for cleanup
                (ws.data as any).eventListener = eventListener;
                eventEmitter.on('agent:response', eventListener);
                
                // Send success response
                ws.send(JSON.stringify({
                  type: 'sessionCreated',
                  sessionId: session.sessionId
                }));
                
                logger.debug(`[WebSocketProtocol] Session created with ID: ${session.sessionId}`);
              } catch (error) {
                logger.error(`[WebSocketProtocol] Failed to create session: ${error}`);
                ws.send(JSON.stringify({
                  type: 'error',
                  error: error instanceof Error ? error.message : String(error)
                }));
              }
              break;
            }
            
            case 'chat': {
              logger.trace('[WebSocketProtocol] Processing chat request');
              const { sessionId, message } = data;
              
              if (!sessionId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'Session ID is required'
                }));
                return;
              }
              
              try {
                // If this connection isn't already associated with this session, add it
                if ((ws.data as any).sessionId !== sessionId) {
                  (ws.data as any).sessionId = sessionId;
                  
                  if (!this.sessionConnections.has(sessionId)) {
                    this.sessionConnections.set(sessionId, new Set());
                  }
                  this.sessionConnections.get(sessionId)?.add(ws);
                  
                  // Set up event listener if not already set
                  if (!(ws.data as any).eventListener) {
                    const eventEmitter = getEventEmitter();
                    const eventListener = (event: any) => {
                      if (event.sessionId === sessionId) {
                        try {
                          const safeEvent = event || {};
                          
                          // If the event has choices with delta, ensure delta is an object
                          if (safeEvent.choices && safeEvent.choices[0] && safeEvent.choices[0].delta === undefined) {
                            // Fix the structure to prevent delta.tool_calls errors
                            safeEvent.choices[0].delta = safeEvent.choices[0].delta || {};
                          }
                          
                          // Ensure sessionId is included
                          if (!safeEvent.sessionId) {
                            safeEvent.sessionId = sessionId;
                          }
                          
                          // Convert to string and send
                          ws.send(JSON.stringify(safeEvent));
                        } catch (error) {
                          logger.error(`[WebSocketProtocol] Error processing session event:`, error);
                          // Send a safe version of the event that won't cause errors
                          const safeEventStr = typeof event === 'string' 
                            ? event 
                            : JSON.stringify({ content: JSON.stringify(event), sessionId });
                          
                          ws.send(safeEventStr);
                        }
                      }
                    };
                    
                    (ws.data as any).eventListener = eventListener;
                    eventEmitter.on('agent:response', eventListener);
                  }
                }
                
                // Process the chat message
                await this.handler.onChat(sessionId, message);
                
                // Send acknowledgment
                ws.send(JSON.stringify({
                  type: 'messageSent',
                  sessionId
                }));
                
                logger.debug(`[WebSocketProtocol] Chat message processed for session ${sessionId}`);
              } catch (error) {
                logger.error(`[WebSocketProtocol] Failed to process chat for session ${sessionId}: ${error}`);
                ws.send(JSON.stringify({
                  type: 'error',
                  error: error instanceof Error ? error.message : String(error),
                  sessionId
                }));
              }
              break;
            }
            
            default:
              logger.warn(`[WebSocketProtocol] Unknown message type: ${data.type}`);
              ws.send(JSON.stringify({
                type: 'error',
                error: `Unknown message type: ${data.type}`
              }));
          }
        } catch (error) {
          logger.error(`[WebSocketProtocol] Error processing message: ${error}`);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      },
      
      close: (ws: ServerWebSocket, code: number, message: string) => {
        const connId = (ws.data as any).connId;
        const sessionId = (ws.data as any).sessionId;
        
        // Remove from connections map
        this.connections.delete(connId);
        
        // Remove from session connections if associated with a session
        if (sessionId && this.sessionConnections.has(sessionId)) {
          this.sessionConnections.get(sessionId)?.delete(ws);
          
          // If no more connections for this session, clean up the set
          if (this.sessionConnections.get(sessionId)?.size === 0) {
            this.sessionConnections.delete(sessionId);
          }
        }
        
        // Remove event listener if exists
        const eventListener = (ws.data as any).eventListener;
        if (eventListener) {
          const eventEmitter = getEventEmitter();
          eventEmitter.off('agent:response', eventListener);
        }
        
        logger.debug(`[WebSocketProtocol] Connection closed: ${connId}`);
      },
      
      drain: (ws: ServerWebSocket) => {
        // Handle backpressure if needed
        logger.trace(`[WebSocketProtocol] WebSocket backpressure on connection ${(ws.data as any).connId}`);
      }
    };
  }

  private analyzeMarkdownBlocks(content: string): { completeBlocks: string, remainingContent: string } {
    if (!content) {
      return { completeBlocks: '', remainingContent: '' };
    }

    logger.debug(`[WebSocketProtocol] Starting markdown analysis on content (${content.length} chars)`);
    
    // Get or initialize the markdown state for this session
    const state: MarkdownState = {
      inCodeBlock: false,
      inTable: false,
      tableHeaderSeen: false,
      inList: false,
      listIndentLevel: 0,
      inBlockquote: false,
      buffer: ''
    };
    
    // If we have a buffer from previous chunks, prepend it
    const fullContent = state.buffer + content;
    
    // Initialize result
    let completeBlocks = '';
    let remainingContent = '';
    
    // Handle content with escaped newlines differently
    if (fullContent.includes('\\n')) {
      logger.debug(`[WebSocketProtocol] Content contains escaped newlines, preserving formatting`);
      return { completeBlocks: fullContent, remainingContent: '' };
    }
    
    const lines = fullContent.split('\n');
    let currentLine = 0;
    
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      const nextLine = currentLine < lines.length - 1 ? lines[currentLine + 1] : null;
      
      // Try to extract a markdown unit
      const unit = this.extractMarkdownUnit(line, nextLine, state, lines.slice(currentLine));
      
      if (unit.complete) {
        completeBlocks += unit.content;
        currentLine += unit.type === 'code' ? this.countLines(unit.content) : 1;
      } else {
        // Incomplete unit, add to remaining content
        remainingContent = lines.slice(currentLine).join('\n');
        break;
      }
    }
    
    // Update state buffer with remaining content
    state.buffer = remainingContent;
    
    logger.debug(`[WebSocketProtocol] Markdown analysis complete. Complete blocks: ${completeBlocks.length} chars, Remaining: ${remainingContent.length} chars`);
    return { completeBlocks, remainingContent };
  }

  private extractMarkdownUnit(line: string, nextLine: string | null, state: MarkdownState, remainingLines: string[]): MarkdownUnit {
    // Code blocks are atomic - must be complete
    if (line.trim().startsWith('```') || state.inCodeBlock) {
      return this.extractCodeBlock(remainingLines, state);
    }
    
    // Table units can be streamed row by row
    if (line.includes('|') || state.inTable) {
      return this.extractTableUnit(line, nextLine, state);
    }
    
    // List items can be streamed individually
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || state.inList) {
      return this.extractListItem(line, nextLine, state);
    }
    
    // Blockquotes can be streamed paragraph by paragraph
    if (line.trim().startsWith('>') || state.inBlockquote) {
      return this.extractBlockquote(line, nextLine, state);
    }
    
    // Headings are atomic but single line
    if (/^#{1,6}\s+.+/.test(line)) {
      return {
        content: line,
        complete: true,
        type: 'heading'
      };
    }
    
    // Paragraphs are atomic - must be complete
    if (line.trim() !== '') {
      return this.extractParagraph(line, nextLine, remainingLines);
    }
    
    // Empty lines can be streamed immediately
    return {
      content: line,
      complete: true,
      type: 'text'
    };
  }

  private extractParagraph(line: string, nextLine: string | null, remainingLines: string[]): MarkdownUnit {
    const result: string[] = [line];
    let complete = false;
    let currentLine = 1;
    
    while (currentLine < remainingLines.length) {
      const nextLine = remainingLines[currentLine];
      if (nextLine.trim() === '') {
        complete = true;
        break;
      }
      result.push(nextLine);
      currentLine++;
    }
    
    // Do not add any extra newlines
    return {
      content: result.join('\n'),
      complete,
      type: 'paragraph'
    };
  }

  private extractCodeBlock(lines: string[], state: MarkdownState): MarkdownUnit {
    const result: string[] = [];
    let complete = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      result.push(line);
      
      if (line.trim().startsWith('```')) {
        if (!state.inCodeBlock) {
          state.inCodeBlock = true;
        } else {
          state.inCodeBlock = false;
          complete = true;
          break;
        }
      }
    }
    
    // Do not add any extra newlines
    return {
      content: result.join('\n'),
      complete,
      type: 'code'
    };
  }

  private extractTableUnit(line: string, nextLine: string | null, state: MarkdownState): MarkdownUnit {
    if (!state.inTable) {
      // Starting a new table
      state.inTable = true;
      state.tableHeaderSeen = false;
      return {
        content: line,  // No newline for header
        complete: false,
        type: 'table_header'
      };
    }
    
    if (!state.tableHeaderSeen && line.includes('-') && line.includes('|')) {
      // Table header separator - complete the header
      state.tableHeaderSeen = true;
      return {
        content: line,
        complete: true,
        type: 'table_header'
      };
    }
    
    // Regular table row
    const isEndOfTable = !nextLine?.includes('|');
    if (isEndOfTable) {
      state.inTable = false;
    }
    
    return {
      content: line,
      complete: true,
      type: 'table_row'
    };
  }

  private extractListItem(line: string, nextLine: string | null, state: MarkdownState): MarkdownUnit {
    const currentIndent = line.search(/\S/);
    const isListMarker = /^[\s]*[-*+]\s+/.test(line) || /^[\s]*\d+\.\s+/.test(line);
    
    // Not currently in a list
    if (!state.inList) {
      if (isListMarker) {
        // Starting a new list
        state.inList = true;
        state.listIndentLevel = currentIndent;
        
        // Look ahead for continuation
        if (nextLine) {
          const nextIndent = nextLine.search(/\S/);
          const nextIsListMarker = /^[\s]*[-*+]\s+/.test(nextLine) || /^[\s]*\d+\.\s+/.test(nextLine);
          
          if (nextIndent > currentIndent && !nextIsListMarker) {
            // Next line is continuation of this item
            return {
              content: line,  // No newline for incomplete items
              complete: false,
              type: 'list_item'
            };
          }
        }
        
        return {
          content: line,
          complete: true,
          type: 'list_item'
        };
      }
    }
    
    // Already in a list
    if (state.inList) {
      if (line.trim() === '') {
        // Empty line ends the list unless next line is indented or a list marker
        if (nextLine) {
          const nextIndent = nextLine.search(/\S/);
          const nextIsListMarker = /^[\s]*[-*+]\s+/.test(nextLine) || /^[\s]*\d+\.\s+/.test(nextLine);
          
          if (nextIndent > state.listIndentLevel || nextIsListMarker) {
            // List continues
            return {
              content: line,
              complete: true,
              type: 'list_item'
            };
          }
        }
        
        // List ends
        state.inList = false;
        return {
          content: line,
          complete: true,
          type: 'list_item'
        };
      }
      
      // Check if this line is a continuation of previous item
      if (currentIndent > state.listIndentLevel && !isListMarker) {
        // This is a continuation line
        return {
          content: line,  // No newline for continuation
          complete: false,
          type: 'list_item'
        };
      }
      
      // Check if this line starts a new item
      if (isListMarker) {
        // Update indent level if needed
        state.listIndentLevel = currentIndent;
        
        // Look ahead for continuation
        if (nextLine) {
          const nextIndent = nextLine.search(/\S/);
          const nextIsListMarker = /^[\s]*[-*+]\s+/.test(nextLine) || /^[\s]*\d+\.\s+/.test(nextLine);
          
          if (nextIndent > currentIndent && !nextIsListMarker) {
            // Next line is continuation of this item
            return {
              content: line,  // No newline for incomplete items
              complete: false,
              type: 'list_item'
            };
          }
        }
        
        return {
          content: line,
          complete: true,
          type: 'list_item'
        };
      }
      
      // Not a list marker or continuation, list must have ended
      state.inList = false;
      return {
        content: '',
        complete: true,
        type: 'list_item'
      };
    }
    
    // Not in a list and not a list marker
    return {
      content: '',
      complete: true,
      type: 'list_item'
    };
  }

  private extractBlockquote(line: string, nextLine: string | null, state: MarkdownState): MarkdownUnit {
    if (!state.inBlockquote) {
      state.inBlockquote = true;
    }
    
    // If next line is not a blockquote, this blockquote is complete
    const isEndOfBlockquote = !nextLine?.trim().startsWith('>');
    if (isEndOfBlockquote) {
      state.inBlockquote = false;
    }
    
    return {
      content: line,
      complete: isEndOfBlockquote,
      type: 'blockquote'
    };
  }

  private countLines(content: string): number {
    return content.split('\n').length;
  }

  private extractContentFromMessage(message: any): string {
    try {
      logger.debug(`[WebSocketProtocol] Extracting content from message type: ${typeof message}`);
      
      // If it's already a string, try to parse it as JSON
      if (typeof message === 'string') {
        logger.debug(`[WebSocketProtocol] Message is string, length: ${message.length}`);
        try {
          const parsed = JSON.parse(message);
          logger.debug(`[WebSocketProtocol] Successfully parsed message as JSON`);
          
          // Check for content in various formats
          if (parsed.choices && parsed.choices.length > 0) {
            logger.debug(`[WebSocketProtocol] Found choices array in parsed message`);
            if (parsed.choices[0].delta && parsed.choices[0].delta.content) {
              // Get the raw content without normalizing newlines
              const content = parsed.choices[0].delta.content;
              logger.debug(`[WebSocketProtocol] Extracted delta content: "${content}"`);
              return content;
            } else if (parsed.choices[0].content) {
              const content = parsed.choices[0].content;
              logger.debug(`[WebSocketProtocol] Extracted content from choices: "${content}"`);
              return content;
            }
          } else if (parsed.content) {
            const content = parsed.content;
            logger.debug(`[WebSocketProtocol] Extracted content directly: "${content}"`);
            return content;
          }
          
          // No content found in JSON
          logger.debug(`[WebSocketProtocol] No content found in parsed JSON`);
          return '';
        } catch (e) {
          // Not JSON, treat as plain text content
          logger.debug(`[WebSocketProtocol] Message is not valid JSON, treating as plain text: "${message}"`);
          return message;
        }
      } else {
        // It's already an object
        logger.debug(`[WebSocketProtocol] Message is already an object`);
        if (message.choices && message.choices.length > 0) {
          logger.debug(`[WebSocketProtocol] Found choices array in object message`);
          if (message.choices[0].delta && message.choices[0].delta.content) {
            // Get the raw content without normalizing newlines
            const content = message.choices[0].delta.content;
            logger.debug(`[WebSocketProtocol] Extracted delta content from object: "${content}"`);
            return content;
          } else if (message.choices[0].content) {
            const content = message.choices[0].content;
            logger.debug(`[WebSocketProtocol] Extracted content from object choices: "${content}"`);
            return content;
          }
        } else if (message.content) {
          const content = message.content;
          logger.debug(`[WebSocketProtocol] Extracted content directly from object: "${content}"`);
          return content;
        }
      }
    } catch (e) {
      logger.error(`[WebSocketProtocol] Error extracting content: ${e}`);
    }
    
    logger.debug(`[WebSocketProtocol] No content extracted, returning empty string`);
    return '';
  }

  private createFormattedMessage(content: string, sessionId: string): string {
    // Ensure we don't add any extra newlines to the content
    // The content already has the correct newlines from the LLM
    return JSON.stringify({
      choices: [{
        delta: {
          content: content
        }
      }],
      sessionId: sessionId
    });
  }

  public sendToSession(sessionId: string, message: string): void {
    const connections = this.sessionConnections.get(sessionId);
    if (!connections || connections.size === 0) {
      return;
    }
    
    try {
      // Extract content from the message
      const content = this.extractContentFromMessage(message);
      
      // Log the raw content received from LLM
      logger.debug(`[WebSocketProtocol] Raw content from LLM (${content.length} chars):`);
      logger.debug(`[WebSocketProtocol] ---BEGIN RAW CONTENT---`);
      logger.debug(JSON.stringify(content));
      logger.debug(`[WebSocketProtocol] ---END RAW CONTENT---`);
      
      // Skip processing for empty content or special message types
      if (!content || message.includes('"type":"completion"') || message.includes('"type":"error"')) {
        // Pass through special messages without buffering
        for (const conn of connections) {
          conn.send(message);
        }
        return;
      }
      
      // Handle standalone newlines and whitespace-only content
      if (content.trim() === '') {
        logger.debug(`[WebSocketProtocol] Received whitespace-only content, passing through`);
        const formattedMessage = this.createFormattedMessage(content, sessionId);
        for (const conn of connections) {
          conn.send(formattedMessage);
        }
        return;
      }
      
      // Simply pass through the content as-is without attempting to analyze markdown structure
      // This preserves the exact formatting from the LLM
      const formattedMessage = this.createFormattedMessage(content, sessionId);
      
      // Log the formatted message being sent to client
      logger.debug(`[WebSocketProtocol] Sending formatted message to client:`);
      logger.debug(`[WebSocketProtocol] ---BEGIN FORMATTED MESSAGE---`);
      logger.debug(formattedMessage);
      logger.debug(`[WebSocketProtocol] ---END FORMATTED MESSAGE---`);
      
      for (const conn of connections) {
        conn.send(formattedMessage);
        logger.trace(`[WebSocketProtocol] Sent content to session ${sessionId}`);
      }
    } catch (error) {
      logger.error(`[WebSocketProtocol] Error processing content: ${error}`);
      
      // Fallback to original behavior on error
      for (const conn of connections) {
        try {
          conn.send(message);
        } catch (sendError) {
          logger.error(`[WebSocketProtocol] Error sending message to connection: ${sendError}`);
        }
      }
    }
  }

  public sendResponseComplete(sessionId: string): void {
    logger.debug(`[WebSocketProtocol] Sending response complete for session ${sessionId}`);
    try {
      // Send completion message
      const completionMessage = JSON.stringify({
        type: "completion",
        reason: "stop",
        sessionId
      });
      
      this.sessionConnections.get(sessionId)?.forEach(conn => {
        conn.send(completionMessage);
      });
      
      logger.debug('[WebSocketProtocol] Response complete sent');
    } catch (error) {
      logger.error('[WebSocketProtocol] Error sending response complete:', error);
    }
  }

  public sendStreamError(sessionId: string, error: string): void {
    logger.debug(`[WebSocketProtocol] Sending error for session ${sessionId}: ${error}`);
    const errorMessage = JSON.stringify({
      type: "error",
      sessionId,
      error
    });
    
    this.sendToSession(sessionId, errorMessage);
  }

  async stop(): Promise<void> {
    logger.trace('[WebSocketProtocol] Stopping WebSocket protocol...');
    try {
      // Close all WebSocket connections
      for (const conn of this.connections.values()) {
        try {
          // Remove event listeners
          const eventListener = (conn.data as any).eventListener;
          if (eventListener) {
            const eventEmitter = getEventEmitter();
            eventEmitter.off('agent:response', eventListener);
          }
          
          // Close the connection
          conn.close();
        } catch (error) {
          logger.error(`[WebSocketProtocol] Error closing WebSocket connection: ${error}`);
        }
      }
      
      // Clear connection maps
      this.connections.clear();
      this.sessionConnections.clear();
      
      // Stop the server
      if (this.server) {
        logger.trace('[WebSocketProtocol] Stopping server');
        this.server.stop(true); // Force immediate stop
        this.server = undefined;
        logger.trace('[WebSocketProtocol] Server stopped successfully');
      }
      
      logger.info('[WebSocketProtocol] WebSocket server closed');
    } catch (error) {
      logger.error(`[WebSocketProtocol] Error during shutdown: ${error}`);
      throw error;
    }
  }
}
