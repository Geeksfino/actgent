import { NatsConnection, connect, StringCodec } from 'nats';
import { CommunicationConfig } from './interfaces';
export class Communication {
  private nats: NatsConnection | null = null;
  private natsUrl: string | null = null;
  private sc = StringCodec();

  constructor(config: CommunicationConfig) {
    this.natsUrl = config.url;
    this.connectToNats(this.natsUrl);
  }

  async connectToNats(url: string): Promise<void> {
    try {
      this.nats = await connect({ servers: url });
      console.log('Connected to NATS');
    } catch (error) {
      console.error(`Failed to connect to NATS: ${error}`);
    }
  }

  async sendNatsMessage(subject: string, message: any): Promise<void> {
    if (!this.nats) {
      throw new Error('NATS connection not established');
    }
    await this.nats.publish(subject, this.sc.encode(JSON.stringify(message)));
  }

  async subscribeToNats(subject: string, callback: (message: any) => void): Promise<void> {
    if (!this.nats) {
      throw new Error('NATS connection not established');
    }
    const sub = this.nats.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        const decodedMsg = JSON.parse(this.sc.decode(msg.data));
        callback(decodedMsg);
      }
    })();
  }

  async sendHttpMessage(url: string, message: any): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return response.json();
  }

  // Placeholder for gRPC implementation
  // You'll need to set up a gRPC client and server separately
  async sendGrpcMessage(service: string, method: string, message: any): Promise<any> {
    console.log(`Sending gRPC message to ${service}.${method}`);
    // Implement gRPC call here
    return { success: true, message: 'gRPC call placeholder' };
  }
}