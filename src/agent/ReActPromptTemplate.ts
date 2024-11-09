import { IAgentPromptTemplate } from "../core/IPromptTemplate";
import { ClassificationTypeConfig } from "../core/IClassifier";
import { ReActMode, TaskContext, ReActModeStrategy, ReActModeSelector } from "./ReActModeStrategy";
import { KeywordBasedStrategy } from "./ReActModeStrategy";
import { logger, trace } from "../core/Logger";
import { IPromptMode, IPromptStrategy } from "../core/IPromptContext";
import { InferContextBuilder } from "../core/InferContextBuilder";
import { IPromptContext } from "./../core/IPromptContext";
import { Memory } from "../core/Memory";
import { InferClassificationUnion, PromptManager, SessionContext } from "../core";

interface SchemaFormatting {
  types: string;    // Types description
  schemas: string;  // JSON formats
}

export class ReActPromptTemplate<
  T extends ReadonlyArray<ClassificationTypeConfig>,
> implements IAgentPromptTemplate
{
  protected classificationTypes: T;
  protected strategy: IPromptStrategy;
  private context: IPromptContext | null = null;

  constructor(
    classificationTypes: T, 
    strategy: IPromptStrategy = new KeywordBasedStrategy()
  ) {
    this.classificationTypes = classificationTypes;
    this.strategy = strategy;
  }

  setStrategy(strategy: IPromptStrategy): void {
    this.strategy = strategy;
  }

  @trace()
  evaluateMode(memory: Memory, sessionContext: SessionContext): IPromptMode {
    let mode: IPromptMode;
    
    const infer_context = new InferContextBuilder(memory, sessionContext)
      .withRecentMessages()
      .build();
    //logger.debug(`Infer context: ${JSON.stringify(infer_context, null, 2)}`);
    
    if (infer_context) {
      mode = this.strategy.evaluateStrategyMode(infer_context);
    } else {
      mode = this.strategy.getCurrentMode();
    }

    logger.info(`Mode used for prompt: ${mode.value}`);
    return mode;
  }

  setContext(context: IPromptContext): void {
    this.context = context;
  }

  getAssistantPrompt(sessionContext: SessionContext, memory: Memory): string {
    const mode = this.evaluateMode(memory, sessionContext);
    const { types, schemas } = this.getFormattedSchemas();

    const instruction = mode.value === 'direct' ? 
      this.getDirectInstructions(types, schemas) : 
      this.getReActInstructions(types, schemas);

    return instruction.trim();
  }

  private getDirectInstructions(types: string, schemas: string): string {
    return `
Request Analysis Protocol:

1. Intent Assessment
   - Extract core request objective
   - Validate alignment with role and capabilities
   - Identify required information gaps
   - Request clarification if intent is unclear

2. Response Classification
   Choose the appropriate path:
   A. DIRECT_RESPONSE - Select from available types:
      ${types}
   B. TOOL_INVOCATION - If external data/actions needed

3. Response Structure
Provide complete JSON response:
{
    "question_nature": "<SIMPLE for straightforward requests, COMPLEX for multi-step analysis>",
    "context": "<Understanding and approach summary>",
    "primary_action": {
        "response_purpose": "<TOOL_INVOCATION or DIRECT_RESPONSE>",
        "response_content": ${schemas}
    },
    "additional_info": "<Supporting details or next steps>"
}

CRITICAL RESPONSE FORMAT REQUIREMENTS:
1. You MUST structure your response as a valid JSON object
2. The JSON MUST contain ALL required fields shown in the template below
3. NEVER output bare content - ALL responses MUST be wrapped in the proper JSON structure
4. The "primary_action" field is MANDATORY and MUST contain both "response_purpose" and "response_content"
5. DO NOT use placeholder text like "<...>" in your actual response
6. If you need to return content, it MUST go inside "response_content", NEVER directly in the response
    `.trim();
  }

  private getReActInstructions(types: string, schemas: string): string {
    return `
Reasoning and Action (ReAct) Analysis Protocol:

1. Thought Process Documentation
   - Document request comprehension
   - Outline proposed approach
   - List key considerations
   - Identify potential challenges

2. Action Strategy
   - Break down into specific steps
   - Document reasoning per step
   - Identify required tools/resources
   - Plan validation checkpoints

3. Response Planning
   Final response will be categorized as:
   ${types}

4. Response Format
{
  "question_nature": "<SIMPLE or COMPLEX>",
  "context": {
    "understanding": "<Request interpretation and key points>",
    "approach": "<Strategy and methodology>",
    "considerations": ["<Critical factor 1>", "<Critical factor 2>"]
  },
  "primary_action": {
    "response_purpose": "<TOOL_INVOCATION or DIRECT_RESPONSE>",
    "response_content": ${schemas}
  },
  "additional_info": {
    "results": "<Expected outcomes and deliverables>",
    "analysis": "<Classification rationale>",
    "next_steps": ["<Follow-up action 1>", "<Follow-up action 2>"]
  }
}

Execution Guidelines:
- Document each reasoning step
- Validate tool availability before use
- Ensure complete context documentation
- Plan for potential contingencies

CRITICAL RESPONSE FORMAT REQUIREMENTS:
1. You MUST structure your response as a valid JSON object
2. The JSON MUST contain ALL required fields shown in the template below
3. NEVER output bare content - ALL responses MUST be wrapped in the proper JSON structure
4. The "primary_action" field is MANDATORY and MUST contain both "response_purpose" and "response_content"
5. DO NOT use placeholder text like "<...>" in your actual response
6. If you need to return content, it MUST go inside "response_content", NEVER directly in the response
    `.trim();
  }

  getSystemPrompt(sessionContext: SessionContext, memory: Memory): string {
    const mode = this.evaluateMode(memory, sessionContext);
    
    const base_prompt = `
Role Definition:
You are designated as: {role}
Goal: {goal}
Capabilities: {capabilities}

Core Responsibilities:
1. Goal Alignment
   - Every action must support the defined goal
   - Stay within designated capabilities
   - Maintain role focus

2. Request Processing Framework
   A. Context Analysis
      - Extract core concepts and requirements
      - Consider conversation history
      - Validate goal alignment

   B. Clarity Protocol
      - Request clarification for ambiguous inputs
      - Explain capability limitations when relevant
      - Verify understanding for complex requests

   C. Response Structure
      Question Classification:
      - SIMPLE: Direct, straightforward requests
      - COMPLEX: Multi-step analysis requirements

      Response Types:
      - DIRECT_RESPONSE: Immediate answer using available information
      - TOOL_INVOCATION: Requires external data/actions

3. Tool Integration
   - Verify tool availability before requesting information
   - Ensure proper input formatting
   - Validate tool outputs before integration
    `.trim();

    const react_prompt = `
Extended Analysis Protocol:
1. Reasoning Documentation
   - Capture request understanding
   - Document information requirements
   - Detail approach strategy
   - List potential challenges

2. Execution Planning
   - Define specific action steps
   - Map step dependencies
   - Include validation points
   - Document contingencies

3. Results Management
   - Record action outcomes
   - Evaluate need for adjustments
   - Plan subsequent steps
   - Validate goal alignment
    `.trim();

    return mode.value === 'react' ? 
      `${base_prompt}\n\n${react_prompt}` : 
      base_prompt;
  }



  getMessageClassificationPrompt(message: string): string {
    const { types, schemas } = this.getFormattedSchemas();

    return `
    # Message Analysis Prompt
    
    Analyze the following message comprehensively. Categorize the message into one of these types:
    ${types}
    
    You shall first try to understand the user's intent to be sure that the user is asking something relevant to your role, goal and capabilities.
    If the user's intent is not clear or not relevant to your role, goal and capabilities, you shall ask for clarification.
    
    Based on the message type, provide a response in one of the following JSON formats:
    ${schemas}
      
    Ensure that your response strictly adheres to these formats based on the identified message type. Provide concise yet comprehensive information within the constraints of each format.
   
    Now, analyze the following message and respond:
    
    ${message}
    `.trim();
  }

  getMetaPrompt(): string {
    const meta_prompt = `
As a {role}, with the goal of: {goal}, please judge if the given task description or existing prompt is clear and complete.
If it is clear and complete, please output it as is. If it has room for improvement, please produce a detailed system prompt 
to guide a language model in completing the task effectively.

# Guidelines

- Understand the Task: Grasp the main objective, goals, requirements, constraints, and expected output.
- Minimal Changes: If an existing prompt is provided, improve it only if it's simple. For complex prompts, enhance clarity and add missing elements without altering the original structure.
- Reasoning Before Conclusions**: Encourage reasoning steps before any conclusions are reached. ATTENTION! If the user provides examples where the reasoning happens afterward, REVERSE the order! NEVER START EXAMPLES WITH CONCLUSIONS!
    - Reasoning Order: Call out reasoning portions of the prompt and conclusion parts (specific fields by name). For each, determine the ORDER in which this is done, and whether it needs to be reversed.
    - Conclusion, classifications, or results should ALWAYS appear last.
- Scope of improvement: Focus solely on aspects that are directly relevant to the defined role, goal and capabilities. 
  For prompts lacking sufficient detail or clarity, improve them by suggesting more refined goals, user stories, or requirements within the 
  role's domain, without extending beyond the role's expertise. If the provided input is too simplistic (e.g., “create a snake game WeChat mini-program”), enhance it by proposing relevant 
  product details (e.g., target audience, features, and user experience) while avoiding technical decisions (e.g., project structure, programming languages).
	When expanding or enhancing, keep the scope tightly aligned with the role's responsibilities. Do not infer unrelated areas such as technical solutions, design aesthetics, 
  or performance optimizations unless explicitly requested as part of the role's purview.
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
    `.trim();
    return meta_prompt;
  }

  private getFormattedSchemas(): SchemaFormatting {
    const types = this.classificationTypes
      .map((type) => `- ${type.name}: ${type.description}`)
      .join("\n");

    const schemas = this.classificationTypes
      .map(
        (type) =>
          `${type.name}:\n\`\`\`json\n${JSON.stringify({ messageType: type.name, ...type.schema }, null, 2)}\n\`\`\`` + (type !== this.classificationTypes[this.classificationTypes.length - 1] ? " or " : "")
      )
      .join("\n\n");

    return { types, schemas };
  }
  extractFromLLMResponse(response: string): string {
    try {
      const parsed = JSON.parse(response);

      if (!parsed?.primary_action?.response_content) {
        logger.error(`Invalid response format: ${JSON.stringify(parsed, null, 2)}`);
        throw new Error("Invalid response format: primary_action.response_content is missing");
      }
      return JSON.stringify(parsed.primary_action.response_content);
    } catch (error) {
      const err = error as Error; // Type assertion
      logger.error(`Failed to parse LLM response: ${response}`);
      
      // Return a default value or an error message
      return JSON.stringify({ error: "Failed to parse LLM response", details: err.message });
    }
  } 

  getClassificationTypes(): T {
    return this.classificationTypes;
  }

  public debugPrompt(promptManager: PromptManager, type: "system" | "assistant", sessionContext: SessionContext, memory: Memory): string {
    const prompt = type === "system" ? promptManager.getSystemPrompt(sessionContext, memory) : promptManager.getAssistantPrompt(sessionContext, memory);
    return this.parsePrompt(prompt);
  }

  /**
   * Parse the prompt to replace escaped newline and tab characters with actual newline and tabs
   * and to parse JSON blocks inside ```json ... ```. This is specific to this prompt template.
   * Useful for debugging and testing.
   * @param input 
   * @returns 
   */
  private parsePrompt(input: string): string {
    // Replace escaped newline and tab characters with actual newline and tabs
    let output = input.replace(/\\n|\n/g, '\n').replace(/\\"/g, '"');

    // Regular expression to detect and extract JSON blocks inside ```json ... ```
    const jsonRegex = /```json\n([\s\S]*?)\n```/g;

    // Callback function to process each JSON block
    output = output.replace(jsonRegex, (match, jsonContent) => {
        try {
            // Parse and stringify JSON content for clean formatting
            const parsedJson = JSON.parse(jsonContent);
            return JSON.stringify(parsedJson, null, 2); // Indent JSON by 2 spaces
        } catch (e) {
            console.warn("Invalid JSON format detected. Returning unmodified.");
            return match; // Return original match if JSON parsing fails
        }
    });

    return output;
  }
}
