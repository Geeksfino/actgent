import { describe, it, expect, beforeEach } from 'vitest';
import { NodeRuntime } from '../node';
import { RuntimeError } from '../errors';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('NodeRuntime', () => {
  let runtime: NodeRuntime;

  beforeEach(() => {
    runtime = new NodeRuntime();
  });

  describe('FileSystem', () => {
    it('should read and write files', async () => {
      const testPath = path.join(process.cwd(), 'test.txt');
      const testContent = 'Hello, World!';

      await runtime.fs.writeFile(testPath, testContent);
      const content = await runtime.fs.readFile(testPath);
      await runtime.fs.rm(testPath);

      expect(content).toBe(testContent);
    });

    it('should handle file stats', async () => {
      const testPath = path.join(process.cwd(), 'test.txt');
      await runtime.fs.writeFile(testPath, 'test');

      const stats = await runtime.fs.stat(testPath);
      await runtime.fs.rm(testPath);

      expect(stats.isFile).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should throw RuntimeError for non-existent files', async () => {
      await expect(runtime.fs.readFile('nonexistent.txt'))
        .rejects
        .toThrow(RuntimeError);
    });
  });

  describe('Path', () => {
    it('should join paths correctly', () => {
      const joined = runtime.path.join('a', 'b', 'c');
      expect(joined).toBe(path.join('a', 'b', 'c'));
    });

    it('should resolve paths correctly', () => {
      const resolved = runtime.path.resolve('a', '../b');
      expect(resolved).toBe(path.resolve('a', '../b'));
    });
  });

  describe('Process', () => {
    it('should get current working directory', async () => {
      const cwd = await runtime.process.cwd();
      expect(cwd).toBe(process.cwd());
    });

    it('should handle environment variables', async () => {
      const testKey = 'TEST_ENV_VAR';
      const testValue = 'test_value';

      await runtime.process.setEnvironmentVariable(testKey, testValue);
      const value = await runtime.process.getEnvironmentVariable(testKey);

      expect(value).toBe(testValue);
    });
  });

  describe('ChildProcess', () => {
    it('should execute commands', async () => {
      const { stdout } = await runtime.childProcess.exec('echo "test"');
      expect(stdout.trim()).toBe('test');
    });

    it('should spawn processes', async () => {
      const result = await runtime.childProcess.spawn('echo', ['test']);
      expect(result.stdout.trim()).toBe('test');
      expect(result.exitCode).toBe(0);
    });
  });
}); 