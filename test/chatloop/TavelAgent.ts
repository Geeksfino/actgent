import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator } from "@finogeeks/actgent/agent";
import { KnowledgeBuilder, DefaultSchemaBuilder } from "@finogeeks/actgent/helpers";
import path from 'path';

// Load the agent configuration from a YAML file
const configPath = path.join(__dirname, 'config.md');
const config = KnowledgeBuilder.loadAgentConfigFromMarkdown(configPath);

const schemaBuilder = new DefaultSchemaBuilder();
const schemaTypes = schemaBuilder.getClassificationTypes();

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/chatloop");
const agentBuilder = new AgentBuilder(config, svcConfig);
const TravelAgent = agentBuilder.build(
  "TravelAgent",
  schemaTypes
);

export { TravelAgent };
