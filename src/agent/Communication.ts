import { NatsConnection, connect, StringCodec } from 'nats';
import { CommunicationConfig } from '../core/interfaces';
import { Message } from '../core/Message'; 

export class Communication {
  public host: string;
  private nats: NatsConnection | null = null;
  private natsUrl: string | null = null;
  private sc = StringCodec();
  private httpPort: number | null = null; // Added for HTTP server
  private grpcPort: number | null = null; // Added for gRPC server
  public onMessage: ((message: Message) => void) | null = null;

  constructor(config: CommunicationConfig) {
    console.log('Communication constructor called');
    this.host = "0.0.0.0";  // default is local. After registration, the agent registry will set this to the appropriate host
    this.natsUrl = config.natsUrl || null; // Optional NATS URL
    this.httpPort = config.httpPort || null; // Optional HTTP port
    this.grpcPort = config.grpcPort || null; // Optional gRPC port

    if (this.natsUrl) {
      this.connectToNats(this.natsUrl);
    }
    
    if (this.httpPort) {
      this.startHTTPServer(this.httpPort);
    }
    
    if (this.grpcPort) {
      this.startGRPCServer(this.grpcPort);
    }
  }

  private async startHTTPServer(port: number): Promise<void> {
    console.log('startHTTPServer called with port:', port);
    const server = Bun.serve({
      port,
      fetch: async (req) => {
        if (req.method === 'POST' && req.url === '/queue-task') {
          const content = await req.json(); // Assuming the content is sent as JSON
          
          if (this.isValidMessage(content)) {
            this.handleMessage(content as Message); 
            return new Response('Task queued', { status: 200 });
          } else {
            return new Response('Invalid message format', { status: 400 });
          }
        }
        return new Response('Not Found', { status: 404 });
      },
    });
    console.log(`Agent HTTP server running on port ${port}`);
  }

  private isValidMessage(message: any): boolean {
    return true
  }

  private startGRPCServer(port: number): void {
    console.log('startGRPCServer called with port:', port);
    // gRPC server logic (requires additional setup)
    // Example of handling a gRPC call
    console.log(`gRPC server running on port ${port}`);
  }

  async connectToNats(url: string): Promise<void> {
    console.log('connectToNats called with url:', url);
    try {
      this.nats = await connect({ servers: url });
      console.log('Connected to NATS');
    } catch (error) {
      console.error(`Failed to connect to NATS: ${error}`);
    }
  }

  async sendHttpMessage(message: any): Promise<any> {
    console.log('sendHttpMessage called with message:', message);
    const url = `http://${this.host}:${this.httpPort}/queue-task`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return response.json();
  }

  async sendGrpcMessage(service: string, method: string, message: any): Promise<any> {
    console.log('sendGrpcMessage called with service:', service, 'method:', method, 'message:', message);
    console.log(`Sending gRPC message to ${service}.${method}`);
    // Implement gRPC call here
    return { success: true, message: 'gRPC call placeholder' };
  }

  async sendNatsMessage(subject: string, message: any): Promise<void> {
    console.log('sendNatsMessage called with subject:', subject, 'message:', message);
    if (!this.nats) {
      throw new Error('NATS connection not established');
    }
    await this.nats.publish(subject, this.sc.encode(JSON.stringify(message)));
  }

  async subscribeToNats(subject: string, callback: (message: Message) => void): Promise<void> {
    console.log('subscribeToNats called with subject:', subject);
    if (!this.nats) {
      throw new Error('NATS connection not established');
    }
    const sub = this.nats.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        const decodedMsg = JSON.parse(this.sc.decode(msg.data));
        const message = new Message(decodedMsg.input, decodedMsg.inputType, decodedMsg.parameters, decodedMsg.context, decodedMsg.sender, decodedMsg.priority, decodedMsg.correlationId);
        callback(message); // Pass the Message instance to the callback
      }
    })();
  }

  private handleMessage(message: Message): void {
    console.log('handleMessage called with message:', message);
    if (this.onMessage) {
      this.onMessage(message);
    } else {
      console.log("Received message:", message);
    }
  }

  public shutdown(): void {
    console.log('shutdown called');
    // Implement shutdown logic for HTTP and gRPC servers
    console.log("Shutting down communication servers");
    // Add logic to stop HTTP and gRPC servers
  }
}