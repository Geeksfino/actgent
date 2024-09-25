import { Task } from "./interfaces";

export class TaskContext {
    private task: Task;
    private conversationHistory: string[] = [];
    private state: { [key: string]: any } = {};
    private subtasks: TaskContext[] = [];
  
    constructor(task: Task) {
      this.task = task;
      this.conversationHistory = [];
      this.state = {};
    }
  
    public addToHistory(response: string): void {
      this.conversationHistory.push(response);
    }
  
    public getTaskId(): string {
      return this.task.taskId;
    }

    public getHistory(): string[] {
      return this.conversationHistory;
    }
  
    public getTaskVariables(): { [key: string]: string } {
      return { taskId: this.task.taskId, history: this.conversationHistory.join('\n') };
    }
  
    public updateState(newState: { [key: string]: any }): void {
      this.state = { ...this.state, ...newState };
    }
  
    public getState(): { [key: string]: any } {
      return this.state;
    }

    public addSubtaskContext(subtaskContext: TaskContext): void {
        this.subtasks.push(subtaskContext);
      }
    
      public getSubtasks(): TaskContext[] {
        return this.subtasks;
      }
    
      public hasSubtasks(): boolean {
        return this.subtasks.length > 0;
      }
  
      public getParentTaskId(): string | undefined {
        return this.task.parentTaskId;
      }
  }
  