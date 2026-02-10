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
// STUDENTS MANAGEMENT
// =============================================================================

// Get all students in school
async function getStudents(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const result = await query(
      `SELECT u.id, u.username, u.email, u.status, u.created_at,
              sp.first_name, sp.last_name, sp.date_of_birth, sp.class_id,
              c.name as class_name
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN classes c ON c.id = sp.class_id
       WHERE u.school_id = $1 AND u.role = 'student'
       ORDER BY sp.last_name, sp.first_name`,
      [user.schoolId]
    );

    return reply.send({ students: result.rows });
  } catch (error) {
    console.error('Get students error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Create student
const createStudentSchema = z.object({
  username: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  classId: z.string().uuid().optional(),
});

async function createStudent(
  request: FastifyRequest<{
    Body: z.infer<typeof createStudentSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const validation = createStudentSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { username, email, password, firstName, lastName, dateOfBirth, classId } = validation.data;

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
       VALUES ($1, 'student', $2, $3, $4, true, 'active')
       RETURNING id`,
      [user.schoolId, username, email || null, passwordHash]
    );

    const studentId = userResult.rows[0].id;

    // Create student profile
    await query(
      `INSERT INTO student_profiles (user_id, first_name, last_name, date_of_birth, class_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [studentId, firstName, lastName, dateOfBirth || null, classId || null]
    );

    return reply.code(201).send({ message: 'Student created', studentId });
  } catch (error) {
    console.error('Create student error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Update student
const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  classId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'blocked']).optional(),
});

async function updateStudent(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof updateStudentSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;
    const validation = updateStudentSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { firstName, lastName, dateOfBirth, classId, status } = validation.data;

    // Verify student belongs to this school
    const studentCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
      [id, user.schoolId, 'student']
    );

    if (studentCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Student not found' });
    }

    // Update user status if provided
    if (status) {
      await query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
    }

    // Update student profile
    if (firstName || lastName || dateOfBirth !== undefined || classId !== undefined) {
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
      if (dateOfBirth !== undefined) {
        updates.push(`date_of_birth = $${paramCount++}`);
        values.push(dateOfBirth);
      }
      if (classId !== undefined) {
        updates.push(`class_id = $${paramCount++}`);
        values.push(classId);
      }

      if (updates.length > 0) {
        values.push(id);
        await query(
          `UPDATE student_profiles SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
          values
        );
      }
    }

    return reply.send({ message: 'Student updated' });
  } catch (error) {
    console.error('Update student error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Delete student
async function deleteStudent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;

    // Verify student belongs to this school
    const studentCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = $3',
      [id, user.schoolId, 'student']
    );

    if (studentCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Student not found' });
    }

    // Delete student (cascade will delete profile)
    await query('DELETE FROM users WHERE id = $1', [id]);

    return reply.send({ message: 'Student deleted' });
  } catch (error) {
    console.error('Delete student error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// =============================================================================
// CLASSES MANAGEMENT
// =============================================================================

// Get all classes in school
async function getClasses(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id) as student_count
       FROM classes c
       WHERE c.school_id = $1
       ORDER BY c.parallel, c.letter`,
      [user.schoolId]
    );

    return reply.send({ classes: result.rows });
  } catch (error) {
    console.error('Get classes error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Create class
const createClassSchema = z.object({
  name: z.string().min(1),
  parallel: z.number().int().min(1).max(11),
  letter: z.string().length(1),
});

async function createClass(
  request: FastifyRequest<{
    Body: z.infer<typeof createClassSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const validation = createClassSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { name, parallel, letter } = validation.data;

    // Create class
    const result = await query(
      `INSERT INTO classes (school_id, name, parallel, letter)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [user.schoolId, name, parallel, letter]
    );

    return reply.code(201).send({ message: 'Class created', classId: result.rows[0].id });
  } catch (error) {
    console.error('Create class error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Update class
const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  parallel: z.number().int().min(1).max(11).optional(),
  letter: z.string().length(1).optional(),
});

async function updateClass(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof updateClassSchema>;
  }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;
    const validation = updateClassSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ message: 'Validation error', errors: validation.error.errors });
    }

    const { name, parallel, letter } = validation.data;

    // Verify class belongs to this school
    const classCheck = await query(
      'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
      [id, user.schoolId]
    );

    if (classCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Class not found' });
    }

    // Update class
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (parallel) {
      updates.push(`parallel = $${paramCount++}`);
      values.push(parallel);
    }
    if (letter) {
      updates.push(`letter = $${paramCount++}`);
      values.push(letter);
    }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE classes SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
    }

    return reply.send({ message: 'Class updated' });
  } catch (error) {
    console.error('Update class error:', error);
    return reply.code(500).send({ message: 'Server error' });
  }
}

// Delete class
async function deleteClass(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const user = request.user;
    if (!user?.schoolId) {
      return reply.code(403).send({ message: 'School ID required' });
    }

    const { id } = request.params;

    // Verify class belongs to this school
    const classCheck = await query(
      'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
      [id, user.schoolId]
    );

    if (classCheck.rows.length === 0) {
      return reply.code(404).send({ message: 'Class not found' });
    }

    // Check if class has students
    const studentCount = await query(
      'SELECT COUNT(*) FROM student_profiles WHERE class_id = $1',
      [id]
    );

    if (parseInt(studentCount.rows[0].count) > 0) {
      return reply.code(400).send({ message: 'Cannot delete class with students' });
    }

    // Delete class
    await query('DELETE FROM classes WHERE id = $1', [id]);

    return reply.send({ message: 'Class deleted' });
  } catch (error) {
    console.error('Delete class error:', error);
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

  // Students
  fastify.get('/students', { preHandler }, getStudents as any);
  fastify.post('/students', { preHandler }, createStudent as any);
  fastify.put('/students/:id', { preHandler }, updateStudent as any);
  fastify.delete('/students/:id', { preHandler }, deleteStudent as any);

  // Classes
  fastify.get('/classes', { preHandler }, getClasses as any);
  fastify.post('/classes', { preHandler }, createClass as any);
  fastify.put('/classes/:id', { preHandler }, updateClass as any);
  fastify.delete('/classes/:id', { preHandler }, deleteClass as any);
}
