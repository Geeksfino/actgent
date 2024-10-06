import { ClassifiedTypeHandlers } from "./IClassifier";
import { Session } from "./Session";
import { AbstractClassifier } from "./AbstractClassifier";

// Define the specific types as a readonly tuple
const defaultTypes = [
  {
    name: "SIMPLE_QUERY",
    description: "A straightforward question that can be answered directly.",
    structure: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  {
    name: "COMPLEX_TASK",
    description: "A task that requires multiple steps or extended processing.",
    structure: {
      actionPlan: {
        task: "<MAIN_OBJECTIVE>",
        subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
      },
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    description: "The message needs clarification.",
    structure: {
      questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  {
    name: "COMMAND",
    description: "An instruction to perform a specific action.",
    structure: {
      command: {
        action: "<SPECIFIC_ACTION>",
        parameters: {
          "<PARAM_1>": "<VALUE_1>",
          "<PARAM_2>": "<VALUE_2>",
          "...": "...",
        },
        expectedOutcome: "<DESCRIPTION_OF_EXPECTED_RESULT>",
      },
    },
  },
] as const; // 'as const' ensures immutability

export type DefaultTypes = Readonly<typeof defaultTypes>;

export class DefaultClassifier extends AbstractClassifier<DefaultTypes> {
  constructor() {
    super();
  }

  public getClassificationTypeDefinition(): DefaultTypes {
    return defaultTypes;
  }

  public getClassificationTypeHandlers(): ClassifiedTypeHandlers<DefaultTypes> {
    
    const callbacks: ClassifiedTypeHandlers<DefaultTypes> = { 
      SIMPLE_QUERY: (result, session: Session) => {
        console.log(`Simple Query Answer: ${result.answer}`);
      },
      COMPLEX_TASK: (result, session: Session) => {
        console.log(`Complex Task: ${result.actionPlan.task}`);
        console.log(`Subtasks: ${result.actionPlan.subtasks.join(", ")}`);
      },
      CLARIFICATION_NEEDED: (result, session: Session) => {
        console.log(`Clarify: ${result.questions}`);
        session.triggerClarificationNeeded(result);
      },
      COMMAND: (result, session: Session) => {
        console.log(`Command: ${result.command}`);
        session.triggerHandleResult(result);
      },
    };

    return callbacks;
  }
}
