-- IronCan: SQL Scripts to Create Test Users & Trainers
-- Run these in the Supabase SQL Editor after running supabase-migration-v2.sql
--
-- NOTE: This script assumes you have already created auth.users via signup flow
-- OR you're substituting the UUIDs from existing users
--
-- To get a user UUID:
-- SELECT id, email FROM auth.users LIMIT 10;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SETUP 1: Create Regular Client User
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replace 'test-client-id' with an actual auth.users ID

INSERT INTO user_profiles (
  user_id,
  email,
  display_name,
  role,
  status,
  onboarding_completed,
  subscription_tier,
  subscription_status,
  height_cm,
  weight_kg,
  age,
  gender,
  activity_level,
  fitness_goal
) VALUES (
  'test-client-id'::uuid,        -- Replace with actual UUID from auth.users
  'client@example.com',           -- Email should match auth.users email
  'John Client',
  'user',
  'approved',
  true,
  'basic',
  'inactive',
  175.5,
  75.0,
  28,
  'male',
  'moderately_active',
  'build_muscle'
) ON CONFLICT (user_id) DO UPDATE SET
  display_name = 'John Client',
  role = 'user',
  status = 'approved',
  onboarding_completed = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SETUP 2: Create Trainer User (Approved)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replace 'test-trainer-id' with an actual auth.users ID

INSERT INTO user_profiles (
  user_id,
  email,
  display_name,
  role,
  status,
  is_trainer,
  trainer_status,
  onboarding_completed,
  subscription_tier,
  subscription_status
) VALUES (
  'test-trainer-id'::uuid,       -- Replace with actual UUID from auth.users
  'trainer@example.com',          -- Email should match auth.users email
  'Jane Trainer',
  'trainer',
  'approved',
  true,
  'approved',
  true,
  'basic',
  'active'
) ON CONFLICT (user_id) DO UPDATE SET
  display_name = 'Jane Trainer',
  role = 'trainer',
  status = 'approved',
  is_trainer = true,
  trainer_status = 'approved',
  onboarding_completed = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SETUP 3: Create Trainer User (Pending Approval)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replace 'test-trainer-pending-id' with an actual auth.users ID

INSERT INTO user_profiles (
  user_id,
  email,
  display_name,
  role,
  status,
  is_trainer,
  trainer_status,
  onboarding_completed,
  subscription_tier,
  subscription_status
) VALUES (
  'test-trainer-pending-id'::uuid, -- Replace with actual UUID from auth.users
  'trainer-pending@example.com',    -- Email should match auth.users email
  'Bob TrainerPending',
  'trainer',
  'pending',
  true,
  'pending',
  true,
  'basic',
  'inactive'
) ON CONFLICT (user_id) DO UPDATE SET
  display_name = 'Bob TrainerPending',
  role = 'trainer',
  status = 'pending',
  is_trainer = true,
  trainer_status = 'pending',
  onboarding_completed = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST SETUP 4: Create Trainer-Client Relationship
-- ═══════════════════════════════════════════════════════════════════════════════
-- Links the client from TEST 1 to the trainer from TEST 2

INSERT INTO trainer_users (
  trainer_id,
  user_id,
  status,
  tier_assigned,
  joined_at
) VALUES (
  (SELECT id FROM user_profiles WHERE email = 'trainer@example.com'),
  'test-client-id'::uuid,
  'joined',
  'basic',
  now()
) ON CONFLICT (trainer_id, user_id) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFY SETUP
-- ═══════════════════════════════════════════════════════════════════════════════

-- View all test profiles created:
-- SELECT id, email, display_name, role, status, is_trainer, trainer_status
-- FROM user_profiles
-- WHERE email LIKE '%@example.com'
-- ORDER BY created_at DESC;

-- View trainer-client relationships:
-- SELECT
--   t.display_name as trainer,
--   u.display_name as client,
--   tu.status,
--   tu.tier_assigned,
--   tu.joined_at
-- FROM trainer_users tu
-- JOIN user_profiles t ON tu.trainer_id = t.id
-- JOIN auth.users u ON tu.user_id = u.id;
