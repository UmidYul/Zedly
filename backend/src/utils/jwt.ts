import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { JWTAccessPayload, JWTRefreshPayload } from '../types';

/**
 * Generate access token (JWT)
 */
export function generateAccessToken(payload: JWTAccessPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.accessExpiresIn as string | number,
    issuer: 'zedly-api',
    audience: 'zedly-client',
  };
  return jwt.sign(payload, config.jwt.accessSecret, options);
}

/**
 * Generate refresh token (JWT)
 */
export function generateRefreshToken(payload: JWTRefreshPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.refreshExpiresIn as string | number,
    issuer: 'zedly-api',
    audience: 'zedly-client',
  };
  return jwt.sign(payload, config.jwt.refreshSecret, options);
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): JWTAccessPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: 'zedly-api',
      audience: 'zedly-client',
    }) as JWTAccessPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('ACCESS_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_ACCESS_TOKEN');
    }
    throw error;
  }
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): JWTRefreshPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'zedly-api',
      audience: 'zedly-client',
    }) as JWTRefreshPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    throw error;
  }
}

/**
 * Generate a secure random token (for password reset, etc.)
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token (for storing refresh tokens, reset tokens, etc.)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calculate token expiration date
 */
export function getTokenExpiration(duration: string): Date {
  const now = new Date();

  // Parse duration string (e.g., "15m", "7d", "1h")
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': // minutes
      now.setMinutes(now.getMinutes() + value);
      break;
    case 'h': // hours
      now.setHours(now.getHours() + value);
      break;
    case 'd': // days
      now.setDate(now.getDate() + value);
      break;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }

  return now;
}
