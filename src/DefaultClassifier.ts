import { ClassificationTypeConfig, ClassifiedTypeHandlers } from "./IClassifier";
import { Session } from "./Session";
import { AbstractClassifier } from "./AbstractClassifier";

// Define the specific types as a readonly tuple
const defaultTypes: ClassificationTypeConfig[] = [
  {
    name: "SIMPLE_QUERY",
    prompt: "A straightforward question that can be answered directly.",
    schema: {
      answer: "<DIRECT_ANSWER_TO_QUERY>",
    },
  },
  {
    name: "COMPLEX_TASK",
    prompt: "A task that requires multiple steps or extended processing.",
    schema: {
      actionPlan: {
        task: "<MAIN_OBJECTIVE>",
        subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
      },
    },
  },
  {
    name: "CLARIFICATION_NEEDED",
    prompt: "The message needs clarification.",
    schema: {
      questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
    },
  },
  {
    name: "COMMAND",
    prompt: "An instruction to perform a specific action.",
    schema: {
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

export type SchemaTypes = Readonly<typeof defaultTypes>;

export class DefaultClassifier extends AbstractClassifier<SchemaTypes> {
  constructor() {
    super();
  }

  public getClassificationTypeDefinition(): ReadonlyArray<ClassificationTypeConfig> {
    return defaultTypes;
  }

  // public getClassificationTypeHandlers(): ClassifiedTypeHandlers<SchemaTypes> {
    
  //   const callbacks: ClassifiedTypeHandlers<SchemaTypes> = { 
  //     SIMPLE_QUERY: (result, session: Session) => {
  //       console.log(`Simple Query Answer: ${result.answer}`);
  //     },
  //     COMPLEX_TASK: (result, session: Session) => {
  //       console.log(`Complex Task: ${result.actionPlan.task}`);
  //       console.log(`Subtasks: ${result.actionPlan.subtasks.join(", ")}`);
  //     },
  //     CLARIFICATION_NEEDED: (result, session: Session) => {
  //       console.log(`Clarify: ${result.questions}`);
  //       session.triggerEventHandlers(result);
  //     },
  //     COMMAND: (result, session: Session) => {
  //       console.log(`Command: ${result.command}`);
  //       session.triggerEventHandlers(result);
  //     },
  //   };

  //   return callbacks;
  // }
}
