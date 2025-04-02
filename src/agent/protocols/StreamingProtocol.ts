import { Server } from "bun";
import { BaseCommunicationProtocol, AgentRequestHandler } from "../ICommunication";
import { logger } from "../../core/Logger";
import { type ServeOptions } from "bun";
import { Session } from "../../core/Session";
import { getEventEmitter } from "../../core/observability/AgentEventEmitter";

type TimerHandle = ReturnType<typeof setInterval>;

// Stream controller type enum
export enum StreamType {
  RAW = 'raw',
  OBSERVE = 'observe',
  SESSION = 'session'
}

// Client format types for response formatting
export enum ClientFormat {
  SSE = 'sse',      // Server-Sent Events (default for web)
  RAW_JSON = 'raw'  // Raw JSON (for mini-programs)
}

export class StreamingProtocol extends BaseCommunicationProtocol {
  private server?: Server;
  private port: number;
  private host: string;
  private streams: Set<StreamController> = new Set();
  private keepaliveIntervals: Map<string, TimerHandle> = new Map();
  private readonly encoder = new TextEncoder();

  constructor(handler: AgentRequestHandler, port: number = 3001, host: string = "localhost") {
    super(handler);
    this.port = port;
    this.host = host;
    logger.trace(`[StreamingProtocol] StreamingProtocol initialized with port ${port} and host ${host}`);
  }

  async start(): Promise<void> {
    logger.trace('[StreamingProtocol] Starting streaming protocol...');
    try {
      logger.trace(`[StreamingProtocol] Starting server on ${this.host}:${this.port}`);
      
      this.server = Bun.serve({
        port: this.port,
        hostname: this.host,
        development: false,
        fetch: (req: Request): Response => {
          logger.trace(`[StreamingProtocol] Received connection request from ${req.url}`);
          return this.handleRequest(req);
        },
      });
      logger.info(`[StreamingProtocol] Server started successfully on ${this.host}:${this.port}`);
    } catch (error) {
      logger.error(`[StreamingProtocol] Failed to start server: ${error}`);
      throw error;
    }
  }

  private handleRequest(req: Request): Response {
    logger.trace(`[StreamingProtocol] New stream connection request`);
    const url = new URL(req.url);
    
    // Check for mini-program client via header
    const clientType = req.headers.get("X-Client-Type") || "";
    const isMiniProgram = clientType.toLowerCase() === "miniprogram";
    const responseFormat = isMiniProgram ? ClientFormat.RAW_JSON : ClientFormat.SSE;

    // Set appropriate Content-Type based on client type
    const contentType = isMiniProgram ? "application/json" : "text/event-stream";

    // Define headers with index signature to allow dynamic properties
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Client-Type",
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    };
    
    // Add chunked transfer encoding for mini-programs
    if (isMiniProgram) {
      headers["Transfer-Encoding"] = "chunked";
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    // Handle different endpoints
    switch (url.pathname) {
      case '/raw':
        return this.handleRawStream(req, headers, isMiniProgram ? ClientFormat.RAW_JSON : ClientFormat.SSE);
      case '/observe':
        return this.handleObservabilityStream(req, headers, isMiniProgram ? ClientFormat.RAW_JSON : ClientFormat.SSE);
      default:
        // Check for session endpoint pattern
        // Check for session endpoint pattern
        const sessionMatch = url.pathname.match(/^\/session\/([^\/]+)$/);
        if (sessionMatch) {
          const sessionId = sessionMatch[1];
          return this.handleSessionStream(sessionId, req, headers, isMiniProgram ? ClientFormat.RAW_JSON : ClientFormat.SSE);
        }
        return new Response('Not Found', { status: 404 });
    }
  }

  private handleRawStream(req: Request, headers: Record<string, string>, format: ClientFormat = ClientFormat.SSE): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.RAW, undefined, format);
          this.streams.add(streamController);
          
          // Keep the stream alive
          let isAlive = true;
          
          const keepStreamAlive = () => {
            if (!isAlive) return;
            streamController.sendKeepalive();
          };

          // Send initial connected message
          streamController.enqueue(JSON.stringify({ type: "connected" }));

          // Setup more frequent keepalive messages
          const keepaliveInterval = setInterval(keepStreamAlive, 5000); // Every 5 seconds

          // Handle client disconnect
          req.signal.addEventListener("abort", () => {
            logger.trace(`[StreamingProtocol] Client disconnected`);
            isAlive = false;
            this.cleanupConnection(streamController, keepaliveInterval);
          });
        }
      });

      return new Response(stream, { headers });
    } catch (error) {
      logger.error(`[StreamingProtocol] Error in raw stream:`, error);
      return new Response("Internal Server Error", { status: 500, headers });
    }
  }

  private handleObservabilityStream(req: Request, headers: Record<string, string>, format: ClientFormat = ClientFormat.SSE): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.OBSERVE, undefined, format);
          this.streams.add(streamController);
          
          // Send initial connected message
          streamController.enqueue(JSON.stringify({ type: "connected" }));

          // Register event listeners for all event types
          const emitter = getEventEmitter();
          const eventTypes = ['STRATEGY_SELECTION', 'STRATEGY_SWITCH', 'LLM_RESPONSE'].map(type => type.toUpperCase());
          
          const listeners = eventTypes.map(type => {
            const listener = (event: any) => {
              logger.trace(`[StreamingProtocol] Received ${type} event: ${JSON.stringify(event)}`);
              streamController.enqueue(JSON.stringify({
                type: 'event',
                eventType: type,
                data: event
              }));
            };
            emitter.on(type, listener);
            return { type, listener };
          });

          // Setup keepalive for observability stream
          const keepaliveInterval = setInterval(() => {
            streamController.sendKeepalive();
          }, 5000);
          this.keepaliveIntervals.set(streamController.id, keepaliveInterval);

          // Handle client disconnect
          req.signal.addEventListener("abort", () => {
            logger.trace(`[StreamingProtocol] Observability client disconnected`);
            // Remove all event listeners
            listeners.forEach(({ type, listener }) => {
              emitter.off(type, listener);
            });
            this.cleanupConnection(streamController, keepaliveInterval);
          });
        }
      });

      return new Response(stream, { headers });
    } catch (error) {
      logger.error(`[StreamingProtocol] Error in observability stream:`, error);
      return new Response("Internal Server Error", { status: 500, headers });
    }
  }

  private handleSessionStream(sessionId: string, req: Request, headers: Record<string, string>, format: ClientFormat = ClientFormat.SSE): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.SESSION, sessionId, format);
          this.streams.add(streamController);
          
          // Keep the stream alive
          let isAlive = true;
          
          const keepStreamAlive = () => {
            if (!isAlive) return;
            streamController.sendKeepalive();
          };

          // Send initial connected message
          streamController.enqueue(JSON.stringify({ type: "connected", sessionId }));

          // Set up keepalive interval - match raw stream interval
          const intervalId = setInterval(keepStreamAlive, 5000); // Every 5 seconds
          this.keepaliveIntervals.set(streamController.id, intervalId);

          // Set up event handler for the specific session
          const session = this.handler.getAgent().getSession(sessionId);
          if (!session) {
            streamController.enqueue(JSON.stringify({ type: "error", message: `Session ${sessionId} not found` }));
            this.cleanupConnection(streamController, intervalId);
            return;
          }

          // Subscribe to session events - this is now primarily for backward compatibility
          // as most real-time streaming will come through the broadcast method
          session.onConversation((event) => {
            if (!isAlive) return;
            
            // Check if LLM streaming is enabled via the agent's core configuration
            const isLlmStreamingEnabled = this.handler.getAgent().isStreamingEnabled();
            
            // When streaming is enabled, we only want to process special event types
            // Regular content messages are already sent via streaming chunks
            if (isLlmStreamingEnabled) {
              logger.debug(`[StreamingProtocol] Skipping complete message for streaming session ${sessionId} to prevent duplication`);
              return;
            }
            
            // Safe handling of events to prevent undefined errors
            try {
              // If it's already a string, use it directly
              if (typeof event === 'string') {
                streamController.enqueue(event);
                return;
              }
              
              // For objects, ensure they have the expected structure
              // or wrap them in a format that won't cause errors downstream
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
              streamController.enqueue(JSON.stringify(safeEvent));
            } catch (error) {
              logger.error(`[StreamingProtocol] Error processing session event:`, error);
              // Send a safe version of the event that won't cause errors
              const safeEventStr = typeof event === 'string' 
                ? event 
                : JSON.stringify({ content: JSON.stringify(event), sessionId });
              streamController.enqueue(safeEventStr);
            }
          });

          // Cleanup when the client disconnects
          req.signal.addEventListener("abort", () => {
            isAlive = false;
            logger.trace(`[StreamingProtocol] Session stream ${sessionId} disconnected`);
            this.cleanupConnection(streamController, intervalId);
          });
        }
      });

      return new Response(stream, { headers });
    } catch (error) {
      logger.error(`[StreamingProtocol] Error in session stream: ${error}`);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers });
    }
  }

  private cleanupConnection(controller: StreamController, keepaliveInterval?: TimerHandle) {
    // Clean up keepalive interval if provided
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      this.keepaliveIntervals.delete(controller.id);
    }
    // Otherwise try to find it in the map
    else {
      const interval = this.keepaliveIntervals.get(controller.id);
      if (interval) {
        clearInterval(interval);
        this.keepaliveIntervals.delete(controller.id);
      }
    }
    this.streams.delete(controller);
    controller.close();
  }

  public broadcast(data: string, sessionId?: string): void {
    const timestamp = new Date().toISOString();
    logger.debug(`[StreamingProtocol] Broadcast called at ${timestamp} with${sessionId ? ' sessionId: ' + sessionId : ' no sessionId'}`);
    
    // If sessionId is provided, also send to session-specific streams
    if (sessionId) {
      logger.debug(`[StreamingProtocol] Broadcasting to session ${sessionId}`);
      
      // First try to parse the data to see if it's JSON
      let jsonData: any = null;
      try {
        jsonData = JSON.parse(data);
        // Ensure sessionId is included in the data
        if (!jsonData.sessionId) {
          jsonData.sessionId = sessionId;
          // Use the modified JSON with sessionId
          data = JSON.stringify(jsonData);
        }
        logger.debug(`[StreamingProtocol] Parsed JSON data: ${JSON.stringify(jsonData).substring(0, 100)}...`);
      } catch (e) {
        // Not JSON, continue with original data
        logger.debug(`[StreamingProtocol] Data is not JSON: ${data.substring(0, 50)}...`);
      }

      // Count session streams for this session
      let sessionStreamCount = 0;
      for (const stream of this.streams) {
        if (stream.type === StreamType.SESSION && stream.sessionId === sessionId) {
          sessionStreamCount++;
        }
      }
      logger.debug(`[StreamingProtocol] Found ${sessionStreamCount} streams for session ${sessionId}`);

      // Send to session-specific streams
      for (const stream of this.streams) {
        if (stream.type === StreamType.SESSION && stream.sessionId === sessionId) {
          logger.debug(`[StreamingProtocol] Sending data to session stream ${stream.id}`);
          stream.enqueue(data);
        }
      }
    }

    // Always send to raw streams, but filter by sessionId if specified
    let rawStreamCount = 0;
    let filteredRawStreamCount = 0;
    
    for (const stream of this.streams) {
      if (stream.type === StreamType.RAW) {
        rawStreamCount++;
        
        // If this raw stream has a sessionId filter
        if (stream.sessionId) {
          // Only send if the broadcast sessionId matches the stream's filter
          if (sessionId === stream.sessionId) {
            filteredRawStreamCount++;
            stream.enqueue(data);
          }
        } else {
          // No filter, send to all unfiltered raw streams
          stream.enqueue(data);
        }
      }
    }
    
    logger.debug(`[StreamingProtocol] Broadcasting to ${rawStreamCount} raw streams (${filteredRawStreamCount} filtered)`);
  }

  public sendResponseComplete(sessionId: string): void {
    logger.debug(`[StreamingProtocol] Sending response complete for session ${sessionId}`);
    try {
      // Send completion message with session ID
      const completionMessage = JSON.stringify({
        type: "completion",
        reason: "stop",
        sessionId
      });
      this.broadcast(completionMessage, sessionId);
      logger.debug('[StreamingProtocol] Response complete sent');
    } catch (error) {
      logger.error('[StreamingProtocol] Error sending response complete:', error);
    }
  }

  public sendStreamError(sessionId: string, error: string): void {
    const errorEvent = JSON.stringify({
      type: "error",
      sessionId: sessionId,
      error: error
    });
    
    for (const stream of this.streams) {
      stream.enqueue(errorEvent);
    }
  }

  async stop(): Promise<void> {
    logger.trace('[StreamingProtocol] Stopping streaming protocol...');
    try {
      // Stop the server first to prevent new connections
      if (this.server) {
        logger.trace('[StreamingProtocol] Stopping server');
        this.server.stop(true); // Force immediate stop
        this.server = undefined;
        logger.trace('[StreamingProtocol] Server stopped');
      }

      // Close all streams
      for (const stream of this.streams) {
        logger.trace('[StreamingProtocol] Closing stream connection');
        try {
          stream.close();
        } catch (error) {
          logger.error('[StreamingProtocol] Error closing stream:', error);
        }
      }
      this.streams.clear();
      logger.trace('[StreamingProtocol] All streams closed');

      // Clear all intervals
      for (const interval of this.keepaliveIntervals.values()) {
        clearInterval(interval);
      }
      this.keepaliveIntervals.clear();
      logger.trace('[StreamingProtocol] All keepalive intervals cleared');
    } catch (error) {
      logger.error(`[StreamingProtocol] Error during shutdown: ${error}`);
      throw error;
    }
  }
}

class StreamController {
  public readonly id: string = Math.random().toString(36).substring(7);
  public readonly sessionId?: string;
  private isActive: boolean = true;
  private encoder = new TextEncoder();

  constructor(
    private controller: ReadableStreamDefaultController,
    private protocol: StreamingProtocol,
    public readonly type: StreamType,
    sessionId?: string,
    private responseFormat: ClientFormat = ClientFormat.SSE  // Default to SSE for web clients
  ) {
    this.sessionId = sessionId;
    logger.debug(`[StreamingProtocol] Created ${type} stream with format ${responseFormat}${sessionId ? ' for session ' + sessionId : ''}`); 
  }

  public enqueue(data: string) {
    if (!this.isActive) return;
    
    if (this.responseFormat === ClientFormat.SSE) {
      // Format as SSE data for web clients (existing behavior)
      const message = data.split('\n')
        .map(line => `data: ${line}`)
        .join('\n') + '\n\n';
      
      this.controller.enqueue(this.encoder.encode(message));
    } else {
      // Raw JSON format for mini-programs - no SSE formatting
      this.controller.enqueue(this.encoder.encode(data));
    }
  }

  public sendKeepalive() {
    if (!this.isActive) return;
    
    if (this.responseFormat === ClientFormat.SSE) {
      // Use standard SSE comment format for keepalive (existing behavior)
      this.controller.enqueue(this.encoder.encode(": keepalive\n\n"));
    } else {
      // JSON format for mini-program keepalive
      this.controller.enqueue(this.encoder.encode(JSON.stringify({ type: "keepalive" })));
    }
  }

  public close() {
    this.isActive = false;
    this.controller.close();
  }
}