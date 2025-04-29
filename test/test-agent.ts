// test-agent.ts
// Automated test agent script for actgent-based agents
// Usage: bun run test-agent.ts (set env vars as needed)

import { fetch } from "bun";
import OpenAI from "openai";

// --- CLI ARGUMENT PARSING ---
function parseArgs() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        argMap[key] = value;
        i++;
      } else {
        argMap[key] = "";
      }
    }
  }
  return argMap;
}

const args = parseArgs();

const LLM_API_KEY = args["llm-api-key"];
const LLM_MODEL = args["llm-model"] || "gpt-4";
const LLM_URL = args["llm-url"] || "https://api.openai.com/v1/chat/completions";
const TARGET_AGENT_WS_URL = args["agent-ws-url"] || "ws://localhost:5680/ws";
const NUM_ROUNDS = Number(args["num-rounds"] || 5);
const TEST_SCENARIO = args["scenario"] || "You are a user testing the agent's ability to answer questions about diabetes.";
const USER_MAX_TOKENS = Number(args["user-max-tokens"] || 128);
const USER_TEMPERATURE = Number(args["user-temperature"] || 0.8);

function printUsageAndExit() {
  console.error(`\nUsage: bun run test-agent.ts \\
  --llm-api-key <key> \\
  --llm-model <model> \\
  --llm-url <url> \\
  --agent-ws-url <url> [--num-rounds <n>] [--scenario <prompt>] \\
  [--user-max-tokens <n>] [--user-temperature <float>]\n`);
  process.exit(1);
}

if (!LLM_API_KEY || !LLM_MODEL || !LLM_URL || !TARGET_AGENT_WS_URL) {
  printUsageAndExit();
}


const openai = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_URL,
});

async function generateUserMessage(
  history: {role: string, content: string}[],
  scenario: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  // Always end with a 'user' message for LLM completion
  // If history is empty, ask LLM to generate the first user message
  let prompt: {role: "system"|"user"|"assistant", content: string}[] = [
    { role: "system", content: scenario + "\nYou are simulating a human user in a conversation. Generate the next user message in this context." },
    // Instead of an empty user message, mimic a greeting from the agent
    { role: "user", content: "Hello! How can I assist you today?" },
    ...history.map(m => ({
      // Always preserve correct roles: 'user' for agent responses, 'assistant' for LLM completions
      role: m.role as "user" | "assistant" | "system",
      content: m.content
    }))
  ];


  // --- DEBUG LOGGING ---
  const openaiConfig = (openai as any).baseURL ? { baseURL: (openai as any).baseURL } : {};
  const maskedKey = LLM_API_KEY ? (LLM_API_KEY.slice(0, 5) + '...' + LLM_API_KEY.slice(-4)) : '';
  console.log("[DEBUG] OpenAI LLM call:");
  console.log("  Endpoint:", LLM_URL);
  console.log("  Model:", LLM_MODEL);
  console.log("  API Key:", maskedKey);
  console.log("  Payload:", JSON.stringify({
    model: LLM_MODEL,
    messages: prompt,
    max_tokens: maxTokens,
    temperature
  }, null, 2));
  // --- END DEBUG LOGGING ---
  try {
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: prompt as any, // Safe: only system/user/assistant roles used
      max_tokens: maxTokens,
      temperature,
    });
    const msg = response.choices?.[0]?.message?.content;
    return msg ? msg.trim() : "[No response]";
  } catch (err) {
    // Log and return fallback
    console.error("LLM API error:", err);
    if (err && typeof err === 'object' && 'status' in err && (err as any).status === 400) {
      console.error("400 Bad Request: Check your LLM URL, model, and API key. This often means the endpoint is not OpenAI-compatible or the request format is wrong.");
    }
    return "[LLM error]";
  }
}



async function main() {
  let history: {role: string, content: string}[] = [];
  // 1. Generate the first user message
  let userMsg = await generateUserMessage(history, TEST_SCENARIO, USER_MAX_TOKENS, USER_TEMPERATURE);
  // Fallback if LLM fails to generate a valid message
  if (!userMsg || userMsg.trim() === "" || userMsg.startsWith("[LLM error]")) {
    console.warn('[DEBUG] LLM failed to generate a valid first user message. Falling back to "Hello".');
    userMsg = "Hello";
  }
  console.log('[DEBUG] First user message to agent /createSession:', userMsg);

  // --- WebSocket Setup (pure WebSocket protocol) ---
  const ws = new WebSocket(TARGET_AGENT_WS_URL);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  // --- WebSocket event handling ---
  let sessionId = '';
  let agentMsg = '';
  let awaitingSessionCreated: ((id: string) => void) | null = null;
  let awaitingAgentResponse: ((msg: string) => void) | null = null;
  let streamingBuffer = '';

  ws.onmessage = (event) => {
    let data: any;
    try {
      let text: string;
      if (typeof event.data === 'string') {
        text = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(event.data);
      } else {
        // Fallback: try to coerce to string
        text = String(event.data);
      }
      console.debug("[DEBUG] Raw agent WS message:", text);
      data = JSON.parse(text);
    } catch (e) {
      console.error("[DEBUG] Failed to parse agent WS message:", e, event.data);
      return;
    }
    // Handle session creation
    if (data.type === 'sessionCreated') {
      sessionId = data.sessionId;
      if (awaitingSessionCreated) {
        awaitingSessionCreated(sessionId);
        awaitingSessionCreated = null;
      }
      return;
    }
    // Handle error
    if (data.type === 'error') {
      if (awaitingSessionCreated) {
        awaitingSessionCreated('');
        awaitingSessionCreated = null;
      }
      if (awaitingAgentResponse) {
        awaitingAgentResponse('[Agent error: ' + (data.error || 'unknown') + ']');
        awaitingAgentResponse = null;
      }
      return;
    }
    // Handle completion (either explicit or OpenAI-style finish_reason)
    if (data.type === 'completion' || (data.choices && data.choices[0]?.finish_reason)) {
      if (awaitingAgentResponse) {
        const msg = streamingBuffer;
        streamingBuffer = '';
        // Print a newline after the full response
        process.stdout.write('\n');
        awaitingAgentResponse(msg);
        awaitingAgentResponse = null;
      }
      return;
    }
    // Handle streamed chunk (accumulate and print immediately)
    let content = '';
    if (data.choices && data.choices[0]) {
      if (data.choices[0].delta && data.choices[0].delta.content)
        content = data.choices[0].delta.content;
      else if (data.choices[0].content)
        content = data.choices[0].content;
    }
    if (content) {
      streamingBuffer += content;
      process.stdout.write(content); // Print chunk as it arrives
    }
  };

  function wsCreateSession(description: string): Promise<string> {
    return new Promise((resolve, reject) => {
      awaitingSessionCreated = resolve;
      ws.send(JSON.stringify({ type: 'createSession', description }));
      setTimeout(() => {
        if (awaitingSessionCreated) {
          awaitingSessionCreated('');
          awaitingSessionCreated = null;
          reject(new Error('Timeout waiting for sessionCreated'));
        }
      }, 10000);
    });
  }

  function wsSendChat(sessionId: string, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      awaitingAgentResponse = resolve;
      ws.send(JSON.stringify({ type: 'chat', sessionId, message }));
      setTimeout(() => {
        if (awaitingAgentResponse) {
          awaitingAgentResponse('[Timeout waiting for agent response]');
          awaitingAgentResponse = null;
          reject(new Error('Timeout waiting for agent response'));
      }
    }, 60000);
  });
}

// 2. Create session via WebSocket (first user message)
sessionId = await wsCreateSession(userMsg);
if (!sessionId) throw new Error('Failed to create session via WebSocket');
// Wait for the agent's response to the /createSession (first user message)
// The agent's response will be handled in ws.onmessage and should resolve awaitingAgentResponse if protocol supports it
// For consistency, we simulate the first round just like the conversation loop
// Record the LLM's output as 'assistant' (LLM always generates as 'assistant')
history.push({ role: 'assistant', content: userMsg });
// Wait for the agent's first response before proceeding
agentMsg = await new Promise<string>((resolve) => {
  awaitingAgentResponse = resolve;
});
if (!agentMsg) agentMsg = '[No response]';
// Record the agent's output as 'user' (anything sent to LLM is 'user')
history.push({ role: 'user', content: agentMsg });
console.log(`SimUser: ${userMsg}\nAgent: ${agentMsg}\n`);

// Conversation loop for subsequent rounds
for (let i = 1; i < NUM_ROUNDS; i++) {
  // LLM generates the next simulated user message (always as 'assistant')
  const llmAssistantMsg = await generateUserMessage(history, TEST_SCENARIO, USER_MAX_TOKENS, USER_TEMPERATURE);
  // Record LLM output as 'assistant'
  history.push({ role: 'assistant', content: llmAssistantMsg });
  // Send to agent as user message
  agentMsg = await wsSendChat(sessionId, llmAssistantMsg);
  if (!agentMsg) agentMsg = '[No response]';
  // Record agent output as 'user' (anything sent to LLM is 'user')
  history.push({ role: 'user', content: agentMsg });
  console.log(`SimUser: ${llmAssistantMsg}\nAgent: ${agentMsg}\n`);
}

ws.close();
}

main().catch(err => {
  console.error("Test agent encountered an error:", err);
  process.exit(1);
});
