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
  }

  async start(): Promise<void> {
    this.server = Bun.serve({
      port: this.port,
      hostname: this.host,

      fetch: (async (req: Request) => {
        // Handle CORS preflight
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (req.method === 'OPTIONS') {
          return new Response(null, { headers: corsHeaders });
        }

        if (req.method !== 'POST') {
          return new Response('Method not allowed', { 
            status: 405,
            headers: corsHeaders 
          });
        }

        try {
          const url = new URL(req.url);
          const data = await req.json();

          switch (url.pathname) {
            case '/createSession': {
              const { owner, description, enhancePrompt = false } = data as {
                owner: string;
                description: string;
                enhancePrompt?: boolean;
              };
              const session = await this.handler.onCreateSession(owner, description, enhancePrompt);
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
              return new Response('Not found', { 
                status: 404,
                headers: corsHeaders 
              });
          }
        } catch (error) {
          logger.error('HTTP server error:', error);
          return new Response(
            JSON.stringify({ error: String(error) }), 
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

    logger.info(`HTTP server started on http://${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      logger.info('HTTP server closed');
    }
  }
} 