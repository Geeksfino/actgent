import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import { BaseAgent } from '../src/BaseAgent';
import { Message } from '../src/Message';
import { AgentRegistry } from '../src/AgentRegistry';
import { Communication } from '../src/Communication';
import { Memory } from '../src/Memory';
import { PriorityInbox } from '../src/PriorityInbox';

// Mocking modules is not directly supported in Bun, so you may need to handle this differently.

describe('BaseAgent', () => {
  let agent: BaseAgent;

  beforeEach(() => {
    const config = {
      name: 'TestAgent',
      capabilities: [{ name: 'gossip', description: 'Can engage in casual conversation and assist new agents' }],
      goal: 'Assist other agents joining the network for testing purposes',
      llmConfig: { apiKey: 'sk-proj-jX354321', model: 'gpt-4' },
      tools: {},
    };
    agent = new BaseAgent(config);
  });

  it('should initialize with correct properties', () => {
    expect(agent.name).toBe('TestAgent');
    expect(agent.goal).toBe('Assist other agents joining the network for testing purposes');
    expect(agent.capabilities).toEqual([{ name: 'gossip', description: 'Can engage in casual conversation and assist new agents' }]);
  });

  it('should process a message correctly', async () => {
    const message = new Message('Test task');
    await agent.processMessage(message);
    // Add assertions based on expected behavior after processing the message
  });

  it('should check the priority inbox and process messages', async () => {
    const message = new Message('Test task');
    agent['inbox'].enqueue(message); // Directly enqueue a message for testing
    await agent['checkPriorityInbox']();
    // Add assertions based on expected behavior after checking the inbox
  });

  it('should send a task and process it', async () => {
    const task = 'Test task';
    await agent.sendTask(task);
    // Add assertions based on expected behavior after sending the task
  });

  it('should convert to JSON and back', () => {
    const json = agent.toJSON();
    const newAgent = BaseAgent.fromJSON(json);
    expect(newAgent.name).toBe(agent.name);
    expect(newAgent.goal).toBe(agent.goal);
  });

  afterEach(() => {
    // Clear any necessary state or mocks if applicable
  });
});