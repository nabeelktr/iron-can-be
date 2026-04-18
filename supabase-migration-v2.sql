-- IronCan v2.0: Multi-Trainer, Subscription-Based Platform
-- Run this in the Supabase SQL Editor as a single transaction
-- IMPORTANT: Deploy backend code changes (admin -> super_admin) BEFORE running this

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1A. Rename admin -> super_admin role
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
UPDATE user_profiles SET role = 'super_admin' WHERE role = 'admin';
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('super_admin', 'trainer', 'user'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1B. Add new columns to user_profiles
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_trainer_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_trainer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trainer_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trainer_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_subscription_tier_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_subscription_tier_check
  CHECK (subscription_tier IN ('basic', 'premium'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_subscription_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'paused', 'cancelled'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_trainer_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_trainer_status_check
  CHECK (trainer_status IN ('pending', 'approved', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_tier ON user_profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_assigned_trainer ON user_profiles(assigned_trainer_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_trainer_status ON user_profiles(trainer_status) WHERE is_trainer = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1C. Create trainer_users table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trainer_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at      timestamptz DEFAULT now(),
  joined_at       timestamptz,
  status          text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'joined', 'rejected', 'removed')),
  tier_assigned   text NOT NULL DEFAULT 'premium',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trainer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trainer_users_trainer_id ON trainer_users(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_users_user_id ON trainer_users(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_users_status ON trainer_users(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1D. Create subscriptions table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     text NOT NULL CHECK (tier IN ('basic', 'premium')),
  status                   text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  billing_cycle_start      date NOT NULL,
  billing_cycle_end        date NOT NULL,
  auto_renew               boolean NOT NULL DEFAULT true,
  payment_method_id        text,
  razorpay_subscription_id text UNIQUE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1E. Create payments table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id       uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_paise          integer NOT NULL,
  currency              text NOT NULL DEFAULT 'INR',
  tier                  text NOT NULL CHECK (tier IN ('basic', 'premium')),
  billing_period_start  date NOT NULL,
  billing_period_end    date NOT NULL,
  payment_gateway       text NOT NULL DEFAULT 'razorpay'
    CHECK (payment_gateway IN ('razorpay', 'website')),
  transaction_id        text UNIQUE,
  order_id              text UNIQUE,
  receipt_id            text,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tier ON payments(tier);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1F. Create upgrade_requests table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_tier            text NOT NULL CHECK (from_tier IN ('basic')),
  to_tier              text NOT NULL CHECK (to_tier IN ('premium')),
  requested_trainer_id uuid REFERENCES user_profiles(id),
  trainer_approved     boolean DEFAULT null,
  approval_notes       text,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user_id ON upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_trainer_id ON upgrade_requests(requested_trainer_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1G. Alter existing diet tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- diet_plans: add trainer and template fields
ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS created_by_trainer_id uuid REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_required text NOT NULL DEFAULT 'premium';

ALTER TABLE diet_plans DROP CONSTRAINT IF EXISTS diet_plans_tier_required_check;
ALTER TABLE diet_plans ADD CONSTRAINT diet_plans_tier_required_check
  CHECK (tier_required IN ('basic', 'premium'));

CREATE INDEX IF NOT EXISTS idx_diet_plans_trainer ON diet_plans(created_by_trainer_id);

-- diet_plan_assignments: add trainer field
ALTER TABLE diet_plan_assignments
  ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS can_modify boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_assignments_trainer ON diet_plan_assignments(trainer_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1H. Data migration for existing users (grace period)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE user_profiles
  SET subscription_status = 'active'
  WHERE status = 'approved' AND role = 'user';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1I. RLS on new tables only
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE trainer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_requests ENABLE ROW LEVEL SECURITY;

-- trainer_users policies
DROP POLICY IF EXISTS "trainers_see_own_users" ON trainer_users;
CREATE POLICY "trainers_see_own_users" ON trainer_users
  FOR SELECT USING (
    trainer_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "users_see_own_trainer" ON trainer_users;
CREATE POLICY "users_see_own_trainer" ON trainer_users
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trainers_manage_own_users" ON trainer_users;
CREATE POLICY "trainers_manage_own_users" ON trainer_users
  FOR INSERT WITH CHECK (
    trainer_id IN (
      SELECT id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'trainer'
    )
  );

DROP POLICY IF EXISTS "trainers_update_own_users" ON trainer_users;
CREATE POLICY "trainers_update_own_users" ON trainer_users
  FOR UPDATE USING (
    trainer_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "super_admin_all_trainer_users" ON trainer_users;
CREATE POLICY "super_admin_all_trainer_users" ON trainer_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- subscriptions policies
DROP POLICY IF EXISTS "users_own_subscription" ON subscriptions;
CREATE POLICY "users_own_subscription" ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "super_admin_all_subscriptions" ON subscriptions;
CREATE POLICY "super_admin_all_subscriptions" ON subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- payments policies
DROP POLICY IF EXISTS "users_own_payments" ON payments;
CREATE POLICY "users_own_payments" ON payments
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "super_admin_all_payments" ON payments;
CREATE POLICY "super_admin_all_payments" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- upgrade_requests policies
DROP POLICY IF EXISTS "users_own_upgrade_requests" ON upgrade_requests;
CREATE POLICY "users_own_upgrade_requests" ON upgrade_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trainers_see_their_requests" ON upgrade_requests;
CREATE POLICY "trainers_see_their_requests" ON upgrade_requests
  FOR SELECT USING (
    requested_trainer_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "super_admin_all_upgrade_requests" ON upgrade_requests;
CREATE POLICY "super_admin_all_upgrade_requests" ON upgrade_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

COMMIT;
