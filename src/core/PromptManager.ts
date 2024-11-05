import { IPromptContext } from './IPromptContext';
import { IAgentPromptTemplate } from './IPromptTemplate';
import { Memory } from './Memory';
import { SessionContext } from './SessionContext'; 
import { Instruction } from './configs';
export class PromptManager {
  private role: string = "";
  private goal: string = "";
  private capabilities: string = "";
  private instructions: Instruction[] = [];
  
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

  public setInstructions(instructions: Instruction[]): void {
    this.instructions = instructions;
  }

  public getSystemPrompt(): string {
    //const instructions = this.instructions ? Array.from(this.instructions.values()).join('\n') : '';
    // return this.renderPrompt(null, this.promptTemplate.getSystemPrompt(), { goal: this.goal, capabilities: this.capabilities, role: this.role, instructions: instructions });
    return this.renderPrompt(null, this.promptTemplate.getSystemPrompt(), { goal: this.goal, capabilities: this.capabilities, role: this.role });
  }

  public getAssistantPrompt(sessionContext: SessionContext, memory: Memory): string {
    return this.renderPrompt(sessionContext, this.promptTemplate.getAssistantPrompt(sessionContext, memory), {});
  }

  public getUserPrompt(sessionContext: SessionContext | null, message: string, variables: { [key: string]: string }): string {
    return this.renderPrompt(sessionContext, message, variables);
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

    // if (sessionContext) {
    //   const messages = sessionContext.getMessages().map(msg => msg.payload.input).join('\n');
    //   //console.log(`PromptManager Messages===> [ ${messages} ]`);
    //   prompt = messages + prompt;
    // } 

    return prompt || "";
  }

  public debugPrompt(sessionContext: SessionContext, memory: Memory, message: string, variables: { [key: string]: string }): Object {
    const systemPrompt = this.getSystemPrompt();
    const assistantPrompt = this.getAssistantPrompt(sessionContext, memory);

    let resolvedPrompt = {
      "system": systemPrompt,
      "assistant": assistantPrompt,
      "user": this.getUserPrompt(sessionContext, message, variables)
    }
    

    return resolvedPrompt;
  }
}
