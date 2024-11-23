import { Server } from "bun";
import { BaseCommunicationProtocol, RequestHandler } from '../ICommunication';
import { logger } from '../../core/Logger';

export class HttpProtocol extends BaseCommunicationProtocol {
  private server?: Server;
  private port: number;
  private host: string;

  constructor(handler: RequestHandler, port: number = 3000, host: string = 'localhost') {
    super(handler);
    this.port = port;
    this.host = host;
    logger.trace(`HttpProtocol initialized with port ${port} and host ${host}`);
  }

  async start(): Promise<void> {
    logger.trace('[HttpProtocol] Starting HTTP protocol...');
    try {
      logger.trace(`[HttpProtocol] Starting server on ${this.host}:${this.port}`);

      logger.trace(`Starting HTTP server on ${this.host}:${this.port}`);
      
      this.server = Bun.serve({
        port: this.port,
        hostname: this.host,
        development: false,

        fetch: (async (req: Request) => {
          logger.trace(`[HttpProtocol] Received request: ${req.method} ${req.url}`);
          const url = new URL(req.url);
          logger.trace(`Received ${req.method} request to ${url.pathname}`);

          // Handle CORS preflight
          const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          };

          if (req.method === 'OPTIONS') {
            logger.trace('Handling CORS preflight request');
            return new Response(null, { headers: corsHeaders });
          }

          if (req.method !== 'POST') {
            logger.trace(`Rejecting non-POST method: ${req.method}`);
            return new Response('Method not allowed', { 
              status: 405,
              headers: corsHeaders 
            });
          }

          try {
            const data = await req.json();
            logger.trace(`Request data:`, data);

            switch (url.pathname) {
              case '/createSession': {
                logger.trace('Processing createSession request');
                const { owner, description, enhancePrompt = false } = data as {
                  owner: string;
                  description: string;
                  enhancePrompt?: boolean;
                };
                const session = await this.handler.onCreateSession(owner, description, enhancePrompt);
                logger.trace(`Session created with ID: ${session.sessionId}`);
                return new Response(
                  JSON.stringify({ sessionId: session.sessionId }), 
                  { 
                    headers: { 
                      ...corsHeaders,
                      'Content-Type': 'application/json' 
                    } 
                  }
                );
              }

              case '/chat': {
                logger.trace('Processing chat request');
                const { sessionId, message } = data as {
                  sessionId: string;
                  message: string;
                };
                await this.handler.onChat(sessionId, message);
                return new Response(
                  JSON.stringify({ status: 'Message sent' }), 
                  { 
                    headers: { 
                      ...corsHeaders,
                      'Content-Type': 'application/json' 
                    } 
                  }
                );
              }

              default:
                logger.trace(`Unknown endpoint: ${url.pathname}`);
                return new Response('Not found', { 
                  status: 404,
                  headers: corsHeaders 
                });
            }
          } catch (error) {
            logger.error('HTTP server error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.trace(`Error details: ${errorMessage}`);
            return new Response(
              JSON.stringify({ error: errorMessage }), 
              { 
                status: error instanceof Error ? 500 : 400,
                headers: {
                  ...corsHeaders,
                  'Content-Type': 'application/json'
                }
              }
            );
          }
        }).bind(this),

        error(error: Error) {
          logger.error('HTTP server error:', error);
          logger.trace(`Server error details: ${error.stack}`);
          return new Response(
            JSON.stringify({ error: 'Internal server error' }), 
            { 
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            }
          );
        },
      });

      logger.info(`[HttpProtocol] Server started successfully on ${this.host}:${this.port}`);
      logger.info(`HTTP server started on http://${this.host}:${this.port}`);
    } catch (error) {
      logger.error(`[HttpProtocol] Failed to start server: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.trace('[HttpProtocol] Stopping HTTP protocol...');
    try {
      if (this.server) {
        logger.trace('[HttpProtocol] Stopping server');
        this.server.stop(true); // Force immediate stop
        this.server = undefined;
        logger.trace('[HttpProtocol] Server stopped successfully');
      }
    } catch (error) {
      logger.error(`[HttpProtocol] Error during shutdown: ${error}`);
      throw error;
    }
    logger.info('HTTP server closed');
  }
} 