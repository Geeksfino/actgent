import { Database } from "bun:sqlite";
import { MemoryConfig } from "./interfaces";

// Memory class to manage local memory
export class Memory {
  private db: Database;

  constructor(config: MemoryConfig) {
    this.db = new Database(config.dbFilePath);
    this.initializeDatabase();
  }

  private initializeDatabase() {
    this.db.run(`CREATE TABLE IF NOT EXISTS InteractionHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT,
      response TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS TaskHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskDescription TEXT,
      result TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS Goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goalDescription TEXT,
      status TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS State (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  // Interaction history
  storeInteraction(prompt: string, response: string) {
    this.db.run("INSERT INTO InteractionHistory (prompt, response) VALUES (?, ?)", [prompt, response]);
  }

  getInteractionHistory(limit: number = 10) {
    return this.db.query("SELECT * FROM InteractionHistory ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  // Task history
  storeTask(taskDescription: string, result: string) {
    this.db.run("INSERT INTO TaskHistory (taskDescription, result) VALUES (?, ?)", [taskDescription, result]);
  }

  getTaskHistory(limit: number = 10) {
    return this.db.query("SELECT * FROM TaskHistory ORDER BY timestamp DESC LIMIT ?").all(limit);
  }

  // Goals management
  storeGoal(goalDescription: string, status: string = "pending") {
    this.db.run("INSERT INTO Goals (goalDescription, status) VALUES (?, ?)", [goalDescription, status]);
  }

  updateGoalStatus(goalId: number, status: string) {
    this.db.run("UPDATE Goals SET status = ? WHERE id = ?", [status, goalId]);
  }

  getGoals(status?: string) {
    if (status) {
      return this.db.query("SELECT * FROM Goals WHERE status = ? ORDER BY timestamp DESC").all(status);
    } else {
      return this.db.query("SELECT * FROM Goals ORDER BY timestamp DESC").all();
    }
  }

  // State management
  updateState(state: string) {
    this.db.run("INSERT INTO State (state) VALUES (?)", [state]);
  }

  getState() {
    return this.db.query("SELECT * FROM State ORDER BY timestamp DESC LIMIT 1").get();
  }
}
