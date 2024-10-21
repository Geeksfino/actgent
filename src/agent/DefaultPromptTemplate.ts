import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";

export class DefaultPromptTemplate<
  T extends ReadonlyArray<ClassificationTypeConfig>,
> implements IAgentPromptTemplate
{
  private classificationTypes: T;

  constructor(classificationTypes: T) {
    //console.log('DefaultPromptTemplate constructor');
    this.classificationTypes = classificationTypes;
  }

  getSystemPrompt(): string {
    return `
      You are designated as: {role} with the goal of: {goal}. 
      Your capabilities are: {capabilities}.
      Your objective is to align every action with this overarching mission while processing specific tasks efficiently and effectively.
      Keep this goal in mind for every task you undertake. 

      You need to assist in analyzing and understanding input messages with flexibility and nuance. Follow these guidelines:
	1.	Context Awareness: Always consider the broader context and goal of the conversation. Users may provide examples or use analogies that seem unrelated on the surface 
      but are intended to illustrate a larger idea or requirement. Focus on interpreting the core concept or intent behind the user’s input.
	2.	Clarify Before Judging: If the task or example provided by the user appears unclear or seems unrelated, do not dismiss it outright. Instead, 
      ask for clarification or additional information to better understand how it might relate to the overarching goal or requirement.
	3.	Seek Underlying Meaning: Focus on the user’s intent and try to extract the underlying purpose or idea. Even if the input appears off-topic, 
      it may still contain valuable insights that contribute to the task at hand.
	4.	Prioritize Relevance to the Goal: Evaluate the relevance of examples, analogies, or scenarios based on how they contribute to the user’s broader objective. 
      Your role is to bridge the gap between user input and the main task, ensuring that even abstract or creative inputs are considered in context.
	5.	Promote Collaborative Refinement: Rather than strictly classifying tasks or examples as right or wrong, aim to collaborate with the user in refining their ideas. 
      This involves engaging with the user’s examples in a constructive manner, helping them to express their requirements more clearly and aligning those with the task’s goal.
	6.	Adaptability: Be flexible in your interpretation and approach. Users may express ideas in unconventional ways—adapt your analysis to extract relevant details, 
      always prioritizing understanding over rigid classification.
	7.	After trying these principles and you still cannot understand the intent of an input message or you carefully review that it is not aligned with your goal or capabilities, 
      you should ask the user for clarification.

      Additional Important Instructions:
      {instructions}
    `;
  }

  getAssistantPrompt(): string {
    const typesDescription = this.classificationTypes
      .map((type) => `- ${type.name}: ${type.description}`)
      .join("\n");

    const jsonFormats = this.classificationTypes
      .map(
        (type) =>
          `${type.name}:\n\`\`\`json\n${JSON.stringify({ messageType: type.name, ...type.schema }, null, 2)}\n\`\`\``
      )
      .join("\n\n");

    const prompt = `
  # Message Analysis Prompt
  
  Analyze the following message comprehensively. Categorize the message into one of these types:
  ${typesDescription}
  
  You shall first try to understand the user's intent to be sure that the user is asking something relevant to your role, goal and capabilities.
  If the user's intent is not clear or not relevant to your role, goal and capabilities, you shall ask for clarification.
  
  Based on the message type, provide a response in one of the following JSON formats:
  
  ${jsonFormats}
  
  Ensure that your response strictly adheres to these formats based on the identified message type. Provide concise yet comprehensive information 
  within the constraints of each format.
  `;

    return prompt.trim();
  }

  getMessageClassificationPrompt(message: string): string {
    const typesDescription = this.classificationTypes
      .map((type) => `- ${type.name}: ${type.description}`)
      .join("\n");

    const jsonFormats = this.classificationTypes
      .map(
        (type) =>
          `${type.name}:\n\`\`\`json\n${JSON.stringify({ messageType: type.name, ...type.schema }, null, 2)}\n\`\`\``
      )
      .join("\n\n");

    const prompt = `
    # Message Analysis Prompt
    
    Analyze the following message comprehensively. Categorize the message into one of these types:
    ${typesDescription}
    
    You shall first try to understand the user's intent to be sure that the user is asking something relevant to your role, goal and capabilities.
    If the user's intent is not clear or not relevant to your role, goal and capabilities, you shall ask for clarification.
    
    Based on the message type, provide a response in one of the following JSON formats:
    
    ${jsonFormats}
    
    Ensure that your response strictly adheres to these formats based on the identified message type. Provide concise yet comprehensive information within the constraints of each format.
   
    Now, analyze the following message:
    
    ${message}
    `;

    return prompt.trim();
  }

  getMetaPrompt(): string {
    const meta_prompt = `
Given a task description or existing prompt, produce a detailed system prompt to guide a language model in completing the task effectively.

# Guidelines

- Understand the Task: Grasp the main objective, goals, requirements, constraints, and expected output.
- Minimal Changes: If an existing prompt is provided, improve it only if it's simple. For complex prompts, enhance clarity and add missing elements without altering the original structure.
- Reasoning Before Conclusions**: Encourage reasoning steps before any conclusions are reached. ATTENTION! If the user provides examples where the reasoning happens afterward, REVERSE the order! NEVER START EXAMPLES WITH CONCLUSIONS!
    - Reasoning Order: Call out reasoning portions of the prompt and conclusion parts (specific fields by name). For each, determine the ORDER in which this is done, and whether it needs to be reversed.
    - Conclusion, classifications, or results should ALWAYS appear last.
- Examples: Include high-quality examples if helpful, using placeholders [in brackets] for complex elements.
   - What kinds of examples may need to be included, how many, and whether they are complex enough to benefit from placeholders.
- Clarity and Conciseness: Use clear, specific language. Avoid unnecessary instructions or bland statements.
- Formatting: Use markdown features for readability. DO NOT USE \`\`\` CODE BLOCKS UNLESS SPECIFICALLY REQUESTED.
- Preserve User Content: If the input task or prompt includes extensive guidelines or examples, preserve them entirely, or as closely as possible. If they are vague, consider breaking down into sub-steps. Keep any details, guidelines, examples, variables, or placeholders provided by the user.
- Constants: DO include constants in the prompt, as they are not susceptible to prompt injection. Such as guides, rubrics, and examples.
- Output Format: Explicitly the most appropriate output format, in detail. This should include length and syntax (e.g. short sentence, paragraph, JSON, etc.)
    - For tasks outputting well-defined or structured data (classification, JSON, etc.) bias toward outputting a JSON.
    - JSON should never be wrapped in code blocks (\`\`\`) unless explicitly requested.

The final prompt you output should adhere to the following structure below. Do not include any additional commentary, only output the completed system prompt. SPECIFICALLY, do not include any additional messages at the start or end of the prompt. (e.g. no "---")

[Concise instruction describing the task - this should be the first line in the prompt, no section header]

[Additional details as needed.]

[Optional sections with headings or bullet points for detailed steps.]

# Steps [optional]

[optional: a detailed breakdown of the steps necessary to accomplish the task]

# Output Format

[Specifically call out how the output should be formatted, be it response length, structure e.g. JSON, markdown, etc]

# Examples [optional]

[Optional: 1-3 well-defined examples with placeholders if necessary. Clearly mark where examples start and end, and what the input and output are. User placeholders as necessary.]
[If the examples are shorter than what a realistic example is expected to be, make a reference with () explaining how real examples should be longer / shorter / different. AND USE PLACEHOLDERS! ]

# Notes [optional]

[optional: edge cases, details, and an area to call or repeat out specific important considerations]

`;
    return meta_prompt;
  }

  getClassificationTypes(): T {
    return this.classificationTypes;
  }
}
