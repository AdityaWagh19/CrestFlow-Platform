import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env.js';
import { createLogger, ValidationError, UnauthorizedError } from '@crestflow/shared';

const logger = createLogger('google-auth');
const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export interface GooglePayload {
  googleId: string;
  email: string;
  name: string | null;
}

/**
 * Verify a Google id_token and extract user claims.
 * Throws UnauthorizedError if token is invalid, expired, or has wrong audience.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  if (!idToken) {
    throw new ValidationError('idToken is required');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      logger.warn('Google token missing required claims (sub or email)');
      throw new UnauthorizedError('Google authentication failed — missing required claims');
    }

    logger.info({ googleId: payload.sub }, 'Google token verified successfully');

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
    };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof UnauthorizedError) {
      throw err;
    }
    logger.error({ err }, 'Google token verification failed');
    throw new UnauthorizedError('Google authentication failed — invalid or expired token');
  }
}
