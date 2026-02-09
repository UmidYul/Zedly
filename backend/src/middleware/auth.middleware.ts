import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt';
import { findUserById } from '../services/auth.service';
import { JWTAccessPayload, UserRole } from '../types';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTAccessPayload;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authorization?: string): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.substring(7);
}

/**
 * Authentication middleware
 * Verifies JWT access token and attaches user payload to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
    }

    // Verify and decode token
    const payload = verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await findUserById(payload.userId);

    if (!user) {
      return reply.status(401).send({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.status !== 'active') {
      return reply.status(403).send({
        code: 'USER_BLOCKED',
        message: 'User account is blocked',
      });
    }

    // Attach user payload to request
    request.user = payload;
  } catch (error: any) {
    if (error.message === 'ACCESS_TOKEN_EXPIRED') {
      return reply.status(401).send({
        code: 'TOKEN_EXPIRED',
        message: 'Access token expired',
      });
    }

    if (error.message === 'INVALID_ACCESS_TOKEN') {
      return reply.status(401).send({
        code: 'INVALID_TOKEN',
        message: 'Invalid access token',
      });
    }

    console.error('Authentication error:', error);
    return reply.status(500).send({
      code: 'AUTH_ERROR',
      message: 'Authentication failed',
    });
  }
}

/**
 * Role-based authorization middleware factory
 * Creates middleware that checks if user has one of the allowed roles
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }
  };
}

/**
 * School boundary check
 * Ensures user can only access resources within their school
 */
export function requireSchoolAccess(schoolId: string, request: FastifyRequest): void {
  if (!request.user) {
    throw new Error('Authentication required');
  }

  // SuperAdmin can access any school (but access must be logged)
  if (request.user.role === UserRole.SUPERADMIN) {
    return;
  }

  // Other users must match school_id
  if (request.user.schoolId !== schoolId) {
    throw new Error('FORBIDDEN');
  }
}

/**
 * Object ownership check
 * Generic helper for checking if user owns/has access to a resource
 */
export function requireOwnership(
  userId: string,
  ownerId: string,
  allowedRoles: UserRole[] = []
): void {
  // Direct ownership
  if (userId === ownerId) {
    return;
  }

  // Role-based access (e.g., admin can access any user's resource)
  // This will be implemented per-endpoint as needed
  throw new Error('FORBIDDEN');
}

/**
 * Middleware to log SuperAdmin access to school data
 */
export async function logSuperAdminAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.user?.role === UserRole.SUPERADMIN) {
    // TODO: Implement audit logging for SuperAdmin access
    request.log.warn({
      userId: request.user.userId,
      path: request.url,
      method: request.method,
    }, 'SuperAdmin accessing school data');
  }
}
