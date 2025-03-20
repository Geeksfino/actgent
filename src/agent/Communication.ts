import { CommunicationConfig } from '../core/configs';
import { HttpProtocol } from './protocols/HttpProtocol';
import { StreamingProtocol } from './protocols/StreamingProtocol';
import { BaseCommunicationProtocol, AgentRequestHandler } from './ICommunication';
import { logger } from '../core/Logger';
import { BaseAgent } from './BaseAgent';

export class Communication {
  private httpProtocol?: HttpProtocol;
  private _streamingProtocol?: StreamingProtocol;
  private config: CommunicationConfig;
  private handler: AgentRequestHandler;

  constructor(config: CommunicationConfig, agent: BaseAgent<any, any, any>) {
    this.config = config;
    this.handler = new AgentRequestHandler(agent);
  }

  get streamingProtocol(): StreamingProtocol | undefined {
    return this._streamingProtocol;
  }

  async start(): Promise<void> {
    logger.trace('[Communication] Starting communication layer...');
    try {
      // Start HTTP protocol if port is configured
      if (this.config.httpPort) {
        this.httpProtocol = new HttpProtocol(
          this.handler,
          this.config.httpPort,
          this.config.host
        );
        logger.trace('[Communication] Starting HTTP protocol');
        await this.httpProtocol.start();
      }

      // Start streaming protocol only if streaming is enabled and we have a port
      if (this.config.enableStreaming) {
        const streamPort = this.config.streamPort || (this.config.httpPort ? this.config.httpPort + 1 : undefined);
        if (streamPort) {
          this._streamingProtocol = new StreamingProtocol(
            this.handler,
            streamPort,
            this.config.host
          );
          logger.trace('[Communication] Streaming enabled, starting streaming protocol');
          await this._streamingProtocol.start();
        } else {
          logger.warning('Streaming enabled but no port configured');
        }
      } else {
        logger.trace('[Communication] Streaming disabled, skipping streaming protocol');
      }
      
      logger.info('[Communication] Communication layer started successfully');
    } catch (error) {
      logger.error('[Communication] Failed to start communication layer:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.trace('[Communication] Stopping communication layer...');
    try {
      // Stop streaming first to close all client connections
      if (this._streamingProtocol) {
        logger.trace('[Communication] Stopping streaming protocol');
        await this._streamingProtocol.stop();
        this._streamingProtocol = undefined;
      }

      // Then stop HTTP server
      if (this.httpProtocol) {
        logger.trace('[Communication] Stopping HTTP protocol');
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
    //logger.trace('[Communication] Broadcasting stream data');
    try {
      if (this._streamingProtocol && this.config.enableStreaming) {
        this._streamingProtocol.broadcast(data, sessionId);
        //logger.trace('[Communication] Stream data broadcast successful');
      } else {
        //logger.trace('[Communication] No streaming protocol available for broadcast');
      }
    } catch (error) {
      logger.error('[Communication] Error broadcasting stream data:', error);
    }
  }
}