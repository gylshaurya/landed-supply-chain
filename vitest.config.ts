import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      LANDED_DB: 'data/test-db.json',
      LANDED_TODAY: '2026-10-23',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
      PAYPAL_CLIENT_ID: '',
      PAYPAL_CLIENT_SECRET: '',
    },
    testTimeout: 20000,
  },
});
