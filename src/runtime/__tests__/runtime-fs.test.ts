import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createRuntime } from '../index';
import path from 'path';
import { RuntimeError } from '../errors';

describe('Runtime FileSystem', () => {
  const runtime = createRuntime();
  const testDir = path.join(process.cwd(), '__test_files__');
  const testFile = path.join(testDir, 'test.txt');

  beforeAll(async () => {
    await runtime.fs.mkdir(testDir);
  });

  afterAll(async () => {
    await runtime.fs.rm(testDir, { recursive: true });
  });

  describe('UTF-8 Text Operations', () => {
    const utf8Content = 'Hello, 世界! 🌍';

    test('should write and read UTF-8 text', async () => {
      await runtime.fs.writeFile(testFile, utf8Content);
      const content = await runtime.fs.readFile(testFile);
      expect(content).toBe(utf8Content);
    });

    test('should handle UTF-8 encoding explicitly', async () => {
      await runtime.fs.writeFile(testFile, utf8Content, 'utf-8');
      const content = await runtime.fs.readFile(testFile, 'utf-8');
      expect(content).toBe(utf8Content);
    });
  });

  describe('Different Encodings', () => {
    const testString = 'Hello, World!';

    test('should handle ascii encoding', async () => {
      await runtime.fs.writeFile(testFile, testString, 'ascii');
      const content = await runtime.fs.readFile(testFile, 'ascii');
      expect(content).toBe(testString);
    });

    test('should handle base64 encoding', async () => {
      const base64Content = Buffer.from(testString).toString('base64');
      await runtime.fs.writeFile(testFile, base64Content, 'base64');
      const content = await runtime.fs.readFile(testFile, 'base64');
      expect(Buffer.from(content, 'base64').toString()).toBe(testString);
    });

    test('should handle hex encoding', async () => {
      const hexContent = Buffer.from(testString).toString('hex');
      await runtime.fs.writeFile(testFile, hexContent, 'hex');
      const content = await runtime.fs.readFile(testFile, 'hex');
      expect(Buffer.from(content, 'hex').toString()).toBe(testString);
    });
  });

  describe('File Operations', () => {
    test('should check file existence', async () => {
      const exists = await runtime.fs.exists(testFile);
      expect(exists).toBe(true);

      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      const nonExists = await runtime.fs.exists(nonExistentFile);
      expect(nonExists).toBe(false);
    });

    test('should get file stats', async () => {
      const stats = await runtime.fs.stat(testFile);
      expect(stats.isFile).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should list directory contents', async () => {
      const contents = await runtime.fs.readDir(testDir);
      expect(contents.includes('test.txt')).toBe(true);
    });

    test('should handle file removal', async () => {
      const tempFile = path.join(testDir, 'temp.txt');
      await runtime.fs.writeFile(tempFile, 'temporary content');
      expect(await runtime.fs.exists(tempFile)).toBe(true);

      await runtime.fs.rm(tempFile);
      expect(await runtime.fs.exists(tempFile)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent file reads', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      try {
        await runtime.fs.readFile(nonExistentFile);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeError);
      }
    });

    test('should handle invalid directory creation', async () => {
      const invalidDir = '';
      try {
        await runtime.fs.mkdir(invalidDir);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeError);
      }
    });

    test('should handle invalid encoding', async () => {
      try {
        // @ts-expect-error Testing invalid encoding
        await runtime.fs.readFile(testFile, 'invalid-encoding');
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
