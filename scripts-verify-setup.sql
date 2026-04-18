-- IronCan: Verification & Diagnostics Script
-- Run this to check your database setup and troubleshoot issues

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. CHECK SCHEMA: Is the migration applied?
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check if 'trainer' role is allowed
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'user_profiles'
AND constraint_name LIKE '%role%';

-- Check user_profiles columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CHECK AUTH USERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- List all auth users with their IDs (for copy-paste into scripts)
SELECT
  id,
  email,
  confirmed_at IS NOT NULL as email_confirmed,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CHECK PROFILES
-- ═══════════════════════════════════════════════════════════════════════════════

-- All profiles with their auth status
SELECT
  p.id as profile_id,
  p.email,
  p.display_name,
  p.role,
  p.status,
  p.is_trainer,
  p.trainer_status,
  u.confirmed_at,
  CASE
    WHEN p.role = 'trainer' AND u.confirmed_at IS NULL THEN '⚠️ Trainer auth not confirmed'
    WHEN p.role = 'trainer' AND u.confirmed_at IS NOT NULL AND p.status = 'pending' THEN '⏳ Trainer pending approval'
    WHEN p.role = 'trainer' AND p.status = 'approved' THEN '✅ Trainer approved'
    WHEN p.role = 'user' AND p.status = 'approved' THEN '✅ Client ready'
    WHEN p.role = 'user' AND p.status = 'pending' THEN '⏳ Client pending approval'
    ELSE '❓ Unknown state'
  END as status_check
FROM user_profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
ORDER BY p.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. CHECK TRAINER-CLIENT RELATIONSHIPS
-- ═══════════════════════════════════════════════════════════════════════════════

-- All active trainer-client pairs
SELECT
  t.id as trainer_id,
  t.email as trainer_email,
  t.display_name as trainer_name,
  c.id as client_id,
  c.email as client_email,
  c.display_name as client_name,
  tu.status as relationship_status,
  tu.tier_assigned,
  tu.joined_at
FROM trainer_users tu
LEFT JOIN user_profiles t ON tu.trainer_id = t.id
LEFT JOIN user_profiles c ON tu.user_id = c.user_id
ORDER BY tu.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. HEALTH CHECK: Data Integrity
-- ═══════════════════════════════════════════════════════════════════════════════

-- Orphaned profiles (user deleted but profile remains)
SELECT 'Orphaned profiles' as issue, COUNT(*) as count
FROM user_profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
UNION ALL
-- Profiles missing auth users
SELECT 'Profiles missing required fields', COUNT(*)
FROM user_profiles
WHERE email IS NULL OR role IS NULL
UNION ALL
-- Trainers without status
SELECT 'Trainers missing trainer_status', COUNT(*)
FROM user_profiles
WHERE is_trainer = true AND trainer_status IS NULL
UNION ALL
-- Broken trainer-client links
SELECT 'Broken trainer references', COUNT(*)
FROM trainer_users tu
WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = tu.trainer_id)
UNION ALL
-- Subscribers without subscription records (grace period ok)
SELECT 'Users without subscription record', COUNT(*)
FROM user_profiles p
WHERE status = 'approved' AND role = 'user'
AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. MIGRATION STATUS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check if migration v2 was applied by looking for new tables
SELECT
  'trainer_users table' as check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trainer_users') as exists
UNION ALL
SELECT 'subscriptions table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions')
UNION ALL
SELECT 'payments table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments')
UNION ALL
SELECT 'upgrade_requests table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'upgrade_requests')
UNION ALL
SELECT 'is_trainer column exists', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'user_profiles' AND column_name = 'is_trainer'
)
UNION ALL
SELECT 'trainer_status column exists', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'user_profiles' AND column_name = 'trainer_status'
);
