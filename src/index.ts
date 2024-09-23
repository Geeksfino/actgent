import { BaseAgent } from './BaseAgent';
import { Goal } from './Goal';

export { BaseAgent } from './BaseAgent';
export { Goal } from './Goal';
export { Communication } from './Communication';
export { Memory } from './Memory';
export { PromptManager } from './PromptManager';
export * from './interfaces';

// Example usage
const myAgent = new BaseAgent({
  id: "agent1",
  tools: {
    add: {
      name: "add",
      description: "Adds two numbers",
      execute: async (a: number, b: number) => a + b,
    },
    multiply: {
      name: "multiply",
      description: "Multiplies two numbers",
      execute: async (a: number, b: number) => a * b,
    },
  },
  goals: [
    new Goal(
      "Example Goal",
      (agent) => true, // Always evaluate to true for this example
      async (agent) => console.log("Executing example goal action")
    )
  ],
  llmConfig: {
    apiKey: "your-api-key",
    model: "gpt-3.5-turbo",
  }
});

console.log("Actgent framework initialized");