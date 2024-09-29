import { AgentPromptTemplate } from './AgentPromptTemplate';
import { SessionContext } from './SessionContext'; 

export class PromptManager {
  private goal: string = "";

  constructor(private promptTemplate: AgentPromptTemplate) {
    this.promptTemplate = promptTemplate;
  }

  public setGoal(goal: string): void {
    this.goal = goal;
  }

  public getSystemPrompt(): string {
    return this.renderPrompt(null, this.promptTemplate.getSystemPrompt(), { goal: this.goal });
  }

  public getAssistantPrompt(): string {
    return this.renderPrompt(null, this.promptTemplate.getAssistantPrompt(), {});
  }

  public getMessageClassificationPrompt(message: string): string {
    console.log("Message classification prompt===>", this.promptTemplate.getMessageClassificationPrompt(message));
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
      console.log("Replacing placeholder:", placeholder, "with value:", variables[key]);
      prompt = prompt.replace(new RegExp(placeholder, 'g'), variables[key]);
    });

    if (sessionContext) {
      const history = sessionContext.getHistory().join('\n');
      //console.log("History===>", history);
      prompt = history + prompt;
    } 

    return prompt || "";
  }

}
