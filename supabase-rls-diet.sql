-- IronCan: RLS policies for diet_logs and diet_plan_assignments
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / DO blocks.
--
-- WHY: The original migrations never enabled RLS on these tables.
-- If RLS was manually toggled ON via the Supabase UI, every INSERT/SELECT
-- from the anon-key client is silently blocked, causing the "stuck" hang
-- on the Plus button when logging food.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. diet_logs — users own their own rows; trainers can read their clients'
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_self_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_self_select ON diet_logs
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  -- INSERT: own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_self_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_self_insert ON diet_logs
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;

  -- UPDATE: own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_self_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_self_update ON diet_logs
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  -- DELETE: own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_self_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_self_delete ON diet_logs
        FOR DELETE TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  -- Trainer read: trainers can read their clients' logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_trainer_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_trainer_select ON diet_logs
        FOR SELECT TO authenticated
        USING (
          user_id IN (
            SELECT tu.user_id
            FROM trainer_users tu
            JOIN user_profiles up ON up.id = tu.trainer_id
            WHERE up.user_id = auth.uid()
              AND tu.status = 'joined'
          )
        )
    $pol$;
  END IF;

  -- Super admin: full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs' AND policyname = 'diet_logs_super_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY diet_logs_super_admin ON diet_logs
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'super_admin'
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. diet_plan_assignments — users see own; trainers see their clients'
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE diet_plan_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: own assignment
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_self_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_self_select ON diet_plan_assignments
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  -- Trainer SELECT: trainers can see assignments they created
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_trainer_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_trainer_select ON diet_plan_assignments
        FOR SELECT TO authenticated
        USING (
          trainer_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
          )
        )
    $pol$;
  END IF;

  -- Trainer INSERT: trainers can assign plans to their clients
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_trainer_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_trainer_insert ON diet_plan_assignments
        FOR INSERT TO authenticated
        WITH CHECK (
          trainer_id IN (
            SELECT id FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'trainer'
          )
        )
    $pol$;
  END IF;

  -- Trainer UPDATE: trainers can update their clients' assignments (e.g. pause)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_trainer_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_trainer_update ON diet_plan_assignments
        FOR UPDATE TO authenticated
        USING (
          trainer_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
          )
        )
    $pol$;
  END IF;

  -- User UPDATE: users can update own assignment (pause/resume)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_self_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_self_update ON diet_plan_assignments
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  -- Super admin: full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_assignments' AND policyname = 'dpa_super_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpa_super_admin ON diet_plan_assignments
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'super_admin'
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. diet_plans — users can read plans assigned to them; trainers manage theirs
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE diet_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Users can read plans they're assigned to
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plans' AND policyname = 'dp_assigned_user_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dp_assigned_user_select ON diet_plans
        FOR SELECT TO authenticated
        USING (
          id IN (
            SELECT plan_id FROM diet_plan_assignments WHERE user_id = auth.uid()
          )
        )
    $pol$;
  END IF;

  -- Trainers can manage their own plans
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plans' AND policyname = 'dp_trainer_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dp_trainer_all ON diet_plans
        FOR ALL TO authenticated
        USING (
          created_by_trainer_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
          )
        )
    $pol$;
  END IF;

  -- Super admin: full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plans' AND policyname = 'dp_super_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dp_super_admin ON diet_plans
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role = 'super_admin'
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. diet_plan_days / diet_plan_meals / diet_plan_meal_items
--    Cascade read from diet_plans policy above.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE diet_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plan_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plan_meal_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- diet_plan_days: readable if you can read the parent plan
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_days' AND policyname = 'dpd_plan_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpd_plan_access ON diet_plan_days
        FOR SELECT TO authenticated
        USING (
          plan_id IN (
            SELECT id FROM diet_plans
          )
        )
    $pol$;
  END IF;

  -- Trainer full access on days
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_days' AND policyname = 'dpd_trainer_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpd_trainer_all ON diet_plan_days
        FOR ALL TO authenticated
        USING (
          plan_id IN (
            SELECT id FROM diet_plans
            WHERE created_by_trainer_id IN (
              SELECT id FROM user_profiles WHERE user_id = auth.uid()
            )
          )
        )
    $pol$;
  END IF;

  -- diet_plan_meals
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_meals' AND policyname = 'dpm_plan_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpm_plan_access ON diet_plan_meals
        FOR SELECT TO authenticated
        USING (
          day_id IN (SELECT id FROM diet_plan_days)
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_meals' AND policyname = 'dpm_trainer_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpm_trainer_all ON diet_plan_meals
        FOR ALL TO authenticated
        USING (
          day_id IN (
            SELECT id FROM diet_plan_days
            WHERE plan_id IN (
              SELECT id FROM diet_plans
              WHERE created_by_trainer_id IN (
                SELECT id FROM user_profiles WHERE user_id = auth.uid()
              )
            )
          )
        )
    $pol$;
  END IF;

  -- diet_plan_meal_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_meal_items' AND policyname = 'dpmi_plan_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpmi_plan_access ON diet_plan_meal_items
        FOR SELECT TO authenticated
        USING (
          meal_id IN (SELECT id FROM diet_plan_meals)
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_plan_meal_items' AND policyname = 'dpmi_trainer_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY dpmi_trainer_all ON diet_plan_meal_items
        FOR ALL TO authenticated
        USING (
          meal_id IN (
            SELECT id FROM diet_plan_meals
            WHERE day_id IN (
              SELECT id FROM diet_plan_days
              WHERE plan_id IN (
                SELECT id FROM diet_plans
                WHERE created_by_trainer_id IN (
                  SELECT id FROM user_profiles WHERE user_id = auth.uid()
                )
              )
            )
          )
        )
    $pol$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. foods — all authenticated users can read active foods; admins manage
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'foods_authenticated_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY foods_authenticated_read ON foods
        FOR SELECT TO authenticated
        USING (is_active = true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'foods_admin_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY foods_admin_all ON foods
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid() AND role IN ('super_admin', 'trainer')
          )
        )
    $pol$;
  END IF;
END $$;

COMMIT;
