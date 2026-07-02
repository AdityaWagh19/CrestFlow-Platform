import { createLogger, NotFoundError, getPrisma } from '@crestflow/shared';
import { verifyGoogleIdToken } from './google-auth.service.js';
import { createSubOrgWithWallet } from './turnkey.service.js';
import { signJwt } from '../../lib/jwt.js';
import { portfolioScanQueue } from '../../lib/bullmq.js';

const logger = createLogger('auth');

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    algorandAddress: string | null;
    kycStatus: string;
    isNewUser: boolean;
  };
}

/**
 * Authenticate a user via Google OAuth id_token.
 *
 * Flow:
 * 1. Verify Google id_token → extract googleId, email, name
 * 2. Find existing user by googleId
 * 3. If new user: create Turnkey sub-org + wallet, create User record
 * 4. Sign JWT with user claims
 * 5. If new user: emit PortfolioScanTriggered event
 */
export async function authenticateWithGoogle(idToken: string): Promise<AuthResult> {
  const prisma = getPrisma();

  // 1. Verify Google token
  const googlePayload = await verifyGoogleIdToken(idToken);

  // 2. Check for existing user
  const existingUser = await prisma.user.findUnique({
    where: { googleId: googlePayload.googleId },
  });

  if (existingUser) {
    // Returning user — sign JWT and return
    logger.info({ userId: existingUser.id }, 'Returning user authenticated');

    const accessToken = await signJwt({
      sub: existingUser.id,
      email: existingUser.email,
      algorandAddress: existingUser.algorandAddress ?? '',
      tokenVersion: existingUser.tokenVersion,
    });

    return {
      accessToken,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        algorandAddress: existingUser.algorandAddress,
        kycStatus: existingUser.kycStatus,
        isNewUser: false,
      },
    };
  }

  // 3. New user — provision Turnkey wallet
  // Write provision record first (GAP-08: idempotency tracking)
  const provisionRecord = await prisma.walletProvisionRecord.create({
    data: {
      userId: crypto.randomUUID(), // temporary — will be replaced by actual user ID
      status: 'IN_PROGRESS',
    },
  });

  const walletResult = await createSubOrgWithWallet(googlePayload.email, googlePayload.name);

  // Update provision record with Turnkey results
  await prisma.walletProvisionRecord.update({
    where: { id: provisionRecord.id },
    data: {
      status: 'TURNKEY_CREATED',
      turnkeySubOrgId: walletResult.subOrgId,
      turnkeyWalletId: walletResult.walletId,
      algorandAddress: walletResult.algorandAddress,
    },
  });

  // Create user record with wallet details
  const newUser = await prisma.user.create({
    data: {
      email: googlePayload.email,
      name: googlePayload.name,
      googleId: googlePayload.googleId,
      turnkeySubOrgId: walletResult.subOrgId,
      walletId: walletResult.walletId,
      algorandAddress: walletResult.algorandAddress,
    },
  });

  // Mark provision as completed
  await prisma.walletProvisionRecord.update({
    where: { id: provisionRecord.id },
    data: {
      userId: newUser.id,
      status: 'COMPLETED',
    },
  });

  logger.info(
    { userId: newUser.id, algorandAddress: newUser.algorandAddress },
    'New user created with embedded Algorand wallet',
  );

  // 4. Sign JWT
  const accessToken = await signJwt({
    sub: newUser.id,
    email: newUser.email,
    algorandAddress: newUser.algorandAddress ?? '',
    tokenVersion: newUser.tokenVersion,
  });

  // 5. Trigger portfolio scan for new user (handoff to Engine 1)
  await portfolioScanQueue.add('portfolio-scan', {
    type: 'PortfolioScanTriggered',
    userId: newUser.id,
    algorandAddress: newUser.algorandAddress,
    trigger: 'ONBOARDING',
    timestamp: new Date().toISOString(),
  });

  logger.info({ userId: newUser.id }, 'Portfolio scan triggered for new user');

  return {
    accessToken,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      algorandAddress: newUser.algorandAddress,
      kycStatus: newUser.kycStatus,
      isNewUser: true,
    },
  };
}

/**
 * Get user profile by ID.
 */
export async function getUserById(userId: string) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    algorandAddress: user.algorandAddress,
    kycStatus: user.kycStatus,
  };
}

/**
 * Trigger a portfolio scan for a user (manual or retry).
 */
export async function triggerPortfolioScan(userId: string) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.algorandAddress) {
    throw new NotFoundError('User has no connected wallet');
  }

  await portfolioScanQueue.add('portfolio-scan', {
    type: 'PortfolioScanTriggered',
    userId: user.id,
    algorandAddress: user.algorandAddress,
    trigger: 'MANUAL',
    timestamp: new Date().toISOString(),
  });

  logger.info({ userId }, 'Manual portfolio scan triggered');
}
