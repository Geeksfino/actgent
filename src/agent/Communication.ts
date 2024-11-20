import { CommunicationConfig } from '../core/configs';
import { HttpProtocol } from './protocols/HttpProtocol';
import { StreamingProtocol } from './protocols/StreamingProtocol';
import { BaseCommunicationProtocol, RequestHandler } from './ICommunication';
import { logger } from '../core/Logger';

export class Communication {
  private httpProtocol?: HttpProtocol;
  private streamingProtocol?: StreamingProtocol;
  private config: CommunicationConfig;
  private handler: RequestHandler;

  constructor(config: CommunicationConfig, handler: RequestHandler) {
    this.config = config;
    this.handler = handler;
  }

  async start(): Promise<void> {
    // Start HTTP protocol if port is configured
    if (this.config.httpPort) {
      this.httpProtocol = new HttpProtocol(
        this.handler,
        this.config.httpPort,
        this.config.host
      );
      await this.httpProtocol.start();

      // When HTTP is enabled, also start streaming server
      // Note: This doesn't mean streaming will be used - that depends on LLM config
      this.streamingProtocol = new StreamingProtocol(
        this.handler,
        this.config.streamPort || this.config.httpPort + 1,
        this.config.host
      );
      await this.streamingProtocol.start();
    }
  }

  async stop(): Promise<void> {
    if (this.httpProtocol) {
      await this.httpProtocol.stop();
    }
    if (this.streamingProtocol) {
      await this.streamingProtocol.stop();
    }
  }

  public broadcastStreamData(sessionId: string, data: string): void {
    if (this.streamingProtocol) {
      this.streamingProtocol.broadcastToSession(sessionId, data);
    }
  }
}