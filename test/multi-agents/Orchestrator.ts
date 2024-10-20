import { TaskConfig } from "./TaskConfig";

export class Orchestrator {
    private config: TaskConfig;
    private promptGenerator: PromptGenerator;

    constructor(config: TaskConfig) {
        this.config = config;
        this.promptGenerator = new PromptGenerator(config);
    }

    handleTask(task) {
        const currentState = task.state || 'NEW';
        const classification = this.classifyTask(task);

        if (this.isValidClassification(currentState, classification)) {
            this.updateStateAndAssign(task, classification);
        } else {
            this.handleInvalidClassification(task, classification);
        }
    }

    classifyTask(task) {
        const prompt = this.promptGenerator.generateTaskClassificationPrompt(task);
        return this.llm.classify(prompt);  // Example LLM call
    }

    isValidClassification(currentState, classification) {
        const nextStates = this.config.getAllTaskStates()[currentState]?.nextStates || [];
        return nextStates.includes(classification);
    }

    updateStateAndAssign(task, classification) {
        const categoryConfig = this.config.getTaskCategory(classification);
        task.state = categoryConfig.nextStates[0];  // Move to the first next state
        this.assignToAgent(categoryConfig.responsibleAgent, task);
    }

    handleInvalidClassification(task, classification) {
        // Same as before: request clarification or escalate
    }

    assignToAgent(agentName, task) {
        // Assign task to the appropriate agent
        console.log(`Assigning task to ${agentName}`);
    }
}