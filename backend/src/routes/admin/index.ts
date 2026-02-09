import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../db';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import { UserRole } from '../../types';
import { hashPassword } from '../../utils/password';

// =============================================================================
// TEACHERS MANAGEMENT
// =============================================================================

// Get all teachers in school
async function getTeachers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const result = await query(
      `SELECT u.id, u.username, u.email, u.status, u.created_at,
              tp.first_name, tp.last_name, tp.subject
       FROM users u
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.school_id = $1 AND u.role = 'teacher'
       ORDER BY tp.last_name, tp.first_name`,
      [user.schoolId]
    );

    return reply.send({ teachers: result.rows });
  } catch (error) {
    console.error('Get teachers error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Create teacher
const createTeacherSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  subject: z.string().optional(),
});

async function createTeacher(
  request: FastifyRequest<{
    Body: z.infer<typeof createTeacherSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const validation = createTeacherSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { username, email, password, firstName, lastName, subject } = validation.data;

    // Check if username exists in school
    const existing = await query(
      'SELECT id FROM users WHERE school_id = $1 AND username = $2',
      [user.schoolId, username]
    );

    if (existing.rows.length > 0) {
      return reply.code(400).send({ message: 'Username already exists in this school' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userResult = await query(
      `INSERT INTO users (school_id, role, username, email, password_hash, must_change_password, status)
       VALUES ($1, 'teacher', $2, $3, $4, true, 'active')
       RETURNING id`,
      [user.schoolId, username, email, passwordHash]
    );

    const teacherId = userResult.rows[0].id;

    // Create teacher profile
    await query(
      `INSERT INTO teacher_profiles (user_id, first_name, last_name, subject)
       VALUES ($1, $2, $3, $4)`,
      [teacherId, firstName, lastName, subject || null]
    );

    return reply.code(201).send({ message: 'Teacher created', teacherId });
  } catch (error) {
    console.error('Create teacher error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Update teacher
const updateTeacherSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  subject: z.string().optional(),
  status: z.enum(['active', 'blocked']).optional(),
});

async function updateTeacher(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof updateTeacherSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;
    const validation = updateTeacherSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { firstName, lastName, subject, status } = validation.data;

    // Verify teacher belongs to this school
    const teacherCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
      [id, user.schoolId, 'teacher']
    );

    if (teacherCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Teacher not found' });
    }

    // Update user status if provided
    if (status) {
      await query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
    }

    // Update teacher profile
    if (firstName || lastName || subject !== undefined) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (firstName) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(firstName);
      }
      if (lastName) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(lastName);
      }
      if (subject !== undefined) {
        updates.push(`subject = $${paramCount++}`);
        values.push(subject);
      }

      if (updates.length > 0) {
        values.push(id);
        await query(
          `UPDATE teacher_profiles SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
          values
        );
      }
    }

    return reply.send({ message: 'Teacher updated' });
  } catch (error) {
    console.error('Update teacher error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Delete teacher
async function deleteTeacher(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;

    // Verify teacher belongs to this school
    const teacherCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
      [id, user.schoolId, 'teacher']
    );

    if (teacherCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Teacher not found' });
    }

    // Delete teacher (cascade will delete profile)
    await query('DELETE FROM users WHERE id = $1', [id]);

    return reply.send({ message: 'Teacher deleted' });
  } catch (error) {
    console.error('Delete teacher error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// =============================================================================
// ROUTES REGISTRATION
// =============================================================================

export async function adminRoutes(fastify: FastifyInstance) {
  const preHandler = [authenticate, requireRole(UserRole.ADMIN)];

  // Teachers
  fastify.get('/teachers', { preHandler }, getTeachers as any);
  fastify.post('/teachers', { preHandler }, createTeacher as any);
  fastify.put('/teachers/:id', { preHandler }, updateTeacher as any);
  fastify.delete('/teachers/:id', { preHandler }, deleteTeacher as any);
}
