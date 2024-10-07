import { ClassificationTypeConfig, ClassifiedTypeHandlers } from "./IClassifier";
import { AbstractClassifier } from "./AbstractClassifier";

export class DefaultClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
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
