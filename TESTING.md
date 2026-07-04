# CrestFlow — Testing & Setup Guide

## 1. Required Environment Variables

Create `.env` in the project root with these values:

### Mandatory (server won't start without these)

```bash
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug

# Database — must match docker-compose.yml
DATABASE_URL=postgresql://crestflow:crestflow_dev@localhost:5432/crestflow?connection_limit=25

# Redis
REDIS_URL=redis://localhost:6379

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<paste-your-64-char-hex-string-here>
JWT_EXPIRES_IN=7d

# Google OAuth — from Google Cloud Console > APIs > Credentials
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com

# Turnkey — from app.turnkey.com > API Keys
TURNKEY_API_BASE_URL=https://api.turnkey.com
TURNKEY_ORGANIZATION_ID=<your-turnkey-org-id>
TURNKEY_API_PUBLIC_KEY=<your-turnkey-api-public-key>
TURNKEY_API_PRIVATE_KEY=<your-turnkey-api-private-key>
```

### Optional (defaults work for local dev)

```bash
# Algorand — free Nodely endpoints, no key needed
ALGORAND_ALGOD_URL=https://mainnet-api.4160.nodely.dev
ALGORAND_ALGOD_TOKEN=
ALGORAND_INDEXER_URL=https://mainnet-idx.4160.nodely.dev
ALGORAND_INDEXER_TOKEN=
ALGORAND_NETWORK=mainnet

# CoinGecko — works without key (rate-limited)
COINGECKO_API_URL=https://api.coingecko.com/api/v3
COINGECKO_API_KEY=

# Protocol APIs
FOLKS_FINANCE_API_URL=https://api.folks.finance
TINYMAN_API_URL=https://mainnet.analytics.tinyman.org
PACT_API_URL=https://api.pact.fi

# Gora Oracle — disabled for MVP
GORA_ORACLE_APP_ID=
GORA_ORACLE_ENABLED=false

# OpenAI — needed for Copilot (Engine 5)
OPENAI_API_KEY=sk-<your-key>

# Google AI Gemini — Copilot fallback (optional)
GOOGLE_AI_API_KEY=

# Veriff / GoPlausible / Transak — stubs work without keys
VERIFF_API_KEY=
VERIFF_API_SECRET=
VERIFF_API_URL=https://stationapi.veriff.com/v1
VERIFF_WEBHOOK_SECRET=
GOPLAUSIBLE_API_URL=https://api.goplausible.com
GOPLAUSIBLE_API_KEY=
GOPLAUSIBLE_FACILITATOR_ADDRESS=
TRANSAK_API_KEY=
TRANSAK_API_SECRET=
TRANSAK_WEBHOOK_SECRET=

# x402 — disabled in dev
X402_USDC_ASA_ID=31566704
X402_ENABLED=false
```

### Where to get API keys

| Service           | URL                                    | Free tier       |
| ----------------- | -------------------------------------- | --------------- |
| Google OAuth      | console.cloud.google.com > Credentials | Free            |
| Turnkey           | app.turnkey.com > API Keys             | Free            |
| CoinGecko         | coingecko.com/en/api                   | 10K calls/month |
| OpenAI            | platform.openai.com/api-keys           | Pay-per-use     |
| Algorand (Nodely) | No key needed                          | Free            |

---

## 2. Infrastructure Setup

```bash
# Start PostgreSQL + Redis
docker compose up -d

# Verify
docker compose ps
# Both should show "healthy"

# Push schema to database
cd apps/copilot-api
npx prisma db push

# Generate Prisma client
npx prisma generate

# Install all deps
cd ../..
pnpm install

# Build shared package
pnpm turbo build --filter=@crestflow/shared

# Start dev server
pnpm turbo dev --filter=copilot-api
```

Verify server is running:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","version":"0.1.0"}

curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"postgres":true,"redis":true}}
```

---

## 3. Running Tests

```bash
cd apps/copilot-api
pnpm test                    # run all tests
pnpm test:watch              # watch mode
npx vitest run test/engines/ # run engine tests only
```

---

## 4. Test Overview

Tests are in `apps/copilot-api/test/engines/`. They test the **actual logic** of each engine — real computations with realistic inputs, not hardcoded assertions. The full test registry with 200+ individual test cases is in `project-context/test.md`.
