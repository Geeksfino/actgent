import { IAgentPromptTemplate } from './IPromptTemplate';
import { SessionContext } from './SessionContext'; 

export class PromptManager {
  private role: string = "";
  private goal: string = "";
  private capabilities: string = "";
  private instructions: Map<string, string> | undefined;
  
  constructor(private promptTemplate: IAgentPromptTemplate) {
    this.promptTemplate = promptTemplate;
  }

  public setGoal(goal: string): void {
    this.goal = goal;
  }

  public setRole(role: string): void {
    this.role = role;
  }

  public setCapabilities(capabilities: string): void {
    this.capabilities = capabilities;
  }

  public setInstructions(instructions: Map<string, string>): void {
    this.instructions = instructions;
  }

  public getSystemPrompt(): string {
    const instructions = this.instructions ? Array.from(this.instructions.values()).join('\n') : '';
    return this.renderPrompt(null, this.promptTemplate.getSystemPrompt(), { goal: this.goal, capabilities: this.capabilities, role: this.role, instructions: instructions });
  }

  public getAssistantPrompt(): string {
    return this.renderPrompt(null, this.promptTemplate.getAssistantPrompt(), {});
  }

  public getMessageClassificationPrompt(message: string): string {
    //console.log("Message classification prompt===>", this.promptTemplate.getMessageClassificationPrompt(message));
    return this.renderPrompt(null, this.promptTemplate.getMessageClassificationPrompt(message), {});
  }

  // Render a prompt with dynamic data
  public renderPrompt(sessionContext: SessionContext | null, template: string, variables: { [key: string]: string }): string {

    let prompt = template;

    if (!this.promptTemplate) {
      throw new Error(`Prompt template for agent not set`);
    }

    // Replace placeholders with actual values
    Object.keys(variables).forEach((key) => {
      const placeholder = `{${key}}`;
      //console.log("Replacing placeholder:", placeholder, "with value:", variables[key]);
      prompt = prompt.replace(new RegExp(placeholder, 'g'), variables[key]);
    });

    if (sessionContext) {
      const messages = sessionContext.getMessages().map(msg => msg.payload.input).join('\n');
      console.log(`PromptManager Messages===> [ ${messages} ]`);
      prompt = messages + prompt;
    } 

    return prompt || "";
  }

}
