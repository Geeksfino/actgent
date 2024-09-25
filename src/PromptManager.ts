import { PromptTemplate } from './interfaces';
import { TaskContext } from './TaskContext';

export class PromptManager {
  private promptLibrary: { [key: string]: string };
  private goal: string = "";

  constructor(promptLibrary: { [key: string]: string }) {
    this.promptLibrary = promptLibrary;
  }

  public setGoal(goal: string): void {
    this.goal = goal;
  }

  public getSystemPrompt(): string {
    return this.renderPrompt(null, "system_goal_prompt", { goal: this.goal });
  }

  public getAssistantPrompt(): string {
    return this.renderPrompt(null, "assistant_prompt", {});
  }

  // Render a prompt with dynamic data
  public renderPrompt(taskContext: TaskContext | null, promptId: string, variables: { [key: string]: string }): string {
    let promptTemplate = this.promptLibrary[promptId];
    //console.log("Prompt template===>", promptTemplate);
    if (!promptTemplate) {
      throw new Error(`Prompt with id ${promptId} not found`);
    }

    // Replace placeholders with actual values
    Object.keys(variables).forEach((key) => {
      const placeholder = `{${key}}`;
      //console.log("Replacing placeholder:", placeholder, "with value:", variables[key]);
      promptTemplate = promptTemplate.replace(new RegExp(placeholder, 'g'), variables[key]);
    });

    if (taskContext) {
      const history = taskContext.getHistory().join('\n');
      //console.log("History===>", history);
      promptTemplate = history + promptTemplate ;
    } 

    //console.log("Final prompt ===>", promptTemplate);
    return promptTemplate;
  }

}
