import { z } from 'zod';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('config');

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Turnkey
  TURNKEY_API_BASE_URL: z.string().url().default('https://api.turnkey.com'),
  TURNKEY_ORGANIZATION_ID: z.string().min(1),
  TURNKEY_API_PUBLIC_KEY: z.string().min(1),
  TURNKEY_API_PRIVATE_KEY: z.string().min(1),

  // Algorand
  ALGORAND_ALGOD_URL: z.string().url().default('https://mainnet-api.4160.nodely.dev'),
  ALGORAND_ALGOD_TOKEN: z.string().default(''),
  ALGORAND_INDEXER_URL: z.string().url().default('https://mainnet-idx.4160.nodely.dev'),
  ALGORAND_INDEXER_TOKEN: z.string().default(''),
  ALGORAND_NETWORK: z.enum(['mainnet', 'testnet', 'betanet']).default('mainnet'),

  // CoinGecko
  COINGECKO_API_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  COINGECKO_API_KEY: z.string().default(''),

  // Protocol URLs are derived from lib/network.ts — no env vars needed
  // (Folks, Tinyman, Pact URLs are network-aware)

  // Gora Oracle
  GORA_ORACLE_APP_ID: z.string().default(''),
  GORA_ORACLE_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // KYC bypass (development only — skips KYC gate in policy engine)
  KYC_BYPASS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Veriff KYC
  VERIFF_API_KEY: z.string().default(''),
  VERIFF_API_SECRET: z.string().default(''),
  VERIFF_API_URL: z.string().url().default('https://stationapi.veriff.com/v1'),
  VERIFF_WEBHOOK_SECRET: z.string().default(''),

  // GoPlausible
  GOPLAUSIBLE_API_URL: z.string().url().default('https://api.goplausible.com'),
  GOPLAUSIBLE_API_KEY: z.string().default(''),
  GOPLAUSIBLE_FACILITATOR_ADDRESS: z.string().default(''),

  // Transak
  TRANSAK_API_KEY: z.string().default(''),
  TRANSAK_API_SECRET: z.string().default(''),
  TRANSAK_WEBHOOK_SECRET: z.string().default(''),

  // OpenAI
  OPENAI_API_KEY: z.string().default(''),

  // Google AI / Gemini
  GOOGLE_AI_API_KEY: z.string().default(''),

  // x402
  X402_USDC_ASA_ID: z.coerce.number().default(31566704),
  X402_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    logger.fatal(
      { errors: result.error.flatten().fieldErrors },
      'Invalid environment configuration — server cannot start',
    );
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
