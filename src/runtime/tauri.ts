import { platform, arch, type as osType, version, hostname } from '@tauri-apps/plugin-os';
import { exists, readTextFile, writeTextFile, mkdir, readDir, create, remove } from '@tauri-apps/plugin-fs';
import { join, dirname, basename, extname, resolve, normalize, isAbsolute } from '@tauri-apps/api/path';
import { Command } from '@tauri-apps/plugin-shell';
import { exit } from '@tauri-apps/plugin-process';
import type { Runtime, FileStat, CPUInfo, NetworkInterfaces, SpawnResult, BufferEncoding } from './types';
import { window } from '@tauri-apps/api';

export class TauriRuntime implements Runtime {
  fs = {
    async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
      try {
        // Tauri's readTextFile already returns UTF-8 text
        return await readTextFile(path);
      } catch (e) {
        throw new Error('Failed to read file');
      }
    },

    async writeFile(path: string, data: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
      try {
        // Tauri's writeTextFile already uses UTF-8
        await writeTextFile(path, data);
      } catch (e) {
        throw new Error('Failed to write file');
      }
    },

    async readDir(path: string): Promise<string[]> {
      const entries = await readDir(path);
      return entries.map(entry => entry.name);
    },

    async exists(path: string): Promise<boolean> {
      return await exists(path);
    },

    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      await mkdir(path, { recursive: options?.recursive ?? true });
    },

    async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
      await remove(path, options);
    },

    async stat(path: string): Promise<FileStat> {
      // Tauri doesn't have a direct stat equivalent, we'll need to implement a custom solution
      // This is a simplified version
      const exists = await this.exists(path);
      if (!exists) {
        throw new Error('File not found');
      }

      return {
        size: 0, // Would need custom implementation to get actual size
        isFile: true, // Would need custom implementation to determine
        isDirectory: false, // Would need custom implementation to determine
        createdAt: new Date(),
        modifiedAt: new Date(),
        accessedAt: new Date(),
      };
    },

    watch(path: string, callback: (event: string, filename: string | null) => void): void {
      // Tauri doesn't have a built-in file watcher
      // Would need to implement polling or use a plugin
      console.warn('File watching not implemented in Tauri runtime');
    }
  };

  path = {
    join(...paths: string[]): string {
      return paths.join('/').replace(/\/+/g, '/');
    },

    resolve(...paths: string[]): string {
      // Simple resolve implementation
      return this.normalize(this.join(...paths));
    },

    dirname(path: string): string {
      const parts = path.split('/');
      parts.pop();
      return parts.join('/') || '.';
    },

    basename(path: string): string {
      return path.split('/').pop() || '';
    },

    extname(path: string): string {
      const base = this.basename(path);
      const dotIndex = base.lastIndexOf('.');
      return dotIndex === -1 ? '' : base.slice(dotIndex);
    },

    isAbsolute(path: string): boolean {
      return path.startsWith('/');
    },

    normalize(path: string): string {
      return path.replace(/\/+/g, '/');
    },

    relative(from: string, to: string): string {
      const fromParts = from.split('/');
      const toParts = to.split('/');
      
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
      }
      
      return [...Array(fromParts.length).fill('..'), ...toParts].join('/');
    }
  };

  os = {
    async platform(): Promise<string> {
      return await platform();
    },

    async homedir(): Promise<string> {
      // Use Tauri path API to get home directory
      return await join('~');
    },

    async tmpdir(): Promise<string> {
      // Tauri doesn't have a direct tmpdir equivalent
      // You might want to use app's cache directory instead
      return await join('.cache');
    },

    async hostname(): Promise<string> {
      return (await hostname()) ?? 'unknown';
    },

    async cpus(): Promise<Array<CPUInfo>> {
      // Tauri doesn't provide CPU info directly
      // Return a simplified version
      return [{
        model: 'Unknown',
        speed: 0,
        times: {
          user: 0,
          nice: 0,
          sys: 0,
          idle: 0,
          irq: 0
        }
      }];
    },

    async totalmem(): Promise<number> {
      // Not directly available in Tauri
      return 0;
    },

    async freemem(): Promise<number> {
      // Not directly available in Tauri
      return 0;
    },

    async arch(): Promise<string> {
      return (await arch()) ?? 'unknown';
    },

    async type(): Promise<string> {
      return (await osType()) ?? 'unknown';
    },

    async release(): Promise<string> {
      return (await version()) ?? 'unknown';
    },

    async networkInterfaces(): Promise<NetworkInterfaces> {
      // Not directly available in Tauri
      return {};
    }
  };

  process = {
    env: {},

    async cwd(): Promise<string> {
      const command = Command.create('pwd');
      const output = await command.execute();
      return output.stdout.trim();
    },

    async exit(code?: number): Promise<void> {
      await exit(code);
    },

    pid: -1, // Not applicable in Tauri

    platform: 'tauri',

    argv: [], // Not directly available in Tauri

    execPath: '', // Not applicable in Tauri

    async getEnvironmentVariable(key: string): Promise<string | null> {
      try {
        const plat = await platform();
        const isWindows = plat === 'windows';
        const command = Command.create(isWindows ? 'cmd' : 'sh', 
          isWindows ? ['/c', 'echo %' + key + '%'] : ['-c', `echo "$${key}"`]);
        const output = await command.execute();
        const value = output.stdout.trim();
        return value === '%' + key + '%' ? null : value;
      } catch (error) {
        return null;
      }
    },

    async setEnvironmentVariable(key: string, value: string): Promise<void> {
      const plat = await platform();
      const isWindows = plat === 'windows';
      const command = Command.create(isWindows ? 'cmd' : 'sh',
        isWindows ? 
          ['/c', `set "${key}=${value}"`] : 
          ['-c', `export ${key}="${value}"`]
      );
      await command.execute();
    }
  };

  childProcess = {
    async exec(command: string): Promise<{ stdout: string; stderr: string }> {
      const cmd = Command.create('sh', ['-c', command]);
      const output = await cmd.execute();
      return {
        stdout: output.stdout,
        stderr: output.stderr
      };
    },

    async spawn(command: string, args: string[]): Promise<SpawnResult> {
      const cmd = Command.create(command, args);
      const output = await cmd.execute();
      
      return {
        pid: -1,  // Tauri doesn't provide PID
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: output.code ?? 0  // Default to 0 if code is null
      };
    },

    async execFile(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
      const cmd = Command.create(file, args);
      const output = await cmd.execute();
      return {
        stdout: output.stdout,
        stderr: output.stderr
      };
    }
  };
}
