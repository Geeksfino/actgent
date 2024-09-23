import { BaseAgent } from './BaseAgent';

export class Goal {
  constructor(
    public name: string,
    public condition: (agent: BaseAgent) => boolean,
    public action: (agent: BaseAgent) => Promise<void>
  ) {}

  async evaluate(agent: BaseAgent): Promise<void> {
    if (this.condition(agent)) {
      await this.action(agent);
    }
  }
}
