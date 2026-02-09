// User & Auth Types
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export interface User {
  id: string;
  school_id: string | null;
  role: UserRole;
  username: string;
  email: string | null;
  must_change_password: boolean;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// School Types
export enum SchoolStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export interface School {
  id: string;
  name: string;
  status: SchoolStatus;
  created_at: string;
}

// Class Types
export interface Class {
  id: string;
  school_id: string;
  name: string;
  parallel: number;
  letter: string;
  created_at: string;
}

// Student Profile
export interface StudentProfile {
  id: string;
  user_id: string;
  class_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  created_at: string;
}

// Teacher Profile
export interface TeacherProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  subject: string | null;
  created_at: string;
}

// API Error
export interface APIError {
  message: string;
  code?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
