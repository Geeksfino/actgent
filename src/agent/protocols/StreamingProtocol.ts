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
    
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    // Handle different endpoints
    switch (url.pathname) {
      case '/raw':
        return this.handleRawStream(req, headers);
      case '/observe':
        return this.handleObservabilityStream(req, headers);
      default:
        // Check for session endpoint pattern
        const sessionMatch = url.pathname.match(/^\/session\/([^\/]+)$/);
        if (sessionMatch) {
          const sessionId = sessionMatch[1];
          return this.handleSessionStream(sessionId, req, headers);
        }
        return new Response('Not Found', { status: 404 });
    }
  }

  private handleRawStream(req: Request, headers: Record<string, string>): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.RAW);
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

  private handleObservabilityStream(req: Request, headers: Record<string, string>): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.OBSERVE);
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

  private handleSessionStream(sessionId: string, req: Request, headers: Record<string, string>): Response {
    try {
      const stream = new ReadableStream({
        start: (controller) => {
          const streamController = new StreamController(controller, this, StreamType.SESSION);
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

          // Subscribe to session events
          session.onConversation((event) => {
            if (!isAlive) return;
            // Wrap the string in the expected structure
            const wrappedEvent = {
              type: "event",
              data: {
                content: event  
              }
            };
            streamController.enqueue(JSON.stringify(wrappedEvent));
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

  public broadcast(data: string): void {
    //logger.trace(`[StreamingProtocol] Broadcasting to raw streams`);
    for (const stream of this.streams) {
      if (stream.type === StreamType.RAW) {
        stream.enqueue(data);
      }
    }
  }

  public sendResponseComplete(sessionId: string): void {
    logger.warning(`[StreamingProtocol] Sending response complete for session ${sessionId}`);
    try {
      this.broadcast('[DONE]');
      logger.warning('[StreamingProtocol] Response complete sent');
    } catch (error) {
      logger.warning('[StreamingProtocol] Error sending response complete:', error);
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
  private isActive: boolean = true;
  private encoder = new TextEncoder();

  constructor(
    private controller: ReadableStreamDefaultController,
    private protocol: StreamingProtocol,
    public readonly type: StreamType
  ) {}

  public enqueue(data: string) {
    if (!this.isActive) return;
    
    // Format as SSE data
    const message = data.split('\n')
      .map(line => `data: ${line}`)
      .join('\n') + '\n\n';
      
    this.controller.enqueue(this.encoder.encode(message));
  }

  public sendKeepalive() {
    if (!this.isActive) return;
    // Use standard SSE comment format for keepalive
    this.controller.enqueue(this.encoder.encode(": keepalive\n\n"));
  }

  public close() {
    this.isActive = false;
    this.controller.close();
  }
}