-- Create SuperAdmin user
-- Default password: Admin123! (hash below)
-- IMPORTANT: Change password after first login!

INSERT INTO users (
  id,
  school_id,
  role,
  username,
  email,
  password_hash,
  must_change_password,
  status,
  created_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'superadmin',
  'admin',
  'admin@zedly.uz',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NlXFNvKmXUda', -- Admin123!
  true,
  'active',
  NOW()
) ON CONFLICT DO NOTHING;
