import { Tool, JSONOutput, RunOptions, ToolError } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { Sequelize, Options, QueryTypes } from "sequelize";
import { program } from "commander";

// Types for database metadata
interface TableMetadata {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
  }>;
}

interface SQLResult {
  success: boolean;
  results?: any[];
  error?: string;
  metadata?: {
    rowCount: number;
    tables: TableMetadata[];
  };
}

interface SQLToolInput {
  query: string;
  params?: Record<string, any>;
}

export type DatabaseProvider = 
  | "mysql" 
  | "postgres" 
  | "sqlite" 
  | "mssql" 
  | "oracle" 
  | "db2";

interface SQLToolOptions {
  provider: DatabaseProvider;
  connection: Options;
  maxRows?: number;
  timeout?: number;
}

export class SQLTool extends Tool<SQLToolInput, JSONOutput<SQLResult>> {
  private sequelize: Sequelize | null = null;
  protected readonly options: SQLToolOptions;

  constructor(options: SQLToolOptions) {
    super(
      "SQL",
      "Execute SQL queries against a database with schema validation and safety checks"
    );

    // Validate required connection options
    if (!options.connection.dialect) {
      throw new Error("Database dialect is required");
    }

    if (!options.connection.database && options.provider !== "sqlite") {
      throw new Error("Database name is required");
    }

    this.options = {
      maxRows: 1000,
      timeout: 30000,
      ...options
    };
  }

  schema(): z.ZodSchema<SQLToolInput> {
    return z.object({
      query: z
        .string()
        .min(1)
        .describe("The SQL query to execute. Only SELECT queries are allowed for safety."),
      params: z
        .record(z.any())
        .optional()
        .describe("Optional parameters to bind to the query")
    });
  }

  private async getConnection(): Promise<Sequelize> {
    if (!this.sequelize) {
      try {
        this.sequelize = new Sequelize({
          ...this.options.connection,
          pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
          },
          logging: false
        });
        await this.sequelize.authenticate();
      } catch (error) {
        throw new ToolError(
          `Database connection failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return this.sequelize;
  }

  private async getDatabaseMetadata(): Promise<TableMetadata[]> {
    const sequelize = await this.getConnection();
    const tables: TableMetadata[] = [];

    try {
      // Get list of tables
      const [results] = await sequelize.query(
        this.getMetadataQuery(this.options.provider)
      );

      // Group results by table
      const tableMap = new Map<string, TableMetadata>();
      
      for (const row of results as any[]) {
        const tableName = row.table_name || row.tableName;
        if (!tableMap.has(tableName)) {
          tableMap.set(tableName, {
            tableName,
            columns: []
          });
        }
        
        tableMap.get(tableName)!.columns.push({
          name: row.column_name || row.columnName,
          type: row.data_type || row.dataType
        });
      }

      return Array.from(tableMap.values());
    } catch (error) {
      throw new ToolError(`Failed to get database metadata: ${error}`);
    }
  }

  private getMetadataQuery(provider: DatabaseProvider): string {
    switch (provider) {
      case "postgres":
        return `
          SELECT 
            table_name,
            column_name,
            data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `;
      case "mysql":
        return `
          SELECT 
            table_name,
            column_name,
            data_type
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
          ORDER BY table_name, ordinal_position
        `;
      case "sqlite":
        return `
          SELECT 
            m.tbl_name as table_name,
            p.name as column_name,
            p.type as data_type
          FROM sqlite_master m
          JOIN pragma_table_info(m.tbl_name) p
          WHERE m.type = 'table'
          ORDER BY m.tbl_name, p.cid
        `;
      // Add other providers as needed
      default:
        throw new ToolError(`Database provider ${provider} is not supported`);
    }
  }

  private isReadOnlyQuery(query: string): boolean {
    const normalized = query.trim().toUpperCase();
    return normalized.startsWith('SELECT') || 
           normalized.startsWith('SHOW') || 
           normalized.startsWith('DESCRIBE');
  }

  protected async execute(
    input: SQLToolInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SQLResult>> {
    try {
      // Safety check - only allow read operations
      if (!this.isReadOnlyQuery(input.query)) {
        return new JSONOutput<SQLResult>({
          success: false,
          error: "Only SELECT queries are allowed for safety reasons"
        });
      }

      const sequelize = await this.getConnection();
      
      try {
        const metadata = await this.getDatabaseMetadata();

        // Execute query with timeout
        const results = await Promise.race([
          sequelize.query(input.query, {
            replacements: input.params,
            type: QueryTypes.SELECT,
            raw: true,
            plain: false
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Query timeout")), this.options.timeout)
          )
        ]) as any[];

        // Limit results if needed
        const limitedResults = results.slice(0, this.options.maxRows);

        return new JSONOutput<SQLResult>({
          success: true,
          results: limitedResults,
          metadata: {
            rowCount: results.length,
            tables: metadata
          }
        });

      } catch (innerError) {
        throw innerError;
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new JSONOutput<SQLResult>({
        success: false,
        error: `Query execution failed: ${message}`
      });
    }
  }

  async destroy(): Promise<void> {
    if (this.sequelize) {
      await this.sequelize.close();
      this.sequelize = null;
    }
  }
}

// CLI support
async function main() {
  program
    .name("sql-tool")
    .description("Execute SQL queries from the command line")
    .requiredOption("-q, --query <string>", "SQL query to execute")
    .option("-p, --params <string>", "Query parameters as JSON string")
    .option("-c, --connection <string>", "Database connection string")
    .parse();

  const options = program.opts();

  try {
    // Parse connection string or use default
    const connectionConfig = options.connection ? 
      JSON.parse(options.connection) : 
      {
        dialect: "sqlite",
        storage: ":memory:"
      };

    const tool = new SQLTool({
      provider: connectionConfig.dialect,
      connection: connectionConfig
    });

    const result = await tool.run({
      query: options.query,
      params: options.params ? JSON.parse(options.params) : undefined
    });

    console.log("\nQuery Results:\n");
    console.log(JSON.stringify(result.getContent(), null, 2));

    await tool.destroy();
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 