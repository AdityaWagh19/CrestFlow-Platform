/**
 * Vitest global test setup for copilot-api.
 * Sets required environment variables for tests.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://crestflow:crestflow_dev@localhost:5432/crestflow_test?connection_limit=5';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long-for-security';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.TURNKEY_ORGANIZATION_ID = 'test-turnkey-org-id';
process.env.TURNKEY_API_PUBLIC_KEY = 'test-turnkey-public-key';
process.env.TURNKEY_API_PRIVATE_KEY = 'test-turnkey-private-key';
process.env.LOG_LEVEL = 'silent';
