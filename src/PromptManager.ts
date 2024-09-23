import { Prompt } from './interfaces';

export class PromptManager {
  private prompts: Map<string, Prompt> = new Map();

  addPrompt(prompt: Prompt): void {
    this.prompts.set(prompt.name, prompt);
  }

  getPrompt(name: string): Prompt | undefined {
    return this.prompts.get(name);
  }

  renderPrompt(name: string, variables: { [key: string]: string }): string {
    const prompt = this.getPrompt(name);
    if (!prompt) {
      throw new Error(`Prompt "${name}" not found`);
    }
    let renderedPrompt = prompt.template;
    for (const [key, value] of Object.entries(variables)) {
      renderedPrompt = renderedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return renderedPrompt;
  }
}