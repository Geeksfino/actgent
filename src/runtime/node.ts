import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec, spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { RuntimeError } from './errors';
import type { 
  Runtime,
  FileSystem,
  Path,
  OS,
  Process,
  ChildProcess,
  FileStat,
  SpawnResult,
  NetworkInterface,
  NetworkInterfaces
} from './types';
import { RuntimeType } from './types';
import * as fsCallback from 'fs';
import type { NetworkInterfaceInfo } from 'os';

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

interface NetworkInterfacesDict {
  [key: string]: NetworkInterfaceInfo[] | undefined;
}

export class NodeFileSystem implements FileSystem {
  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    try {
      return await fs.readFile(path, { encoding });
    } catch (e) {
      throw new RuntimeError('Failed to read file', 'EREAD', e);
    }
  }

  async writeFile(path: string, data: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
    try {
      await fs.writeFile(path, data, { encoding });
    } catch (e) {
      throw new RuntimeError('Failed to write file', 'EWRITE', e);
    }
  }

  async readDir(path: string): Promise<string[]> {
    try {
      return await fs.readdir(path);
    } catch (e) {
      throw new RuntimeError('Failed to read directory', 'EREADDIR', e);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: options?.recursive ?? true });
    } catch (e) {
      throw new RuntimeError('Failed to create directory', 'EMKDIR', e);
    }
  }

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await fs.rm(path, options);
    } catch (e) {
      throw new RuntimeError('Failed to remove path', 'ERM', e);
    }
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const stats = await fs.stat(path);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        accessedAt: stats.atime
      };
    } catch (e) {
      throw new RuntimeError('Failed to get file stats', 'ESTAT', e);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await fs.rename(oldPath, newPath);
    } catch (e) {
      throw new RuntimeError('Failed to rename file or directory', 'ERENAME', e);
    }
  }

  watch(path: string, callback: (event: string, filename: string) => void): void {
    fsCallback.watch(path, (event, filename) => callback(event, filename ?? ''));
  }
}

export class NodePath implements Path {
  join(...paths: string[]): string {
    return path.join(...paths);
  }

  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  dirname(pathStr: string): string {
    return path.dirname(pathStr);
  }

  basename(pathStr: string): string {
    return path.basename(pathStr);
  }

  extname(pathStr: string): string {
    return path.extname(pathStr);
  }

  isAbsolute(pathStr: string): boolean {
    return path.isAbsolute(pathStr);
  }

  normalize(path: string): string {
    return path.normalize(path);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
}

export class NodeRuntime implements Runtime {
  readonly runtimeType = RuntimeType.NODE;
  fs = new NodeFileSystem();
  path = new NodePath();
  os: OS = {
    platform: async () => os.platform(),
    homedir: async () => os.homedir(),
    tmpdir: async () => os.tmpdir(),
    hostname: async () => os.hostname(),
    cpus: async () => os.cpus(),
    totalmem: async () => os.totalmem(),
    freemem: async () => os.freemem(),
    arch: async () => os.arch(),
    type: async () => os.type(),
    release: async () => os.release(),
    networkInterfaces: async () => {
      const interfaces = os.networkInterfaces();
      const result: NetworkInterfaces = {};
      
      for (const [key, value] of Object.entries(interfaces)) {
        if (value) {
          result[key] = value as NetworkInterface[];
        }
      }
      
      return result;
    }
  };

  process: Process = {
    get env() {
      return process.env as Record<string, string>;
    },
    cwd: async () => process.cwd(),
    exit: (code?: number) => process.exit(code),
    pid: process.pid,
    platform: process.platform,
    argv: process.argv,
    execPath: process.execPath,
    getEnvironmentVariable: async (key: string) => process.env[key] ?? null,
    setEnvironmentVariable: async (key: string, value: string) => {
      process.env[key] = value;
    }
  };

  childProcess: ChildProcess = {
    async exec(command: string) {
      try {
        return await execPromise(command);
      } catch (e) {
        throw new RuntimeError('Failed to execute command', 'EEXEC', e);
      }
    },

    async spawn(command: string, args: string[]): Promise<SpawnResult> {
      return new Promise((resolve, reject) => {
        const proc = spawn(command, args);
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({
            pid: proc.pid ?? -1,
            stdout,
            stderr,
            exitCode: code ?? -1
          });
        });

        proc.on('error', (err) => {
          reject(new RuntimeError('Failed to spawn process', 'ESPAWN', err));
        });
      });
    },

    async execFile(file: string, args: string[]) {
      try {
        return await execFilePromise(file, args);
      } catch (e) {
        throw new RuntimeError('Failed to execute file', 'EEXECFILE', e);
      }
    }
  };
}