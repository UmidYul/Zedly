import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSchoolSchema,
  updateSchoolStatusSchema,
  updateSchoolNameSchema,
  updateSettingsSchema,
  CreateSchoolInput,
  UpdateSchoolStatusInput,
  UpdateSchoolNameInput,
  UpdateSettingsInput,
} from './schemas';
import {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchoolStatus,
  updateSchoolName,
  getSchoolStats,
} from '../../services/school.service';
import {
  getAllPlatformSettings,
  updatePlatformSettings,
} from '../../services/settings.service';
import { getAuditLogs } from '../../services/audit.service';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { UserRole, SchoolStatus } from '../../types';
import { createAuditLog } from '../../services/audit.service';
import { sendWelcomeEmail } from '../../services/email.service';

/**
 * GET /superadmin/schools
 * Get all schools with optional filtering
 */
async function getAllSchools(
  request: FastifyRequest<{
    Querystring: {
      status?: SchoolStatus;
      limit?: string;
      offset?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { status, limit, offset } = request.query;

    const result = await getSchools({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return reply.send(result);
  } catch (error) {
    console.error('Get schools error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch schools',
    });
  }
}

/**
 * GET /superadmin/schools/:schoolId
 * Get school by ID with stats
 */
async function getSchool(
  request: FastifyRequest<{ Params: { schoolId: string } }>,
  reply: FastifyReply
) {
  try {
    const { schoolId } = request.params;

    const school = await getSchoolById(schoolId);

    if (!school) {
      return reply.status(404).send({
        code: 'SCHOOL_NOT_FOUND',
        message: 'School not found',
      });
    }

    const stats = await getSchoolStats(schoolId);

    return reply.send({
      ...school,
      stats,
    });
  } catch (error) {
    console.error('Get school error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch school',
    });
  }
}

/**
 * POST /superadmin/schools
 * Create a new school
 */
async function createNewSchool(
  request: FastifyRequest<{ Body: CreateSchoolInput }>,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const data = createSchoolSchema.parse(request.body);

    const result = await createSchool({
      name: data.name,
      initialAdminUsername: data.initialAdmin.username,
      initialAdminEmail: data.initialAdmin.email,
    });

    // Audit log
    await createAuditLog({
      schoolId: null,
      actorUserId: request.user.userId,
      actionType: 'SCHOOL_CREATED',
      entityType: 'school',
      entityId: result.school.id,
      metaJson: {
        schoolName: result.school.name,
        adminUsername: result.adminUser.username,
      },
    });

    // Send welcome email if email provided
    if (result.adminUser.email) {
      try {
        await sendWelcomeEmail(
          result.adminUser.email,
          result.adminUser.username,
          result.temporaryPassword,
          'ru'
        );
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the whole operation
      }
    }

    return reply.status(201).send({
      schoolId: result.school.id,
      school: result.school,
      admin: {
        id: result.adminUser.id,
        username: result.adminUser.username,
        email: result.adminUser.email,
      },
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Create school error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create school',
    });
  }
}

/**
 * PATCH /superadmin/schools/:schoolId
 * Update school status or name
 */
async function updateSchool(
  request: FastifyRequest<{
    Params: { schoolId: string };
    Body: UpdateSchoolStatusInput | UpdateSchoolNameInput;
  }>,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const { schoolId } = request.params;
    const body = request.body as any;

    let updatedSchool;

    if ('status' in body) {
      const data = updateSchoolStatusSchema.parse(body);
      updatedSchool = await updateSchoolStatus(schoolId, data.status as SchoolStatus);

      // Audit log
      await createAuditLog({
        schoolId: null,
        actorUserId: request.user.userId,
        actionType: 'SCHOOL_STATUS_UPDATED',
        entityType: 'school',
        entityId: schoolId,
        metaJson: { newStatus: data.status },
      });
    } else if ('name' in body) {
      const data = updateSchoolNameSchema.parse(body);
      updatedSchool = await updateSchoolName(schoolId, data.name);

      // Audit log
      await createAuditLog({
        schoolId: null,
        actorUserId: request.user.userId,
        actionType: 'SCHOOL_NAME_UPDATED',
        entityType: 'school',
        entityId: schoolId,
        metaJson: { newName: data.name },
      });
    } else {
      return reply.status(400).send({
        code: 'INVALID_REQUEST',
        message: 'Must provide either status or name',
      });
    }

    return reply.send(updatedSchool);
  } catch (error: any) {
    if (error.message === 'SCHOOL_NOT_FOUND') {
      return reply.status(404).send({
        code: 'SCHOOL_NOT_FOUND',
        message: 'School not found',
      });
    }

    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Update school error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to update school',
    });
  }
}

/**
 * GET /superadmin/settings
 * Get all platform settings
 */
async function getSettings(request: FastifyRequest, reply: FastifyReply) {
  try {
    const settings = await getAllPlatformSettings();
    return reply.send(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch settings',
    });
  }
}

/**
 * PUT /superadmin/settings
 * Update platform settings
 */
async function updateSettings(
  request: FastifyRequest<{ Body: UpdateSettingsInput }>,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const data = updateSettingsSchema.parse(request.body);

    // Update settings
    await updatePlatformSettings(data as Record<string, any>);

    // Audit log
    await createAuditLog({
      schoolId: null,
      actorUserId: request.user.userId,
      actionType: 'PLATFORM_SETTINGS_UPDATED',
      entityType: 'platform_settings',
      entityId: 'global',
      metaJson: { updatedKeys: Object.keys(data) },
    });

    const updatedSettings = await getAllPlatformSettings();
    return reply.send(updatedSettings);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Update settings error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to update settings',
    });
  }
}

/**
 * GET /superadmin/audit
 * Get global audit logs
 */
async function getGlobalAudit(
  request: FastifyRequest<{
    Querystring: {
      actionType?: string;
      limit?: string;
      offset?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { actionType, limit, offset } = request.query;

    const result = await getAuditLogs({
      actionType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return reply.send(result);
  } catch (error) {
    console.error('Get audit logs error:', error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch audit logs',
    });
  }
}

/**
 * Register superadmin routes
 */
export async function superadminRoutes(fastify: FastifyInstance) {
  // All routes require authentication and SuperAdmin role
  const preHandler = [authenticate, requireRole(UserRole.SUPERADMIN)];

  // Schools
  fastify.get('/schools', { preHandler }, getAllSchools as any);
  fastify.get('/schools/:schoolId', { preHandler }, getSchool as any);
  fastify.post('/schools', { preHandler }, createNewSchool as any);
  fastify.patch('/schools/:schoolId', { preHandler }, updateSchool as any);

  // Settings
  fastify.get('/settings', { preHandler }, getSettings as any);
  fastify.put('/settings', { preHandler }, updateSettings as any);

  // Audit
  fastify.get('/audit', { preHandler }, getGlobalAudit as any);
}
