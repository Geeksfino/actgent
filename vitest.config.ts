// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Enables `vi` globally
    environment: 'node', // Use 'node' if you're testing backend code
  },
});