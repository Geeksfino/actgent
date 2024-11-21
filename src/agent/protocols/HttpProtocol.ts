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
    logger.debug(`HttpProtocol initialized with port ${port} and host ${host}`);
  }

  async start(): Promise<void> {
    logger.debug('[HttpProtocol] Starting HTTP protocol...');
    try {
      logger.debug(`[HttpProtocol] Starting server on ${this.host}:${this.port}`);

      logger.debug(`Starting HTTP server on ${this.host}:${this.port}`);
      
      this.server = Bun.serve({
        port: this.port,
        hostname: this.host,
        development: false,

        fetch: (async (req: Request) => {
          logger.debug(`[HttpProtocol] Received request: ${req.method} ${req.url}`);
          const url = new URL(req.url);
          logger.debug(`Received ${req.method} request to ${url.pathname}`);

          // Handle CORS preflight
          const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          };

          if (req.method === 'OPTIONS') {
            logger.debug('Handling CORS preflight request');
            return new Response(null, { headers: corsHeaders });
          }

          if (req.method !== 'POST') {
            logger.debug(`Rejecting non-POST method: ${req.method}`);
            return new Response('Method not allowed', { 
              status: 405,
              headers: corsHeaders 
            });
          }

          try {
            const data = await req.json();
            logger.debug(`Request data:`, data);

            switch (url.pathname) {
              case '/createSession': {
                logger.debug('Processing createSession request');
                const { owner, description, enhancePrompt = false } = data as {
                  owner: string;
                  description: string;
                  enhancePrompt?: boolean;
                };
                const session = await this.handler.onCreateSession(owner, description, enhancePrompt);
                logger.debug(`Session created with ID: ${session.sessionId}`);
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
                logger.debug('Processing chat request');
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
                logger.debug(`Unknown endpoint: ${url.pathname}`);
                return new Response('Not found', { 
                  status: 404,
                  headers: corsHeaders 
                });
            }
          } catch (error) {
            logger.error('HTTP server error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.debug(`Error details: ${errorMessage}`);
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
          logger.debug(`Server error details: ${error.stack}`);
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
    logger.debug('[HttpProtocol] Stopping HTTP protocol...');
    try {
      if (this.server) {
        logger.debug('[HttpProtocol] Stopping server');
        this.server.stop(true); // Force immediate stop
        this.server = undefined;
        logger.debug('[HttpProtocol] Server stopped successfully');
      }
    } catch (error) {
      logger.error(`[HttpProtocol] Error during shutdown: ${error}`);
      throw error;
    }
    logger.info('HTTP server closed');
  }
} 