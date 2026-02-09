import { query } from '../db';
import { User, RefreshSession, PasswordResetToken } from '../types';

/**
 * Find user by username and school_id
 */
export async function findUserByUsername(
  username: string,
  schoolId: string | null
): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE username = $1 AND school_id IS NOT DISTINCT FROM $2`,
    [username, schoolId]
  );
  return result.rows[0] || null;
}

/**
 * Find user by ID
 */
export async function findUserById(userId: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Find user by email within school
 */
export async function findUserByEmail(
  email: string,
  schoolId: string | null
): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE email = $1 AND school_id IS NOT DISTINCT FROM $2`,
    [email, schoolId]
  );
  return result.rows[0] || null;
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [userId]
  );
}

/**
 * Update user's password
 */
export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean = false
): Promise<void> {
  await query(
    'UPDATE users SET password_hash = $1, must_change_password = $2 WHERE id = $1',
    [passwordHash, mustChangePassword, userId]
  );
}

/**
 * Create a refresh session
 */
export async function createRefreshSession(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  userAgent?: string,
  ip?: string
): Promise<RefreshSession> {
  const result = await query<RefreshSession>(
    `INSERT INTO refresh_sessions
     (user_id, refresh_token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, tokenHash, expiresAt, userAgent || null, ip || null]
  );
  return result.rows[0];
}

/**
 * Find refresh session by ID
 */
export async function findRefreshSession(sessionId: string): Promise<RefreshSession | null> {
  const result = await query<RefreshSession>(
    'SELECT * FROM refresh_sessions WHERE id = $1 AND revoked_at IS NULL',
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Verify refresh session token hash
 */
export async function verifyRefreshSession(
  sessionId: string,
  tokenHash: string
): Promise<RefreshSession | null> {
  const result = await query<RefreshSession>(
    `SELECT * FROM refresh_sessions
     WHERE id = $1
     AND refresh_token_hash = $2
     AND revoked_at IS NULL
     AND expires_at > NOW()`,
    [sessionId, tokenHash]
  );
  return result.rows[0] || null;
}

/**
 * Revoke a refresh session
 */
export async function revokeRefreshSession(sessionId: string): Promise<void> {
  await query(
    'UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = $1',
    [sessionId]
  );
}

/**
 * Revoke all refresh sessions for a user
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await query(
    'UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

/**
 * Clean up expired refresh sessions
 */
export async function cleanExpiredSessions(): Promise<number> {
  const result = await query(
    'DELETE FROM refresh_sessions WHERE expires_at < NOW()',
    []
  );
  return result.rowCount || 0;
}

/**
 * Create password reset token
 */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<PasswordResetToken> {
  const result = await query<PasswordResetToken>(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

/**
 * Find password reset token
 */
export async function findPasswordResetToken(
  tokenHash: string
): Promise<PasswordResetToken | null> {
  const result = await query<PasswordResetToken>(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = $1
     AND used_at IS NULL
     AND expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

/**
 * Mark password reset token as used
 */
export async function markPasswordResetTokenUsed(tokenId: string): Promise<void> {
  await query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
    [tokenId]
  );
}

/**
 * Clean up expired password reset tokens
 */
export async function cleanExpiredPasswordResetTokens(): Promise<number> {
  const result = await query(
    'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL',
    []
  );
  return result.rowCount || 0;
}
