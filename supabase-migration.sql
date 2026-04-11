-- IronCan: Admin Portal, User Profile & Diet Plan System
-- Run this in the Supabase SQL Editor

-- Enable trigram extension for fuzzy food search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Table 1: user_profiles ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  display_name    text,
  role            text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  height_cm       numeric(5,1),
  weight_kg       numeric(5,1),
  age             integer CHECK (age >= 10 AND age <= 120),
  gender          text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  activity_level  text CHECK (activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active')),
  fitness_goal    text CHECK (fitness_goal IN ('lose_weight', 'maintain', 'build_muscle', 'improve_endurance', 'general_fitness')),
  dietary_preferences text[],
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Table 2: foods ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS foods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  name          text NOT NULL,
  brand         text,
  calories      numeric(7,2) NOT NULL,
  protein_g     numeric(7,2) NOT NULL DEFAULT 0,
  carbs_g       numeric(7,2) NOT NULL DEFAULT 0,
  fat_g         numeric(7,2) NOT NULL DEFAULT 0,
  fiber_g       numeric(7,2) NOT NULL DEFAULT 0,
  serving_size  numeric(7,2) NOT NULL DEFAULT 1,
  serving_unit  text NOT NULL DEFAULT 'g',
  is_verified   boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foods_name_trgm ON foods USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foods_created_by ON foods(created_by);
CREATE INDEX IF NOT EXISTS idx_foods_is_active ON foods(is_active) WHERE is_active = true;

-- ─── Table 3: diet_plans ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  name            text NOT NULL,
  description     text,
  target_calories numeric(7,2),
  target_protein  numeric(7,2),
  target_carbs    numeric(7,2),
  target_fat      numeric(7,2),
  num_days        integer NOT NULL DEFAULT 7 CHECK (num_days >= 1 AND num_days <= 30),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diet_plans_created_by ON diet_plans(created_by);

-- ─── Table 4: diet_plan_days ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_plan_days (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
  day_number    integer NOT NULL CHECK (day_number >= 1),
  name          text,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_days_plan_id ON diet_plan_days(plan_id);

-- ─── Table 5: diet_plan_meals ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_plan_meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id        uuid NOT NULL REFERENCES diet_plan_days(id) ON DELETE CASCADE,
  meal_type     text NOT NULL CHECK (meal_type IN (
    'early_morning', 'breakfast', 'mid_morning_snack',
    'lunch', 'evening_snack', 'dinner', 'bedtime'
  )),
  display_order integer NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day_id, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_meals_day_id ON diet_plan_meals(day_id);

-- ─── Table 6: diet_plan_meal_items ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_plan_meal_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id       uuid NOT NULL REFERENCES diet_plan_meals(id) ON DELETE CASCADE,
  food_id       uuid NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  quantity      numeric(7,2) NOT NULL DEFAULT 1,
  serving_unit  text,
  notes         text,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_meal_items_meal_id ON diet_plan_meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_diet_plan_meal_items_food_id ON diet_plan_meal_items(food_id);

-- ─── Table 7: diet_plan_assignments ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_plan_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
  assigned_by     uuid NOT NULL REFERENCES auth.users(id),
  start_date      date NOT NULL DEFAULT CURRENT_DATE,
  end_date        date,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_assignments_user_id ON diet_plan_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_diet_plan_assignments_plan_id ON diet_plan_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_diet_plan_assignments_status ON diet_plan_assignments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_active ON diet_plan_assignments(user_id) WHERE status = 'active';

-- ─── Table 8: diet_logs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS diet_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id   uuid REFERENCES diet_plan_assignments(id) ON DELETE SET NULL,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  meal_type       text NOT NULL CHECK (meal_type IN (
    'early_morning', 'breakfast', 'mid_morning_snack',
    'lunch', 'evening_snack', 'dinner', 'bedtime', 'other'
  )),
  food_id         uuid REFERENCES foods(id) ON DELETE SET NULL,
  food_snapshot   jsonb NOT NULL,
  quantity        numeric(7,2) NOT NULL DEFAULT 1,
  serving_unit    text,
  is_planned      boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diet_logs_user_date ON diet_logs(user_id, date);

-- ─── Migration: backfill existing users ─────────────────────────────────────
-- Create profiles for existing users who don't have one yet
-- Set them as approved with onboarding complete so they aren't disrupted

INSERT INTO user_profiles (user_id, email, role, status, onboarding_completed)
SELECT id, email, 'user', 'approved', true
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO NOTHING;

-- ─── MANUAL STEP: Set your admin account ────────────────────────────────────
-- Replace YOUR_USER_ID with your actual Supabase user ID:
-- UPDATE user_profiles SET role = 'admin' WHERE user_id = 'YOUR_USER_ID';
