import { Server } from "bun";
import { BaseCommunicationProtocol, RequestHandler } from "../ICommunication";
import { logger } from "../../core/Logger";
import { type ServeOptions } from "bun";
import { Session } from "../../core/Session";

type TimerHandle = ReturnType<typeof setInterval>;

export class StreamingProtocol extends BaseCommunicationProtocol {
  private server?: Server;
  private port: number;
  private host: string;
  private streams: Set<StreamController> = new Set();
  private keepaliveIntervals: Map<string, TimerHandle> = new Map();
  private readonly encoder = new TextEncoder();

  constructor(handler: RequestHandler, port: number = 3001, host: string = "localhost") {
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

    try {
      const stream = new ReadableStream({
        start: (controller) => this.initializeStream(controller, req),
      });

      return new Response(stream, { headers });
    } catch (error) {
      logger.error(`[StreamingProtocol] Error in stream request:`, error);
      return new Response("Internal Server Error", { status: 500, headers });
    }
  }

  private initializeStream(controller: ReadableStreamDefaultController, req: Request) {
    logger.trace(`[StreamingProtocol] Initializing stream...`);

    const streamController = new StreamController(controller, this);
    
    // Keep the stream alive
    let isAlive = true;
    
    const keepStreamAlive = () => {
      if (!isAlive) return;
      streamController.sendKeepalive();
    };

    // Send initial connected message
    streamController.enqueue(JSON.stringify({ type: "connected" }));

    // Add to global streams
    this.streams.add(streamController);
    logger.trace(`[StreamingProtocol] Active streams: ${this.streams.size}`);

    // Setup more frequent keepalive messages
    const keepaliveInterval = setInterval(keepStreamAlive, 5000); // Every 5 seconds

    // Handle client disconnect
    req.signal.addEventListener("abort", () => {
      logger.trace(`[StreamingProtocol] Client disconnected`);
      isAlive = false;
      this.cleanupConnection(streamController, keepaliveInterval);
    });
  }

  private cleanupConnection(controller: StreamController, keepaliveInterval: TimerHandle) {
    clearInterval(keepaliveInterval);
    // Send close event before cleanup
    controller.enqueue(JSON.stringify({ 
      type: "close", 
      message: "Stream closed" 
    }));
    this.streams.delete(controller);
    logger.trace(`[StreamingProtocol] Connection cleaned up`);
  }

  public broadcast(data: string): void {
    logger.trace(`[StreamingProtocol] Broadcasting to ${this.streams.size} streams`);
    for (const stream of this.streams) {
      stream.enqueue(data);
    }
    logger.trace('[StreamingProtocol] Broadcast complete');
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
  private isActive: boolean = true;
  private encoder = new TextEncoder();

  constructor(
    private controller: ReadableStreamDefaultController,
    private protocol: StreamingProtocol
  ) {}

  enqueue(data: string) {
    if (!this.isActive) {
      logger.trace('[StreamController] Skipping enqueue - stream not active');
      return;
    }
    
    try {
      // Special handling for [DONE] message
      if (data === '[DONE]') {
        logger.warning('[StreamController] Sending completion signal');
        this.controller.enqueue(this.encoder.encode(data + '\n\n'));
      } else {
        const message = `data: ${data}\n\n`;
        logger.warning('[StreamController] Enqueueing message:', message);
        this.controller.enqueue(this.encoder.encode(message));
      }
    } catch (error) {
      logger.error('[StreamController] Error enqueueing stream data:', error);
    }
  }

  sendKeepalive() {
    if (!this.isActive) return;
    this.controller.enqueue(this.encoder.encode(": keepalive\n\n"));
  }

  close() {
    if (!this.isActive) return;
    
    try {
      this.isActive = false;
      const closeMessage = JSON.stringify({ type: "close", message: "Server stopping" });
      this.enqueue(closeMessage);
      this.controller.close();
    } catch (error) {
      logger.error('[StreamingProtocol] Error closing stream:', error);
    }
  }
}