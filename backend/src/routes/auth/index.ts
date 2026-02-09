import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  LoginInput,
  RefreshInput,
  LogoutInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './schemas';
import {
  findUserByUsername,
  findUserByEmail,
  updateLastLogin,
  createRefreshSession,
  verifyRefreshSession,
  revokeRefreshSession,
  findUserById,
  updateUserPassword,
  createPasswordResetToken,
  findPasswordResetToken,
  markPasswordResetTokenUsed,
} from '../../services/auth.service';
import { hashPassword, verifyPassword, validatePassword } from '../../utils/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateSecureToken,
  hashToken,
  getTokenExpiration,
} from '../../utils/jwt';
import { config } from '../../config';
import { authenticate } from '../../middleware/auth.middleware';
import { createAuditLog } from '../../services/audit.service';
import { UserRole } from '../../types';
import { sendPasswordResetEmail } from '../../services/email.service';

/**
 * POST /auth/login
 * Authenticates user and returns access + refresh tokens
 */
async function login(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply
) {
  try {
    const { username, password } = loginSchema.parse(request.body);

    // Find user by username (SuperAdmin has null schoolId)
    // For now, we'll try to find user without school context
    // In production, you might want to add school context to login
    const user = await findUserByUsername(username, null);

    if (!user) {
      // Consistent error message to prevent user enumeration
      return reply.status(401).send({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return reply.status(401).send({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    // Check if user is blocked
    if (user.status !== 'active') {
      return reply.status(403).send({
        code: 'USER_BLOCKED',
        message: 'Your account has been blocked',
      });
    }

    // Generate tokens
    const accessPayload = {
      userId: user.id,
      role: user.role as UserRole,
      schoolId: user.school_id,
    };

    const accessToken = generateAccessToken(accessPayload);

    // Create refresh session
    const refreshTokenRaw = generateSecureToken(32);
    const refreshTokenHash = hashToken(refreshTokenRaw);
    const refreshExpiresAt = getTokenExpiration(config.jwt.refreshExpiresIn);

    const session = await createRefreshSession(
      user.id,
      refreshTokenHash,
      refreshExpiresAt,
      request.headers['user-agent'],
      request.ip
    );

    // Encode refresh token (sessionId:rawToken)
    const refreshToken = generateRefreshToken({
      userId: user.id,
      sessionId: session.id,
    });

    // Update last login
    await updateLastLogin(user.id);

    // Audit log
    await createAuditLog({
      schoolId: user.school_id,
      actorUserId: user.id,
      actionType: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        schoolId: user.school_id,
        mustChangePassword: user.must_change_password,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    request.log.error('Login error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred during login',
    });
  }
}

/**
 * POST /auth/refresh
 * Refreshes access token using refresh token
 */
async function refresh(
  request: FastifyRequest<{ Body: RefreshInput }>,
  reply: FastifyReply
) {
  try {
    const { refreshToken } = refreshSchema.parse(request.body);

    // Decode refresh token
    const payload = verifyRefreshToken(refreshToken);
    const refreshTokenHash = hashToken(refreshToken);

    // Verify session
    const session = await verifyRefreshSession(payload.sessionId, refreshTokenHash);

    if (!session) {
      return reply.status(401).send({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    // Get user
    const user = await findUserById(session.user_id);

    if (!user || user.status !== 'active') {
      return reply.status(401).send({
        code: 'USER_NOT_FOUND',
        message: 'User not found or blocked',
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role as UserRole,
      schoolId: user.school_id,
    });

    return reply.send({ accessToken });
  } catch (error: any) {
    if (error.message === 'REFRESH_TOKEN_EXPIRED') {
      return reply.status(401).send({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token expired',
      });
    }

    if (error.message === 'INVALID_REFRESH_TOKEN') {
      return reply.status(401).send({
        code: 'INVALID_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    request.log.error('Refresh error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred during token refresh',
    });
  }
}

/**
 * POST /auth/logout
 * Revokes refresh token
 */
async function logout(
  request: FastifyRequest<{ Body: LogoutInput }>,
  reply: FastifyReply
) {
  try {
    const { refreshToken } = logoutSchema.parse(request.body);

    // Decode to get session ID
    const payload = verifyRefreshToken(refreshToken);

    // Revoke session
    await revokeRefreshSession(payload.sessionId);

    return reply.send({ ok: true });
  } catch (error: any) {
    // Even if token is invalid, we return success (idempotent logout)
    return reply.send({ ok: true });
  }
}

/**
 * POST /auth/password/change
 * Change password for authenticated user
 */
async function changePassword(
  request: FastifyRequest<{ Body: ChangePasswordInput }>,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const { oldPassword, newPassword } = changePasswordSchema.parse(request.body);

    // Get user
    const user = await findUserById(request.user.userId);

    if (!user) {
      return reply.status(404).send({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Verify old password
    const isValid = await verifyPassword(oldPassword, user.password_hash);

    if (!isValid) {
      return reply.status(400).send({
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    // Validate new password
    const validation = validatePassword(newPassword, config.passwordPolicy);

    if (!validation.valid) {
      return reply.status(400).send({
        code: 'WEAK_PASSWORD',
        message: 'Password does not meet policy requirements',
        details: validation.errors,
      });
    }

    // Hash and update password
    const newPasswordHash = await hashPassword(newPassword);
    await updateUserPassword(user.id, newPasswordHash, false);

    // Audit log
    await createAuditLog({
      schoolId: user.school_id,
      actorUserId: user.id,
      actionType: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
    });

    return reply.send({ ok: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    request.log.error('Change password error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred while changing password',
    });
  }
}

/**
 * POST /auth/password/forgot
 * Send password reset email
 */
async function forgotPassword(
  request: FastifyRequest<{ Body: ForgotPasswordInput }>,
  reply: FastifyReply
) {
  try {
    const { usernameOrEmail } = forgotPasswordSchema.parse(request.body);

    // Try to find user by email or username
    let user = null;

    // Check if it's an email
    if (usernameOrEmail.includes('@')) {
      user = await findUserByEmail(usernameOrEmail, null);
    } else {
      user = await findUserByUsername(usernameOrEmail, null);
    }

    // Always return success to prevent user enumeration
    // Actual email is only sent if user exists and has email
    if (user && user.email) {
      // Generate reset token
      const resetToken = generateSecureToken(32);
      const tokenHash = hashToken(resetToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save token to database
      await createPasswordResetToken(user.id, tokenHash, expiresAt);

      // Send email
      try {
        await sendPasswordResetEmail(user.email, resetToken, 'ru');

        // Audit log
        await createAuditLog({
          schoolId: user.school_id,
          actorUserId: user.id,
          actionType: 'PASSWORD_RESET_REQUESTED',
          entityType: 'user',
          entityId: user.id,
        });
      } catch (emailError) {
        request.log.error('Failed to send password reset email:', emailError);
        // Don't reveal email failure to user
      }
    }

    // Always return consistent response
    return reply.send({
      ok: true,
      message: 'If your email is registered, you will receive a password reset link',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    request.log.error('Forgot password error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred',
    });
  }
}

/**
 * POST /auth/password/reset
 * Reset password using token
 */
async function resetPassword(
  request: FastifyRequest<{ Body: ResetPasswordInput }>,
  reply: FastifyReply
) {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(request.body);

    // Hash token to match database
    const tokenHash = hashToken(token);

    // Find valid token
    const resetToken = await findPasswordResetToken(tokenHash);

    if (!resetToken) {
      return reply.status(400).send({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token',
      });
    }

    // Get user
    const user = await findUserById(resetToken.user_id);

    if (!user) {
      return reply.status(404).send({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Validate new password
    const validation = validatePassword(newPassword, config.passwordPolicy);

    if (!validation.valid) {
      return reply.status(400).send({
        code: 'WEAK_PASSWORD',
        message: 'Password does not meet policy requirements',
        details: validation.errors,
      });
    }

    // Hash and update password
    const newPasswordHash = await hashPassword(newPassword);
    await updateUserPassword(user.id, newPasswordHash, false);

    // Mark token as used
    await markPasswordResetTokenUsed(resetToken.id);

    // Audit log
    await createAuditLog({
      schoolId: user.school_id,
      actorUserId: user.id,
      actionType: 'PASSWORD_RESET_COMPLETED',
      entityType: 'user',
      entityId: user.id,
    });

    return reply.send({ ok: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    request.log.error('Reset password error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred while resetting password',
    });
  }
}

/**
 * Register auth routes
 */
export async function authRoutes(fastify: FastifyInstance) {
  // Public routes
  fastify.post('/login', login);
  fastify.post('/refresh', refresh);
  fastify.post('/logout', logout);
  fastify.post('/password/forgot', forgotPassword);
  fastify.post('/password/reset', resetPassword);

  // Protected routes
  fastify.post('/password/change', { preHandler: authenticate }, changePassword);
}
