// Core enums and types aligned with database schema

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

export enum SchoolStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export enum ClassStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum QuestionType {
  SINGLE = 'single',
  MULTI = 'multi',
  NUMBER = 'number',
}

export enum QuestionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum TestStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum AssignmentStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

export enum AttemptStatus {
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  EXPIRED = 'expired',
}

export enum ExportJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
}

export enum ExportJobType {
  TEST_REPORT = 'test_report',
  CLASS_REPORT = 'class_report',
  SCHOOL_SUMMARY = 'school_summary',
}

export enum NotificationChannel {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
}

export enum NotificationJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
}

// Database models matching schema

export interface School {
  id: string;
  name: string;
  status: SchoolStatus;
  created_at: Date;
}

export interface User {
  id: string;
  school_id: string | null;
  role: UserRole;
  username: string;
  email: string | null;
  password_hash: string;
  must_change_password: boolean;
  status: UserStatus;
  last_login_at: Date | null;
  created_at: Date;
}

export interface Class {
  id: string;
  school_id: string;
  grade: number;
  letter: string;
  name: string;
  status: ClassStatus;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  grade: number | null;
  active: boolean;
}

export interface Topic {
  id: string;
  school_id: string;
  subject_id: string;
  name: string;
  parent_topic_id: string | null;
}

export interface Question {
  id: string;
  school_id: string;
  subject_id: string;
  type: QuestionType;
  text: string;
  correct_number: number | null;
  created_by_user_id: string;
  status: QuestionStatus;
  created_at: Date;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface QuestionMedia {
  id: string;
  question_id: string;
  media_type: 'image';
  url: string;
  sort_order: number;
}

export interface Tag {
  id: string;
  school_id: string;
  name: string;
}

export interface Test {
  id: string;
  school_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  max_score: number;
  attempts_allowed: number;
  time_limit_minutes: number | null;
  status: TestStatus;
  created_by_user_id: string;
  owner_teacher_user_id: string | null;
}

export interface TestQuestion {
  test_id: string;
  question_id: string;
  points: number;
  sort_order: number;
}

export interface Assignment {
  id: string;
  school_id: string;
  test_id: string;
  class_id: string;
  assigned_by_user_id: string;
  starts_at: Date | null;
  ends_at: Date | null;
  status: AssignmentStatus;
  created_at: Date;
}

export interface Attempt {
  id: string;
  assignment_id: string;
  student_user_id: string;
  attempt_no: number;
  started_at: Date;
  finished_at: Date | null;
  status: AttemptStatus;
  earned_points: number | null;
  total_points: number | null;
  score: number | null;
  is_timeout: boolean;
}

export interface AttemptAnswer {
  attempt_id: string;
  question_id: string;
  answer_payload: AnswerPayload;
  is_correct: boolean | null;
  points_awarded: number | null;
  answered_at: Date;
}

export type AnswerPayload =
  | { type: 'single'; selectedOptionId: string }
  | { type: 'multi'; selectedOptionIds: string[] }
  | { type: 'number'; numberValue: number };

export interface AuditLog {
  id: string;
  school_id: string | null;
  actor_user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  meta_json: Record<string, any>;
  created_at: Date;
}

export interface ExportJob {
  id: string;
  school_id: string;
  requested_by_user_id: string;
  type: ExportJobType;
  params_json: Record<string, any>;
  status: ExportJobStatus;
  file_path_or_url: string | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface NotificationJob {
  id: string;
  school_id: string | null;
  channel: NotificationChannel;
  target: string;
  template_key: string;
  payload_json: Record<string, any>;
  status: NotificationJobStatus;
  created_at: Date;
  finished_at: Date | null;
}

export interface PlatformSetting {
  key: string;
  value_json: Record<string, any>;
  updated_at: Date;
}

export interface RefreshSession {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface TelegramLink {
  user_id: string;
  chat_id: string;
  linked_at: Date;
}

// JWT Payload types
export interface JWTAccessPayload {
  userId: string;
  role: UserRole;
  schoolId: string | null;
}

export interface JWTRefreshPayload {
  userId: string;
  sessionId: string;
}

// API Error type
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
