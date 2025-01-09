import { AgentBuilder, AgentServiceConfigurator, AgentCoreConfig } from '@finogeeks/actgent';
import { DefaultSchemaBuilder } from '@finogeeks/actgent';

const schemaBuilder = new DefaultSchemaBuilder();

const specTemplate = {
    name: "<APP_NAME>",
    description: "<APP_DESCRIPTION>",
    category: "<APP_CATEGORY>",
    pages: [
      {
        name: "<PAGE_NAME>",
        description: "<PAGE_DESCRIPTION>",
        uiComponents: ["<COMPONENT_1_DESCRIPTION>", "<COMPONENT_2_DESCRIPTION>"],
        data: "<DATA_DESCRIPTION>",
        layout: "<LAYOUT_DESCRIPTION>"
      }
    ],
    homePage: "<HOMEPAGE_NAME>",
    userEngagement: "<ENGAGEMENT_FEATURES_DESCRIPTION>",
    innovativeInteractions: "<INTERACTION_DETAILS>",
    scalability: "<SCALABILITY_FEATURES>",
    internationalization: "<LANGUAGE_SUPPORT>"
}

schemaBuilder.setFormattedOutputForCompletedTask(`
  ${JSON.stringify(specTemplate)}
`);

const specWriterCoreConfig: AgentCoreConfig = {
    name: "SpecWriterAgent",
    role: "Software Functional Specification Writer",
    goal: 
      `Your task is to creatively design a software specification for a WeChat mini-program based on the following requirement description:
  
      You need to generate a detailed and innovative software specification that not only meets the core functional requirements but also 
      immediately impresses users, even as a prototype. Your design should emphasize user engagement, delightful interactions, and modern user 
      interface (UI) principles.
  
      The specification should include the following:
  
      1. **App Overview:**
         - Name
         - Description
         - Category
  
      2. **Pages:**
         - For each page, provide:
           - Name (unique, alphanumeric, underscores, and slashes only)
           - Detailed Description (including purpose, target audience, and user flow)
           - UI components (list all visual elements and how they interact)
           - Layout (describe how components are arranged to enhance usability and appeal)
           - Note that <PAGE_NAME> must be (1) unique within the mini-program, (2) use alphanumeric characters, underscores (_), or forward slashes (/)
         and (3) not contain spaces, special characters, or symbols like @, #, -, etc.
  
      3. **Homepage:**
         - Designate one of the pages as the homepage, an entry point of the entire mini-program.
  
      4. **User Engagement:**
         - Identify moments in the mini-program that create delight, surprise, or convenience for users.
         - Suggest personalized features, such as dynamic content based on user preferences or past interactions.
  
      5. **Innovative Interactions:**
         - Include modern touch gestures, animations, or interactive components that stand out.
         - For example, use micro-interactions, intuitive navigation, or real-time updates to make the experience feel seamless and modern.
  
      6. **Scalability & Future-proofing:**
         - Suggest ways the app can scale or introduce new features without disrupting user experience.
         - Consider integrations with external APIs or cloud services for more dynamic, real-time features.
  
      7. **Internationalization (i18n):**
         - Ensure the design is easily adaptable for different languages and regions.
         - Specify if certain features need to be localized.
  
      Your design should focus on user experience and functionality, ensuring that each page is well-described and meets the needs of the intended users.
  
      Important Notice: when the input description is written in a certain language, the language of the output must be the same.
        For example, if the input description is in Chinese, the <PAGE_DESCRIPTION> of pages in output specification must be in Chinese;
        if the input description is in English, the <PAGE_DESCRIPTION> of pages in output specification must be in English. Note that
        <PAGE_NAME> must be always in English regardless of the language of the input description.
      `,
    capabilities: 'Design detailed and innovative software specifications',
}

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
const agentBuilder = new AgentBuilder(specWriterCoreConfig, svcConfig);
export const specWriterAgent = agentBuilder.build("SpecWriterAgent", schemaBuilder.getClassificationTypes());
