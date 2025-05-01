import { CommunicationConfig } from '../core/configs';
import { HttpProtocol } from './protocols/HttpProtocol';
import { StreamingProtocol } from './protocols/StreamingProtocol';
import { WebSocketProtocol } from './protocols/WebSocketProtocol';
import { BaseCommunicationProtocol, AgentRequestHandler } from './ICommunication';
import { logger } from '../core/Logger';
import { BaseAgent } from './BaseAgent';

export class Communication {
  private httpProtocol?: HttpProtocol;
  private _streamingProtocol?: StreamingProtocol;
  private _webSocketProtocol?: WebSocketProtocol;
  private config: CommunicationConfig;
  private handler: AgentRequestHandler;

  constructor(config: CommunicationConfig, agent: BaseAgent<any, any, any>) {
    this.config = config;
    this.handler = new AgentRequestHandler(agent);
  }

  get streamingProtocol(): StreamingProtocol | undefined {
    return this._streamingProtocol;
  }

  get webSocketProtocol(): WebSocketProtocol | undefined {
    return this._webSocketProtocol;
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

      // Auto-enable WebSocket when streaming is enabled
      // Use streaming port for WebSocket if not explicitly configured
      const enableWs = this.config.enableWebSocket !== false && this.config.enableStreaming;
      
      // Initialize WebSocket protocol first if enabled (important for path-based routing)
      if (enableWs) {
        // Use streaming port + 1 for WebSocket if not explicitly configured
        const wsPort = this.config.wsPort || 
          (this.config.streamPort ? this.config.streamPort + 1 : undefined) || 
          (this.config.httpPort ? this.config.httpPort + 2 : undefined);
        if (wsPort) {
          this._webSocketProtocol = new WebSocketProtocol(
            this.handler,
            wsPort,
            this.config.host
          );
          logger.trace('[Communication] WebSocket enabled, starting WebSocket protocol');
          await this._webSocketProtocol.start();
        } else {
          logger.warning('WebSocket enabled but no port configured');
        }
      } else {
        logger.trace('[Communication] WebSocket disabled, skipping WebSocket protocol');
      }
      
      // Start streaming protocol only if streaming is enabled and we have a port
      // Initialize after WebSocket to ensure proper handling of non-WebSocket paths
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

      // Stop WebSocket server if it was started
      // WebSocket is auto-enabled when streaming is enabled
      if (this._webSocketProtocol) {
        logger.trace('[Communication] Stopping WebSocket protocol');
        await this._webSocketProtocol.stop();
        this._webSocketProtocol = undefined;
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
      // Broadcast to streaming protocol if enabled
      if (this._streamingProtocol && this.config.enableStreaming) {
        this._streamingProtocol.broadcast(data, sessionId);
        //logger.trace('[Communication] Stream data broadcast successful');
      }
      
      // Broadcast to WebSocket protocol if available
      // WebSocket is auto-enabled when streaming is enabled
      if (this._webSocketProtocol && sessionId) {
        try {
          // Parse data to ensure it's valid JSON before sending
          const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
          
          // Send to WebSocket clients for this session
          this._webSocketProtocol.sendToSession(sessionId, JSON.stringify(jsonData));
        } catch (wsError) {
          // If parsing fails, send as is
          this._webSocketProtocol.sendToSession(sessionId, data);
          //logger.debug('[Communication] Error parsing data for WebSocket broadcast:', wsError);
        }
      }
      
      if (!this._streamingProtocol && !this._webSocketProtocol) {
        //logger.trace('[Communication] No protocols available for broadcast');
      }
    } catch (error) {
      logger.error('[Communication] Error broadcasting data:', error);
    }
  }
}