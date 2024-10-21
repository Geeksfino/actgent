import { BaseAgent } from '@finogeeks/actgent/agent';
import { AgentCoreConfig, AgentServiceConfig } from '@finogeeks/actgent/core';
import { DefaultPromptTemplate } from '@finogeeks/actgent/agent';
import { DefaultClassifier } from '@finogeeks/actgent/agent';

const specWriterTypes = [
  {
    name: "SPEC_DESIGN",
    description: "Design a software specification for a WeChat mini-program.",
    schema: {
      spec: {
        name: "<APP_NAME>",
        description: "<APP_DESCRIPTION>",
        category: "<APP_CATEGORY>",
        details: "<DETAILS_OF_THE_SPECIFICATION>",
      }
    },
  },
  {
    name: "ERROR",
    description: "An error occurred during specification design.",
    schema: {
      message: "<ERROR_MESSAGE>",
    },
  },
] as const;

type SpecWriterSchemaTypes = typeof specWriterTypes;
const coreConfig: AgentCoreConfig = {
  name: "SpecWriterAgent",
  role: "Software Product Manager",
  goal: 
    `As a spec writer, your task is to creatively design a software specification for a WeChat mini-program based on the following requirement description:

    You need to generate a detailed and innovative software specification that not only meets the core functional requirements but also 
    immediately impresses users, even as a prototype. Your design should emphasize user engagement, delightful interactions, and modern user 
    interface (UI) principles.

    When being given a description, you need to 

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

    8. **Data specification:**
       - Specify the data that the mini-program will use, including the data source, format, and any necessary transformations or calculations.
       - Include some sample data to illustrate the data structure so that developers can design corresponding data model, backend services, and mock objects.

    Your design should focus on user experience and functionality, ensuring that each page is well-described and meets the needs of the intended users.

    The output shall be in the following JSON format:
    ${JSON.stringify(specWriterTypes[0].schema)}

    Important Notice: when the input description is written in a certain language, the language of the output must be the same.
      For example, if the input description is in Chinese, the <PAGE_DESCRIPTION> of pages in output specification must be in Chinese;
      if the input description is in English, the <PAGE_DESCRIPTION> of pages in output specification must be in English. Note that
      <PAGE_NAME> must be always in English regardless of the language of the input description.
    `,
  capabilities: 'Design detailed and innovative software specifications',
};

export class SpecWriterAgent extends BaseAgent<SpecWriterSchemaTypes, DefaultClassifier<SpecWriterSchemaTypes>, DefaultPromptTemplate<SpecWriterSchemaTypes>> {
  constructor(svc_config: AgentServiceConfig) {
    super(coreConfig, svc_config, specWriterTypes);
  }

  protected useClassifierClass(): new () => DefaultClassifier<SpecWriterSchemaTypes> {
    return class extends DefaultClassifier<SpecWriterSchemaTypes> {
      constructor() {
        super(specWriterTypes);
      }
    };
  }

  protected usePromptTemplateClass(): new (classificationTypes: SpecWriterSchemaTypes) => DefaultPromptTemplate<SpecWriterSchemaTypes> {
    return class extends DefaultPromptTemplate<SpecWriterSchemaTypes> {
      constructor(classificationTypes: SpecWriterSchemaTypes) {
        super(classificationTypes);
      }
    };
  }
}
