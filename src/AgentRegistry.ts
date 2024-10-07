import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { AgentCore } from './AgentCore';

export class AgentRegistry {
	private static instance: AgentRegistry;
	private agents: Map<string, AgentCore> = new Map();
	private capabilitiesContext: string = "";
	private openai: OpenAI;
    private model: string;
	private httpPort: number;
	private grpcPort: number;

	private constructor(config: { httpPort: number, grpcPort: number, apiKey: string, model: string, baseURL: string }) {
		this.httpPort = config.httpPort;
		this.grpcPort = config.grpcPort;
		this.openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
		this.model = config.model;
		this.initializeRemoteAccess();
	}

	public static init(config: { httpPort: number, grpcPort: number, apiKey: string, model: string, baseURL: string }) {
		AgentRegistry.instance = new AgentRegistry(config);
	}

	public static getInstance(): AgentRegistry {
		return AgentRegistry.instance;
	}

	registerAgent(agent: AgentCore): string {
		const agentId = uuidv4();
		agent.id = agentId; // Assuming BaseAgent has an 'id' property
		this.agents.set(agentId, agent);
		this.updateCapabilitiesContext();
		return agentId;
	}

	getAllAgents(): AgentCore[] {
		return Array.from(this.agents.values());
	}

	private updateCapabilitiesContext(): void {
		// Regenerate the entire capabilities context
		this.capabilitiesContext = Array.from(this.agents.values())
			.map((agent: AgentCore) => {
				const capabilities = agent.getCapabilities();
				return `Agent ${agent.id} has capabilities:\n${capabilities}`;
			})
			.join('\n\n');
	}

	getCapabilitiesContext(): string {
		return this.capabilitiesContext;
	}

	public async findAgentByCapabilities(capabilities: string): Promise<AgentCore | null> {
		const prompt = `${this.capabilitiesContext}\n\nRequested capabilities: ${capabilities}\n\nBased on the above information, which agent ID is the best match for the requested capabilities? Respond with only the agent ID.`;
		
		const response = await this.openai.chat.completions.create({
			model: this.model,
			messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that can find the best agent for a given task.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
		});

		const agentId = response.choices[0].message.content;

        if (agentId) {
		    return this.agents.get(agentId) || null; 
        }

        return null;
	}

	public deregisterAgent(agentId: string): void {
		this.agents.delete(agentId);
		this.updateCapabilitiesContext();
	}

	// ... Remote access methods ...

	private initializeRemoteAccess(): void {
		this.initializeHTTP();
		this.initializeGRPC();
	}

	private initializeHTTP(): void {
		const server = Bun.serve({
			port: this.httpPort,
			fetch: this.handleHttpRequest.bind(this),
		});

		console.log(`HTTP server running on port ${server.port}`);
	}

	private async handleHttpRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST') {
			const body = await request.json();

			switch (url.pathname) {
				case '/register':
					return this.httpRegisterAgent(request);
				case '/deregister':
					return this.httpDeregisterAgent(body);
				case '/findByCapabilities':
					return this.httpFindAgentByCapabilities(body);
				default:
					return new Response('Not Found', { status: 404 });
			}
		}

		return new Response('Method Not Allowed', { status: 405 });
	}

	private async httpRegisterAgent(request: Request): Promise<Response> {
		const agent: AgentCore = await request.json() as AgentCore; 
        const host = request.headers.get("host") || new URL(request.url).host;
		const id = this.registerAgent(agent);
		return new Response(JSON.stringify({ id }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	private httpDeregisterAgent(body: any): Response {
		const { id } = body;
		this.deregisterAgent(id);
		return new Response('OK', { status: 200 });
	}

	private async httpFindAgentByCapabilities(body: any): Promise<Response> {
		const { capabilities } = body;
		const agent = await this.findAgentByCapabilities(capabilities);
		if (agent) {
			return new Response(JSON.stringify(agent.toJSON()), {
				headers: { 'Content-Type': 'application/json' },
			});
		} else {
			return new Response('Not Found', { status: 404 });
		}
	}

	private initializeGRPC(): void {
		// Initialize gRPC server using this.grpcPort
		console.log(`gRPC server running on port ${this.grpcPort}`);
	}

	public toJSON(): string {
		const agentsArray = Array.from(this.agents.entries()).map(([id, agent]) => [id, agent.toJSON()]);
		return JSON.stringify({
			agents: agentsArray,
			capabilitiesContext: this.capabilitiesContext,
		});
	}

	public fromJSON(json: string): AgentRegistry {
		const data = JSON.parse(json);
		const registry = AgentRegistry.getInstance();
		registry.capabilitiesContext = data.capabilitiesContext;
		return registry;
	}
}