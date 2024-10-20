export class TaskConfig {
    taskName: string;
    description: string;
    responsibleAgent: string;
    finishedState: string;
    transitionMap: Map<string, string[]>; // Current state -> List of possible next states
    useVerbToPastParticiple: boolean;
    verbToPastParticipleMap: Map<string, string>;

    constructor(
        taskName: string, 
        description: string, 
        responsibleAgent: string, 
        finishedState?: string, 
        transitionMap?: Map<string, string[]>,
        useVerbToPastParticiple: boolean = true // Default to true for verb transformation
    ) {
        this.taskName = taskName;
        this.description = description;
        this.responsibleAgent = responsibleAgent;
        this.transitionMap = transitionMap || new Map<string, string[]>();
        this.useVerbToPastParticiple = useVerbToPastParticiple;
        this.verbToPastParticipleMap = new Map<string, string>();
        this.finishedState = finishedState || this.generateFinishedState(taskName);
    }

    // Method to generate finished state based on verb transformation if needed
    private generateFinishedState(taskName: string): string {
        if (!this.useVerbToPastParticiple) {
            return taskName.toUpperCase() + '_FINISHED'; // Default rule if transformation is not used
        }

        const taskVerb = taskName.split('_')[0]; // Assume first word is the verb
        const pastParticiple = this.verbToPastParticipleMap.get(taskVerb) || taskVerb + 'ed'; // Default past tense if not found
        const remainingWords = taskName.split('_').slice(1).join('_'); // Keep the rest of the task name
        return (pastParticiple + '_' + remainingWords).toUpperCase();
    }

    // Method to add state transitions
    addTransition(currentState: string, nextState: string): this {
        if (!this.transitionMap.has(currentState)) {
            this.transitionMap.set(currentState, []);
        }
        this.transitionMap.get(currentState)?.push(nextState);
        return this; // Enable chaining
    }

    // Method to set custom past participles for specific verbs
    setVerbToPastParticiple(verb: string, pastParticiple: string): this {
        this.verbToPastParticipleMap.set(verb, pastParticiple);
        return this; // Enable chaining
    }

    // Check if a next state is valid given the current state
    isValidTransition(currentState: string, nextState: string): boolean {
        const validStates = this.transitionMap.get(currentState);
        return validStates ? validStates.includes(nextState) : false;
    }

    // Factory method to build TaskConfig using a fluent API style
    static create(
        taskName: string, 
        description: string, 
        responsibleAgent: string, 
        useVerbToPastParticiple: boolean = true
    ): TaskConfig {
        return new TaskConfig(taskName, description, responsibleAgent, undefined, undefined, useVerbToPastParticiple);
    }

    // Method to manually set the finished state if developers want full control
    setFinishedState(finishedState: string): this {
        this.finishedState = finishedState;
        return this;
    }

    // Method to log the current configuration for debugging or inspection
    printConfig(): void {
        console.log(`Task: ${this.taskName}`);
        console.log(`Description: ${this.description}`);
        console.log(`Responsible Agent: ${this.responsibleAgent}`);
        console.log(`Finished State: ${this.finishedState}`);
        console.log(`Transition Map:`);
        for (const [key, value] of this.transitionMap.entries()) {
            console.log(`  ${key} -> [${value.join(', ')}]`);
        }
        console.log(`Use Verb-to-Past Participle: ${this.useVerbToPastParticiple}`);
        console.log(`Verb-to-Past Participle Map:`);
        for (const [verb, pastParticiple] of this.verbToPastParticipleMap.entries()) {
            console.log(`  ${verb} -> ${pastParticiple}`);
        }
    }
}

// Example usage:

// Fluent API construction
const config = TaskConfig.create('PRODUCT_PLANNING', 'Plan a new product', 'ProductManagerAgent')
    .setVerbToPastParticiple('PLAN', 'PLANNED')
    .addTransition('INITIAL', 'PRODUCT_PLANNING')
    .addTransition('PRODUCT_PLANNING', 'PRODUCT_PLANNED')
    .addTransition('PRODUCT_PLANNED', 'DEVELOPMENT_STARTED');

// Log the configuration
config.printConfig();