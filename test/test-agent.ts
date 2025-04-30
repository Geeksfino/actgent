// test-agent.ts
// Automated test agent script for actgent-based agents
// Usage: bun run test-agent.ts (set env vars as needed)

import { fetch } from "bun";
import OpenAI from "openai";
import { logger as actgentLogger, LogLevel, Logger } from "../src/core/Logger";

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
const LOG_LEVEL = args["log-level"] ? args["log-level"].toUpperCase() : "INFO";

// Set logger level if specified
if (LOG_LEVEL && typeof actgentLogger.setLevel === "function") {
  actgentLogger.setLevel(Logger.parseLogLevel(LOG_LEVEL));
}

// Track round number globally for use in ws.onmessage and printing
let currentRoundNum = 1;

function printSimUserTurn(user: string, roundNum?: number) {
  const roundStr = roundNum !== undefined ? `  (Round ${roundNum})` : '';
  const simUserHeader = '\n\x1b[1;96;107m═════════════════════════════════════════\x1b[0m\n' +
    `\x1b[1;96m      🟦 SimUser 🟦${roundStr}\x1b[0m` +
    '\n\x1b[1;96;107m═════════════════════════════════════════\x1b[0m';
  console.log(`${simUserHeader}\n${user.trim()}\n`);
}

function printAgentHeader(roundNum?: number) {
  const roundStr = roundNum !== undefined ? `  (Round ${roundNum})` : '';
  const agentHeader = '\n\x1b[1;95;107m═════════════════════════════════════════\x1b[0m\n' +
    `\x1b[1;95m      🟪 Agent 🟪${roundStr}\x1b[0m` +
    '\n\x1b[1;95;107m═════════════════════════════════════════\x1b[0m';
  console.log(agentHeader);
}


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
    { role: "assistant", content: "Hello! How can I assist you today?" },
    ...history.map(m => ({
      // Always preserve correct roles: 'user' for agent responses, 'assistant' for LLM completions
      role: m.role as "user" | "assistant" | "system",
      content: m.content
    }))
  ];


  // --- DEBUG LOGGING ---
  const openaiConfig = (openai as any).baseURL ? { baseURL: (openai as any).baseURL } : {};
  const maskedKey = LLM_API_KEY ? (LLM_API_KEY.slice(0, 5) + '...' + LLM_API_KEY.slice(-4)) : '';
  actgentLogger.debug("OpenAI LLM call:");
  actgentLogger.debug("  Endpoint:", LLM_URL);
  actgentLogger.debug("  Model:", LLM_MODEL);
  actgentLogger.debug("  API Key:", maskedKey);
  actgentLogger.debug("  Payload:", JSON.stringify({
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
    actgentLogger.error("LLM API error:", err);
    if (err && typeof err === 'object' && 'status' in err && (err as any).status === 400) {
      actgentLogger.error("400 Bad Request: Check your LLM URL, model, and API key. This often means the endpoint is not OpenAI-compatible or the request format is wrong.");
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
    actgentLogger.warn('[DEBUG] LLM failed to generate a valid first user message. Falling back to "Hello".');
    userMsg = "Hello";
  }
  actgentLogger.debug('[DEBUG] First user message to agent /createSession:', userMsg);
  currentRoundNum = 1;
printSimUserTurn(userMsg, currentRoundNum);


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
  let spinner: ReturnType<typeof setInterval> | null = null;
  let spinner2: ReturnType<typeof setInterval> | null = null;

  ws.onclose = () => {
    if (spinner !== null) {
      clearInterval(spinner);
      spinner = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
    if (spinner2 !== null) {
      clearInterval(spinner2);
      spinner2 = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
    if (awaitingAgentResponse) {
      awaitingAgentResponse('[Connection closed]');
      awaitingAgentResponse = null;
    }
  };

  ws.onerror = (err) => {
    if (spinner !== null) {
      clearInterval(spinner);
      spinner = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
    if (spinner2 !== null) {
      clearInterval(spinner2);
      spinner2 = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
    if (awaitingAgentResponse) {
      awaitingAgentResponse('[Connection error]');
      awaitingAgentResponse = null;
    }
  };


  let isStreamingAgentResponse = false;
  ws.onmessage = (event) => {
    let data: any;
    try {
      let text: string;
      if (typeof event.data === 'string') {
        text = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(event.data);
      } else {
        text = String(event.data);
      }
      actgentLogger.debug("[DEBUG] Raw agent WS message:", text);
      data = JSON.parse(text);
    } catch (e) {
      actgentLogger.error("[DEBUG] Failed to parse agent WS message:", e, event.data);
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
        if (isStreamingAgentResponse) {
          isStreamingAgentResponse = false;
        }
        awaitingAgentResponse('[Agent error: ' + (data.error || 'unknown') + ']');
        awaitingAgentResponse = null;
      }
      return;
    }
    // Handle completion (either explicit or OpenAI-style finish_reason)
    // Only process the first completion per turn and ignore empty completions
    if (data.type === 'completion' || (data.choices && data.choices[0]?.finish_reason)) {
      if (awaitingAgentResponse) {
        // Defensive: only process non-empty completions
        const trimmed = streamingBuffer.trim();
        if (trimmed.length > 0) {
          if (spinner !== null) {
            clearInterval(spinner);
            spinner = null;
            process.stdout.write("\r" + " ".repeat(40) + "\r");
          }
          if (spinner2 !== null) {
            clearInterval(spinner2);
            spinner2 = null;
            process.stdout.write("\r" + " ".repeat(40) + "\r");
          }
          printAgentHeader(currentRoundNum);
          process.stdout.write('\n');
          process.stdout.write(trimmed + '\n');
          awaitingAgentResponse(trimmed);
        }
        streamingBuffer = '';
        isStreamingAgentResponse = false;
        awaitingAgentResponse = null;
      }
      return;
    }
    // Handle streamed chunk (accumulate only, do not print)
    let content = '';
    if (data.choices && data.choices[0]) {
      if (data.choices[0].delta && data.choices[0].delta.content)
        content = data.choices[0].delta.content;
      else if (data.choices[0].content)
        content = data.choices[0].content;
    }
    if (content) {
      streamingBuffer += content;
    }
  };

  function wsCreateSession(description: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (awaitingSessionCreated) {
          awaitingSessionCreated('');
          awaitingSessionCreated = null;
          reject(new Error('Timeout waiting for sessionCreated'));
        }
      }, 10000);
      awaitingSessionCreated = (sessionId: string) => {
        clearTimeout(timeoutId);
        resolve(sessionId);
      };
      ws.send(JSON.stringify({ type: 'createSession', description }));
    });
  }

  function wsSendChat(sessionId: string, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (awaitingAgentResponse) {
          awaitingAgentResponse = null;
          reject(new Error('Timeout waiting for agent response'));
        }
      }, 60000);
      awaitingAgentResponse = (msg: string) => {
        clearTimeout(timeoutId);
        resolve(msg);
      };
      ws.send(JSON.stringify({ type: 'chat', sessionId, message }));
    });
  }

// 2. Create session via WebSocket (first user message)
sessionId = await wsCreateSession(userMsg);
if (!sessionId) throw new Error('Failed to create session via WebSocket');
// Wait for the agent's response to the /createSession (first user message)
// The agent's response will be handled in ws.onmessage and should resolve awaitingAgentResponse if protocol supports it
// For consistency, we simulate the first round just like the conversation loop
// Record the SimUser's output as 'user'
history.push({ role: 'user', content: userMsg });
// Show progressive indicator while waiting for the agent's first response
let dots = 0;
spinner = setInterval(() => {
  process.stdout.write("\rWaiting for agent response" + ".".repeat(dots % 4) + "   ");
  dots++;
}, 400);

// Wait for the agent's first response before proceeding
agentMsg = await new Promise<string>((resolve) => {
  awaitingAgentResponse = (msg: string) => {
    if (spinner !== null) {
      clearInterval(spinner);
      spinner = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r"); // Erase spinner
    }
    resolve(msg);
  };
  ws.send(JSON.stringify({ type: 'createSession', description: userMsg }));
});
if (!agentMsg) agentMsg = '[No response]';
// Record the agent's output as 'assistant'
history.push({ role: 'assistant', content: agentMsg });


// Conversation loop for subsequent rounds
for (let i = 1; i < NUM_ROUNDS; i++) {
  currentRoundNum = i + 1; // round 2, 3, ...
  // LLM generates the next simulated user message (always as 'assistant')
  const llmAssistantMsg = await generateUserMessage(history, TEST_SCENARIO, USER_MAX_TOKENS, USER_TEMPERATURE);
  // Record LLM output as 'assistant'
  history.push({ role: 'assistant', content: llmAssistantMsg });
  // Print SimUser message immediately
  printSimUserTurn(llmAssistantMsg, currentRoundNum);
    // Show progressive indicator while waiting for agent response
  let dots2 = 0;
  spinner2 = setInterval(() => {
    process.stdout.write("\rWaiting for agent response" + ".".repeat(dots2 % 4) + "   ");
    dots2++;
  }, 400);
  // Send to agent as user message and await response
  agentMsg = await new Promise<string>((resolve) => {
    awaitingAgentResponse = (msg: string) => {
      if (spinner2 !== null) {
        clearInterval(spinner2);
        spinner2 = null;
        process.stdout.write("\r" + " ".repeat(40) + "\r"); // Erase spinner
      }
      resolve(msg);
    };
    ws.send(JSON.stringify({ type: 'chat', sessionId, message: llmAssistantMsg }));
  });
  if (!agentMsg) agentMsg = '[No response]';
  // Do NOT print agentMsg here (already streamed)
  // Only push to history
  history.push({ role: 'user', content: agentMsg });

}

ws.close();
// Force exit after a short grace period in case of lingering intervals/callbacks
setTimeout(() => process.exit(0), 1000);
}

main().catch(err => {
  console.error("Test agent encountered an error:", err);
  process.exit(1);
});
