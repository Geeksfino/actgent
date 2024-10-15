import {
  ClassificationTypeConfig,
  AgentBuilder,
  AgentServiceConfigurator,
  AgentCoreConfig,
} from "@finogeeks/actgent";
import { DefaultSchemaBuilder } from "@finogeeks/actgent";

const schemaBuilder = new DefaultSchemaBuilder();

const productManagerTemplate = {
  productOverview: "<PRODUCT_OVERVIEW>",
  targetAudience: "<TARGET_AUDIENCE_DESCRIPTION>",
  features: [
    {
      name: "<FEATURE_NAME>",
      description: "<FEATURE_DESCRIPTION>",
      userStories: ["<USER_STORY_1>", "<USER_STORY_2>"],
      acceptanceCriteria: ["<CRITERION_1>", "<CRITERION_2>"],
    },
  ],
  nonFunctionalRequirements: ["<REQUIREMENT_1>", "<REQUIREMENT_2>"],
  constraints: ["<CONSTRAINT_1>", "<CONSTRAINT_2>"],
};

schemaBuilder.setFormattedOutputForCompletedTask(`
  ${JSON.stringify(productManagerTemplate)}
`);

const productManagerCoreConfig: AgentCoreConfig = {
  name: "ProductManagerAgent",
  role: "Product Manager",
  goal: `As the Product Manager, analyze the project requirements and create a comprehensive functional specification that 
           can be used to develop a WeChat mini-program. Include detailed feature descriptions, user stories, and acceptance criteria.`,
  capabilities:
    "Requirements analysis, feature definition, user story creation, market analysis, stakeholder communication",
};

const svcConfig =
  AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(productManagerCoreConfig, svcConfig);
const productManagerAgent = agentBuilder.build(
  "ProductManagerAgent",
  schemaBuilder.getClassificationTypes()
);
productManagerAgent.addInstruction(
  "Product Plan Guidelines",
  `Your task is to create a comprehensive product design plan based on the following user requirements:
  
    Your product design plan should include the following components:
  
    1. **Product Overview:**
       - Name
       - Description
       - Category
  
    2. **Features:**
       - List and describe each feature in detail.
  
    3. **User Stories:**
       - Define user stories that outline how different types of users will interact with the product.
  
    4. **Milestones:**
       - Outline key milestones for the product development lifecycle.
  
    5. **Resource Allocation:**
       - Team Members: Specify roles and responsibilities.
       - Timeline: Provide a timeline for each milestone.
  
    6. **Risk Assessment:**
       - Identify potential risks and propose mitigation strategies.
  
    Ensure that the product design plan is thorough, innovative, and aligns with the user's requirements. Pay special attention to user engagement, 
    scalability, and future-proofing the product. The language of the output should match the language of the input description.  
`
);

export { productManagerAgent };
