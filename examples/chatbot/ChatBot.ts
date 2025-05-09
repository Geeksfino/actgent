import { AgentBuilder } from "@finogeek/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator } from "@finogeek/actgent/helpers";
import { MultiLevelClassifier, MultiLevelPromptTemplate } from "@finogeek/actgent/agent";
import { BarePromptTemplate, BareClassifier } from "@finogeek/actgent/agent";
import { createRuntime } from "@finogeek/actgent/runtime";
import { FileConversationHandler } from "./FileConversationHandler";

const runtime = createRuntime();

// Load the agent configuration from a markdown file
const configPath = runtime.path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration(__dirname);

const ChatBot = new AgentBuilder(agentConfig, svcConfig)
    .create(BareClassifier, BarePromptTemplate);

// Register the file conversation handler
const conversationLogPath = process.env.CONVERSATION_LOG_PATH || "/tmp/chatbot-conversations.log";
ChatBot.registerConversationDataHandler(new FileConversationHandler(conversationLogPath));
console.log(`Registered file conversation handler. Logs will be saved to: ${conversationLogPath}`);


export { ChatBot };