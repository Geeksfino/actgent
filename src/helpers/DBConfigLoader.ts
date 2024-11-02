import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { DatabaseConfigs, DatabaseConnectionConfig, DatabaseProvider, getDefaultConfig } from './DatabaseConfig';

export function getDatabaseConfig(name: string = 'default'): DatabaseConnectionConfig {
  const configs = loadDatabaseConfigs();
  if (!configs) {
    return getDefaultConfig("sqlite");
  }
  return configs.connections[name] || configs.connections[configs.default];
}

function loadDatabaseConfigs(): DatabaseConfigs {
  // Try loading from config file first
  try {
    const configPath = process.env.DB_CONFIG_PATH || 'conf/databases.yml';
    return loadConfigFromFile(configPath);
  } catch (error) {
    // Fall back to environment variables
    return {
      default: (process.env.DB_PROVIDER as DatabaseProvider) || "sqlite",
      connections: {
        default: getDefaultConfig(process.env.DB_PROVIDER as DatabaseProvider || "sqlite")
      }
    };
  }
}

function loadConfigFromFile(configPath: string): DatabaseConfigs {
  const ext = path.extname(configPath);
  
  switch (ext) {
    case '.yml':
    case '.yaml':
      return loadYamlConfig(configPath);
    case '.json':
      return loadJsonConfig(configPath);
    default:
      throw new Error(`Unsupported config file format: ${ext}`);
  }
}

function loadYamlConfig(path: string): DatabaseConfigs {
  const content = fs.readFileSync(path, 'utf8');
  return yaml.load(content) as DatabaseConfigs;
}

function loadJsonConfig(path: string): DatabaseConfigs {
  const content = fs.readFileSync(path, 'utf8');
  return JSON.parse(content);
}