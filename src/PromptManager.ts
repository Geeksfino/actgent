import { PromptTemplate } from './interfaces';

export class PromptManager {
  private promptLibrary: { [key: string]: PromptTemplate };

  constructor(promptLibrary: { [key: string]: PromptTemplate }) {
    this.promptLibrary = promptLibrary;
  }

  // Render a prompt with dynamic data
  public renderPrompt(promptId: string, variables: { [key: string]: string }): string {
    const promptTemplate = this.promptLibrary[promptId];
    if (!promptTemplate) {
      throw new Error(`Prompt with id ${promptId} not found`);
    }

    let prompt = promptTemplate.template;

    // Replace placeholders with actual values
    Object.keys(variables).forEach((key) => {
      const placeholder = `{${key}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), variables[key]);
    });

    return prompt;
  }

  // Add or update a prompt
  public addOrUpdatePrompt(id: string, template: string, description: string = ""): void {
    this.promptLibrary[id] = { id, template, description };
  }
}
