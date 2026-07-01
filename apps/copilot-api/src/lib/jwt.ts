import * as jose from 'jose';
import { config } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  email: string;
  algorandAddress: string;
  tokenVersion: number;
}

const secret = new TextEncoder().encode(config.JWT_SECRET);
const ISSUER = 'crestflow';
const AUDIENCE = 'crestflow-api';

/**
 * Sign a JWT with user claims.
 * Expires according to JWT_EXPIRES_IN config (default: 7d).
 */
export async function signJwt(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT({
    email: payload.email,
    algorandAddress: payload.algorandAddress,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(secret);
}

/**
 * Verify and decode a JWT. Returns null if invalid or expired.
 */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.sub || !payload['email'] || !payload['algorandAddress']) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload['email'] as string,
      algorandAddress: payload['algorandAddress'] as string,
      tokenVersion: (payload['tokenVersion'] as number) ?? 1,
    };
  } catch {
    return null;
  }
}
