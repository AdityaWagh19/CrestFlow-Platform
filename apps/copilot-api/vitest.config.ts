import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      FRONTEND_URL: 'http://localhost:5173',
      LOG_LEVEL: 'error',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long-for-validation',
      JWT_EXPIRES_IN: '7d',
      GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
      TURNKEY_API_BASE_URL: 'https://api.turnkey.com',
      TURNKEY_ORGANIZATION_ID: 'test-turnkey-org-id',
      TURNKEY_API_PUBLIC_KEY: 'test-turnkey-public-key',
      TURNKEY_API_PRIVATE_KEY: 'test-turnkey-private-key',
      ALGORAND_ALGOD_URL: 'https://mainnet-api.4160.nodely.dev',
      ALGORAND_INDEXER_URL: 'https://mainnet-idx.4160.nodely.dev',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
