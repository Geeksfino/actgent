import { createServer, Server } from 'http';
import { parse as parseUrl } from 'url';
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
    this.server = createServer(async (req, res) => {
      const url = parseUrl(req.url || '', true);
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      
      try {
        await new Promise((resolve) => {
          req.on('end', async () => {
            const data = JSON.parse(body);

            try {
              switch (url.pathname) {
                case '/createSession':
                  const { owner, description, enhancePrompt = false } = data;
                  const session = await this.handler.onCreateSession(owner, description, enhancePrompt);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ sessionId: session.sessionId }));
                  break;

                case '/chat':
                  const { sessionId, message } = data;
                  await this.handler.onChat(sessionId, message);
                  res.writeHead(200);
                  res.end(JSON.stringify({ status: 'Message sent' }));
                  break;

                default:
                  res.writeHead(404);
                  res.end('Not found');
              }
            } catch (error) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(error) }));
            }
            resolve(undefined);
          });
        });
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(this.port, this.host, () => {
        logger.info(`HTTP server started on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }
  }
} 