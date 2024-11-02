import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLTool } from '../sql';
import { ExecutionContext } from '../../core/ExecutionContext';
import { RunOptions } from '../../core/Tool';
import { JSONOutput } from '../../core/Tool';
interface SQLResult {
  success: boolean;
  results?: any[];
  error?: string;
  metadata?: {
    rowCount: number;
    tables: Array<{
      tableName: string;
      columns: Array<{
        name: string;
        type: string;
      }>;
    }>;
  };
}

describe('SQLTool', () => {
  let sqlTool: SQLTool;
  let context: ExecutionContext;
  let options: RunOptions;

  beforeEach(() => {
    // Initialize SQLTool with SQLite in-memory database
    sqlTool = new SQLTool({
      provider: 'sqlite',
      connection: {
        dialect: 'sqlite',
        storage: ':memory:'
      }
    });

    context = new ExecutionContext();
    options = {};
  });

  afterEach(async () => {
    await sqlTool.destroy();
  });

  it('should create a table and query it successfully', async () => {
    // First create a table (this is normally not allowed, but we'll use raw query for setup)
    const sequelize = (sqlTool as any).sequelize || await (sqlTool as any).getConnection();
    await sequelize.query(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `);

    await sequelize.query(`
      INSERT INTO users (id, name, email) VALUES 
      (1, 'John Doe', 'john@example.com'),
      (2, 'Jane Smith', 'jane@example.com')
    `);

    const result = await sqlTool.run({
      query: 'SELECT * FROM users ORDER BY id'
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(true);
    expect(content.results).toHaveLength(2);
    expect(content.results![0]).toMatchObject({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com'
    });
  });

  it('should reject non-SELECT queries', async () => {
    const result = await sqlTool.run({
      query: 'INSERT INTO users (name) VALUES ("Test")'
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(false);
    expect(content.error).toContain('Only SELECT queries are allowed');
  });

  it('should handle query parameters', async () => {
    // Setup
    const sequelize = (sqlTool as any).sequelize || await (sqlTool as any).getConnection();
    await sequelize.query(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT,
        price REAL
      )
    `);

    await sequelize.query(`
      INSERT INTO products (id, name, price) VALUES 
      (1, 'Widget', 9.99),
      (2, 'Gadget', 19.99)
    `);

    const result = await sqlTool.run({
      query: 'SELECT * FROM products WHERE price < :maxPrice',
      params: { maxPrice: 15.00 }
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(true);
    expect(content.results).toHaveLength(1);
    expect(content.results![0].name).toBe('Widget');
  });

  it('should return metadata about tables', async () => {
    // Setup
    const sequelize = (sqlTool as any).sequelize || await (sqlTool as any).getConnection();
    await sequelize.query(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT
      )
    `);

    const result = await sqlTool.run({
      query: 'SELECT * FROM test_table'
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(true);
    expect(content.metadata).toBeDefined();
    expect(content.metadata?.tables).toBeDefined();
    expect(Array.isArray(content.metadata?.tables)).toBe(true);
  });

  it('should handle invalid queries gracefully', async () => {
    const result = await sqlTool.run({
      query: 'SELECT * FROM nonexistent_table'
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(false);
    expect(content.error).toBeDefined();
  });

  it('should respect maxRows limit', async () => {
    // Setup
    const sequelize = (sqlTool as any).sequelize || await (sqlTool as any).getConnection();
    await sequelize.query(`
      CREATE TABLE numbers (
        id INTEGER PRIMARY KEY
      )
    `);

    // Insert more rows than the default limit
    const values = Array.from({ length: 1500 }, (_, i) => `(${i + 1})`).join(',');
    await sequelize.query(`INSERT INTO numbers (id) VALUES ${values}`);

    const result = await sqlTool.run({
      query: 'SELECT * FROM numbers ORDER BY id'
    });

    const content = (result as JSONOutput<SQLResult>).getTypedContent();
    expect(content.success).toBe(true);
    expect(content.results!.length).toBeLessThanOrEqual(1000); // Default maxRows is 1000
    expect(content.metadata?.rowCount).toBeGreaterThan(1000);
  });
}); 