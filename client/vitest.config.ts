import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Client unit tests: pure components rendered to static HTML with react-dom/server (no browser, no DOM).
// vitest itself is the server workspace's dev dependency (hoisted to the root node_modules).
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
