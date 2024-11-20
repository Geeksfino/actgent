import { Server } from "bun";
import { BaseCommunicationProtocol, RequestHandler } from '../ICommunication';
import { logger } from '../../core/Logger';
import { type ServeOptions } from "bun";
import { Session } from '../../core/Session';

export class StreamingProtocol extends BaseCommunicationProtocol {
  private server?: Server;
  private port: number;
  private host: string;
  private streamingSessions: Map<string, Set<any>> = new Map();
  private globalStreams: Set<any> = new Set();
  private readonly maxSessionsPerClient = 5;
  private readonly encoder = new TextEncoder();

  constructor(handler: RequestHandler, port: number = 3001, host: string = 'localhost') {
    super(handler);
    this.port = port;
    this.host = host;
  }

  async start(): Promise<void> {
    const options: ServeOptions = {
      port: this.port,
      hostname: this.host,
      development: false,

      fetch: (req: Request): Response => {
        logger.debug(`Received ${req.method} request to ${req.url}`);

        const headers = {
          'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Transfer-Encoding': 'chunked',
          'X-Accel-Buffering': 'no'
        };

        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers });
        }

        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers });
        }

        try {
          const stream = new ReadableStream({
            start: async (controller) => {
              logger.debug('Starting stream...');

              // Send initial message
              const initialMessage = JSON.stringify({ type: 'connected' });
              const initialData = `${initialMessage}\n\n`;
              logger.debug('Sending initial message:', initialData);
              controller.enqueue(this.encoder.encode(initialData));

              const url = new URL(req.url);
              const sessionId = url.searchParams.get('sessionId');

              const streamController = {
                enqueue: (data: string) => {
                  try {
                    const message = `${data}\n\n`;
                    logger.debug('Sending message:', message);
                    controller.enqueue(this.encoder.encode(message));
                  } catch (error) {
                    logger.error('Error sending message:', error);
                  }
                }
              };

              if (sessionId) {
                const controllers = this.streamingSessions.get(sessionId) || new Set();
                if (controllers.size >= this.maxSessionsPerClient) {
                  controller.close();
                  return;
                }
                if (!this.streamingSessions.has(sessionId)) {
                  this.streamingSessions.set(sessionId, new Set());
                }
                this.streamingSessions.get(sessionId)!.add(streamController);
                logger.debug(`Added controller for session ${sessionId}`);
              } else {
                this.globalStreams.add(streamController);
                logger.debug('Added controller for global stream');
              }

              // Send a test message after 2 seconds
              setTimeout(() => {
                const testMessage = JSON.stringify({ type: 'test', content: 'Test message' });
                logger.debug('Sending test message:', testMessage);
                streamController.enqueue(testMessage);
              }, 2000);

              // Send keepalive every 30 seconds
              const keepaliveInterval = setInterval(() => {
                try {
                  controller.enqueue(this.encoder.encode(': keepalive\n\n'));
                  logger.debug('Sent keepalive');
                } catch (error) {
                  logger.error('Error sending keepalive:', error);
                  clearInterval(keepaliveInterval);
                }
              }, 30000);

              // Handle client disconnect
              req.signal.addEventListener('abort', () => {
                logger.debug(`Client disconnected from ${sessionId ? `session ${sessionId}` : 'global stream'}`);
                clearInterval(keepaliveInterval);
                if (sessionId) {
                  const controllers = this.streamingSessions.get(sessionId);
                  if (controllers) {
                    controllers.delete(streamController);
                    if (controllers.size === 0) {
                      this.streamingSessions.delete(sessionId);
                    }
                  }
                } else {
                  this.globalStreams.delete(streamController);
                }
                controller.close();
              });
            },
            cancel: () => {
              logger.debug('Stream cancelled');
            }
          });

          return new Response(stream, { headers });
        } catch (error) {
          logger.error('Error in stream request:', error);
          return new Response('Internal Server Error', { status: 500, headers });
        }
      }
    };

    this.server = Bun.serve(options);
    logger.info(`Streaming server started on http://${this.host}:${this.port}`);
  }

  public broadcastToSession(sessionId: string, data: string): void {
    logger.debug(`Broadcasting to session ${sessionId}`);

    // Broadcast to session-specific streams
    const controllers = this.streamingSessions.get(sessionId);
    if (controllers) {
      for (const controller of controllers) {
        try {
          controller.enqueue(data);
        } catch (error) {
          logger.error(`Error broadcasting to session ${sessionId}:`, error);
          controllers.delete(controller);
        }
      }
      if (controllers.size === 0) {
        this.streamingSessions.delete(sessionId);
      }
    }

    // Also broadcast to global streams
    for (const controller of this.globalStreams) {
      try {
        controller.enqueue(data);
      } catch (error) {
        logger.error('Error broadcasting to global stream:', error);
        this.globalStreams.delete(controller);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      logger.info('Streaming server stopped');
    }
  }
}