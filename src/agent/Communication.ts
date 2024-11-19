import { CommunicationConfig } from '../core/configs';
import { BaseCommunicationProtocol, RequestHandler } from './ICommunication';
import { HttpProtocol } from './protocols/HttpProtocol';
import { logger } from '../core/Logger';

export class Communication {
  private protocols: BaseCommunicationProtocol[] = [];

  constructor(
    private config: CommunicationConfig,
    private handler: RequestHandler
  ) {}

  async start(): Promise<void> {
    // Initialize HTTP if port is configured
    if (this.config.httpPort) {
      const httpProtocol = new HttpProtocol(
        this.handler,
        this.config.httpPort,
        this.config.host
      );
      this.protocols.push(httpProtocol);
    }

    // Future: Initialize NATS if configured
    // if (this.config.natsUrl) {
    //   const natsProtocol = new NatsProtocol(this.handler, this.config.natsUrl);
    //   this.protocols.push(natsProtocol);
    // }

    // Future: Initialize gRPC if configured
    // if (this.config.grpcPort) {
    //   const grpcProtocol = new GrpcProtocol(this.handler, this.config.grpcPort);
    //   this.protocols.push(grpcProtocol);
    // }

    // Start all configured protocols
    for (const protocol of this.protocols) {
      try {
        await protocol.start();
      } catch (error) {
        logger.error(`Failed to start protocol: ${error}`);
      }
    }
  }

  async stop(): Promise<void> {
    for (const protocol of this.protocols) {
      try {
        await protocol.stop();
      } catch (error) {
        logger.error(`Failed to stop protocol: ${error}`);
      }
    }
  }
}