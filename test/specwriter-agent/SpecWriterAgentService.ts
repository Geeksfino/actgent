import { ClassificationTypeConfig } from '../../src/IClassifier';
import { InferClassificationUnion } from '../../src/TypeInference';
import { SpecWriterAgent } from './SpecWriterAgent';
import { AgentServiceConfigurator } from '../../src/AgentServiceConfigurator';

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/specwriter-agent");

const specWriterAgent = new SpecWriterAgent(svcConfig);
specWriterAgent.registerStreamCallback((delta: string) => {
  console.log(delta);
});
specWriterAgent.run();

const session = await specWriterAgent.createSession("owner", 'Create a stock chart mini-program');

// Handler function to print out data received
const handler = (data: InferClassificationUnion<readonly ClassificationTypeConfig[]>): void => {
    console.log("Received event from session:", data);
};

// Pass the handler to the session
session.onEvent(handler);
