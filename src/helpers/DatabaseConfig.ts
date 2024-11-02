import { Options as SequelizeOptions } from "sequelize";

export type DatabaseProvider = 
  | "mysql" 
  | "postgres" 
  | "sqlite" 
  | "mssql" 
  | "oracle" 
  | "db2";

export interface DatabaseConnectionConfig {
  provider: DatabaseProvider;
  connection: SequelizeOptions;
}

export interface DatabaseConfigs {
  default: DatabaseProvider;
  connections: Record<string, DatabaseConnectionConfig>;
}

// Default configurations for different providers
export const getDefaultConfig = (provider: DatabaseProvider): DatabaseConnectionConfig => {
  switch (provider) {
    case "sqlite":
      return {
        provider: "sqlite",
        connection: {
          dialect: "sqlite",
          storage: ":memory:"
        }
      };
    
    case "postgres":
      return {
        provider: "postgres",
        connection: {
          dialect: "postgres",
          host: "localhost",
          port: 5432,
          database: "postgres",
          username: "postgres",
          password: "",
          pool: {
            max: 5,
            min: 0,
            idle: 10000
          },
          ssl: false
        }
      };

    case "mysql":
      return {
        provider: "mysql",
        connection: {
          dialect: "mysql",
          host: "localhost",
          port: 3306,
          database: "mysql",
          username: "root",
          password: "",
          pool: {
            max: 5,
            min: 0,
            idle: 10000
          }
        }
      };

    // Add other providers as needed...
    default:
      throw new Error(`Unsupported database provider: ${provider}`);
  }
}

