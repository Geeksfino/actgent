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
    logger.debug('[Communication] Starting communication layer...');
    try {
      // Start HTTP protocol if port is configured
      if (this.config.httpPort) {
        this.httpProtocol = new HttpProtocol(
          this.handler,
          this.config.httpPort,
          this.config.host
        );
        logger.debug('[Communication] Starting HTTP protocol');
        await this.httpProtocol.start();
      }

      // Start streaming protocol only if streaming is enabled and we have a port
      if (this.config.enableStreaming) {
        const streamPort = this.config.streamPort || (this.config.httpPort ? this.config.httpPort + 1 : undefined);
        if (streamPort) {
          this.streamingProtocol = new StreamingProtocol(
            this.handler,
            streamPort,
            this.config.host
          );
          logger.debug('[Communication] Streaming enabled, starting streaming protocol');
          await this.streamingProtocol.start();
        } else {
          logger.warning('Streaming enabled but no port configured');
        }
      } else {
        logger.debug('[Communication] Streaming disabled, skipping streaming protocol');
      }
      
      logger.info('[Communication] Communication layer started successfully');
    } catch (error) {
      logger.error('[Communication] Failed to start communication layer:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.debug('[Communication] Stopping communication layer...');
    try {
      // Stop streaming first to close all client connections
      if (this.streamingProtocol) {
        logger.debug('[Communication] Stopping streaming protocol');
        await this.streamingProtocol.stop();
        this.streamingProtocol = undefined;
      }

      // Then stop HTTP server
      if (this.httpProtocol) {
        logger.debug('[Communication] Stopping HTTP protocol');
        await this.httpProtocol.stop();
        this.httpProtocol = undefined;
      }

      logger.info('[Communication] Communication layer stopped successfully');
    } catch (error) {
      logger.error('[Communication] Error during shutdown:', error);
      throw error;
    }
  }

  public broadcastStreamData(sessionId: string, data: string): void {
    logger.debug('[Communication] Broadcasting stream data');
    try {
      if (this.streamingProtocol && this.config.enableStreaming) {
        this.streamingProtocol.broadcast(data);
        logger.debug('[Communication] Stream data broadcast successful');
      } else {
        logger.debug('[Communication] No streaming protocol available for broadcast');
      }
    } catch (error) {
      logger.error('[Communication] Error broadcasting stream data:', error);
    }
  }
}