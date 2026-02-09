import { query } from '../db';
import { School, User, SchoolStatus, UserRole, UserStatus } from '../types';
import { hashPassword } from '../utils/password';
import { generateSecureToken } from '../utils/jwt';

export interface CreateSchoolParams {
  name: string;
  initialAdminUsername: string;
  initialAdminEmail?: string;
}

export interface CreateSchoolResult {
  school: School;
  adminUser: User;
  temporaryPassword: string;
}

/**
 * Create a new school with initial admin user
 */
export async function createSchool(params: CreateSchoolParams): Promise<CreateSchoolResult> {
  // Generate temporary password
  const temporaryPassword = generateSecureToken(8);
  const passwordHash = await hashPassword(temporaryPassword);

  // Insert school
  const schoolResult = await query<School>(
    `INSERT INTO schools (name, status)
     VALUES ($1, $2)
     RETURNING *`,
    [params.name, SchoolStatus.ACTIVE]
  );
  const school = schoolResult.rows[0];

  // Insert admin user
  const adminResult = await query<User>(
    `INSERT INTO users
     (school_id, role, username, email, password_hash, must_change_password, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      school.id,
      UserRole.ADMIN,
      params.initialAdminUsername,
      params.initialAdminEmail || null,
      passwordHash,
      true, // Must change password on first login
      UserStatus.ACTIVE,
    ]
  );
  const adminUser = adminResult.rows[0];

  return {
    school,
    adminUser,
    temporaryPassword,
  };
}

/**
 * Get all schools with optional filtering
 */
export async function getSchools(params?: {
  status?: SchoolStatus;
  limit?: number;
  offset?: number;
}): Promise<{ schools: School[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM schools ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get schools
  const limit = params?.limit || 50;
  const offset = params?.offset || 0;

  const schoolsResult = await query<School>(
    `SELECT * FROM schools ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  return {
    schools: schoolsResult.rows,
    total,
  };
}

/**
 * Get school by ID
 */
export async function getSchoolById(schoolId: string): Promise<School | null> {
  const result = await query<School>(
    'SELECT * FROM schools WHERE id = $1',
    [schoolId]
  );
  return result.rows[0] || null;
}

/**
 * Update school status
 */
export async function updateSchoolStatus(
  schoolId: string,
  status: SchoolStatus
): Promise<School> {
  const result = await query<School>(
    'UPDATE schools SET status = $1 WHERE id = $2 RETURNING *',
    [status, schoolId]
  );

  if (result.rows.length === 0) {
    throw new Error('SCHOOL_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Update school name
 */
export async function updateSchoolName(
  schoolId: string,
  name: string
): Promise<School> {
  const result = await query<School>(
    'UPDATE schools SET name = $1 WHERE id = $2 RETURNING *',
    [name, schoolId]
  );

  if (result.rows.length === 0) {
    throw new Error('SCHOOL_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Get school statistics
 */
export async function getSchoolStats(schoolId: string) {
  const [userCounts, classCounts, testCounts] = await Promise.all([
    query<{ role: string; count: string }>(
      'SELECT role, COUNT(*) as count FROM users WHERE school_id = $1 GROUP BY role',
      [schoolId]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) as count FROM classes WHERE school_id = $1',
      [schoolId]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) as count FROM tests WHERE school_id = $1',
      [schoolId]
    ),
  ]);

  const users = userCounts.rows.reduce((acc: Record<string, number>, row) => {
    acc[row.role] = parseInt(row.count, 10);
    return acc;
  }, {});

  return {
    users: {
      admin: users.admin || 0,
      teacher: users.teacher || 0,
      student: users.student || 0,
      total: Object.values(users).reduce((sum: number, count) => sum + count, 0) as number,
    },
    classes: parseInt(classCounts.rows[0]?.count || '0', 10),
    tests: parseInt(testCounts.rows[0]?.count || '0', 10),
  };
}
