import { Database } from "bun:sqlite";
import { connect, StringCodec, NatsConnection } from "nats";
import axios from "axios";

interface AgentConfig {
  id: string;
  tools?: { [key: string]: (...args: any[]) => any };
  goals?: Goal[];
  llmConfig?: LLMConfig;
}

interface LLMConfig {
  apiKey: string;
  model: string;
}

interface Task {
  type: string;
  data: any;
}

class Goal {
  constructor(
    public name: string,
    public condition: (agent: BaseAgent) => boolean,
    public action: (agent: BaseAgent) => void
  ) {}

  evaluate(agent: BaseAgent): void {
    if (this.condition(agent)) {
      this.action(agent);
    }
  }
}

class BaseAgent {
  private id: string;
  private mailbox: Task[];
  private memory: Database;
  private tools: { [key: string]: (...args: any[]) => any };
  private goals: Goal[];
  private nats: NatsConnection | null;
  private sc: StringCodec;
  private llmConfig: LLMConfig | null;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.mailbox = [];
    this.memory = new Database(":memory:");
    this.tools = config.tools || {};
    this.goals = config.goals || [];
    this.nats = null;
    this.sc = StringCodec();
    this.llmConfig = config.llmConfig || null;

    this.initializeMemory();
    this.connectToNats();
    this.startDecisionMakingLoop();
  }

  private async initializeMemory(): Promise<void> {
    this.memory.run("CREATE TABLE IF NOT EXISTS knowledge (key TEXT PRIMARY KEY, value TEXT)");
  }

  private async connectToNats(): Promise<void> {
    try {
      this.nats = await connect({ servers: "nats://localhost:4222" });
      console.log(`Agent ${this.id} connected to NATS`);
      
      const sub = this.nats.subscribe(`agent.${this.id}`);
      (async () => {
        for await (const msg of sub) {
          const task = JSON.parse(this.sc.decode(msg.data));
          this.receiveTask(task);
        }
      })();
    } catch (error) {
      console.error(`Failed to connect to NATS: ${error}`);
    }
  }

  private receiveTask(task: Task): void {
    this.mailbox.push(task);
    this.processMailbox();
  }

  private async processMailbox(): Promise<void> {
    while (this.mailbox.length > 0) {
      const task = this.mailbox.shift();
      if (task) {
        await this.handleTask(task);
      }
    }
  }

  private async handleTask(task: Task): Promise<void> {
    console.log(`Agent ${this.id} handling task:`, task);
    // Implement task handling logic here
    // You can use this.tools[toolName](args) to execute tools
  }

  public async saveToMemory(key: string, value: any): Promise<void> {
    await this.memory.run("INSERT OR REPLACE INTO knowledge (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
  }

  public async getFromMemory(key: string): Promise<any> {
    const result = await this.memory.get("SELECT value FROM knowledge WHERE key = ?", [key]);
    return result ? JSON.parse(result.value) : null;
  }

  public async sendMessage(recipient: string, message: any, protocol: "nats" | "http" = "nats"): Promise<void> {
    if (protocol === "nats" && this.nats) {
      await this.nats.publish(`agent.${recipient}`, this.sc.encode(JSON.stringify(message)));
    } else if (protocol === "http") {
      // Implement HTTP communication here
      await axios.post(`http://${recipient}/message`, message);
    }
  }

  private planNextAction(): void {
    for (const goal of this.goals) {
      goal.evaluate(this);
    }
  }

  private startDecisionMakingLoop(): void {
    setInterval(() => {
      this.planNextAction();
    }, 5000); // Check goals every 5 seconds
  }

  // LLM interaction method
  public async interactWithLLM(prompt: string): Promise<string> {
    if (!this.llmConfig) {
      throw new Error("LLM configuration not provided");
    }
    
    // Implement LLM API call here
    // This is a placeholder implementation
    console.log(`Interacting with LLM using prompt: ${prompt}`);
    return "LLM response placeholder";
  }

  // Method to add new goals
  public addGoal(goal: Goal): void {
    this.goals.push(goal);
  }

  // Method to add new tools
  public addTool(name: string, tool: (...args: any[]) => any): void {
    this.tools[name] = tool;
  }
}

// Example usage
const myAgent = new BaseAgent({
  id: "agent1",
  tools: {
    add: (a: number, b: number) => a + b,
    multiply: (a: number, b: number) => a * b,
  },
  goals: [
    new Goal(
      "Example Goal",
      (agent) => true, // Always evaluate to true for this example
      (agent) => console.log("Executing example goal action")
    )
  ],
  llmConfig: {
    apiKey: "your-api-key",
    model: "gpt-3.5-turbo",
  }
});

export { BaseAgent, Goal, AgentConfig, Task };