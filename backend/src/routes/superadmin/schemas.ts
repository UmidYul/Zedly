import { z } from 'zod';

// Create school
export const createSchoolSchema = z.object({
  name: z.string().min(1, 'School name is required'),
  initialAdmin: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email').optional(),
  }),
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

// Update school status
export const updateSchoolStatusSchema = z.object({
  status: z.enum(['active', 'blocked']),
});

export type UpdateSchoolStatusInput = z.infer<typeof updateSchoolStatusSchema>;

// Update school name
export const updateSchoolNameSchema = z.object({
  name: z.string().min(1, 'School name is required'),
});

export type UpdateSchoolNameInput = z.infer<typeof updateSchoolNameSchema>;

// Update platform settings
export const updateSettingsSchema = z.object({
  smtp: z.object({
    enabled: z.boolean(),
    host: z.string().optional(),
    port: z.number().optional(),
    secure: z.boolean().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    fromEmail: z.string().email().optional(),
    fromName: z.string().optional(),
  }).optional(),
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().optional(),
  }).optional(),
  password_policy: z.object({
    minLength: z.number().min(6).max(32).optional(),
    requireUppercase: z.boolean().optional(),
    requireLowercase: z.boolean().optional(),
    requireNumber: z.boolean().optional(),
    requireSpecial: z.boolean().optional(),
  }).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
