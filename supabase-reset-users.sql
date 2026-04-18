-- IronCan — Reset users: keep super_admins, wipe everyone else & their data,
-- then create nabeel@ironcan.com with password nabeel@123.
--
-- Run in the Supabase SQL Editor as the service role.
-- Review the admin set before running — anything not matched by the
-- `admins` CTE pattern below will be DELETED.

BEGIN;

-- ─── 0. Safety: make sure at least one super_admin exists ───────────────────
DO $$
DECLARE
  admin_count int;
BEGIN
  SELECT count(*) INTO admin_count
    FROM user_profiles
   WHERE role = 'super_admin';

  IF admin_count = 0 THEN
    RAISE EXCEPTION
      'Aborting: no super_admin found in user_profiles — refusing to wipe all users';
  END IF;
END $$;

-- ─── 1. Collect non-admin user IDs into a temp table ───────────────────────
CREATE TEMP TABLE _victims ON COMMIT DROP AS
SELECT user_id
  FROM user_profiles
 WHERE role <> 'super_admin';

-- ─── 2. Delete dependent rows that would otherwise block the delete ────────
-- Tables whose FK to auth.users / user_profiles has NO cascade:
--   foods.created_by, diet_plans.created_by, diet_plan_assignments.assigned_by,
--   diet_plans.created_by_trainer_id, diet_plan_assignments.trainer_id,
--   upgrade_requests.requested_trainer_id

-- Logs & assignments for victims (cascades handle most, but be explicit)
DELETE FROM diet_logs             WHERE user_id IN (SELECT user_id FROM _victims);
DELETE FROM water_logs            WHERE user_id IN (SELECT user_id FROM _victims);
DELETE FROM diet_plan_assignments WHERE user_id IN (SELECT user_id FROM _victims)
                                     OR assigned_by IN (SELECT user_id FROM _victims)
                                     OR trainer_id IN (
                                          SELECT id FROM user_profiles
                                           WHERE user_id IN (SELECT user_id FROM _victims)
                                        );

-- Upgrade requests where the victim was the requester OR the target trainer
DELETE FROM upgrade_requests
 WHERE user_id IN (SELECT user_id FROM _victims)
    OR requested_trainer_id IN (
         SELECT id FROM user_profiles
          WHERE user_id IN (SELECT user_id FROM _victims)
       );

-- Subscriptions / payments for victims
DELETE FROM payments       WHERE user_id IN (SELECT user_id FROM _victims);
DELETE FROM subscriptions  WHERE user_id IN (SELECT user_id FROM _victims);

-- Trainer ↔ user links involving victims
DELETE FROM trainer_users
 WHERE user_id IN (SELECT user_id FROM _victims)
    OR trainer_id IN (
         SELECT id FROM user_profiles
          WHERE user_id IN (SELECT user_id FROM _victims)
       );

-- Diet plans authored by victims (meals/items cascade off diet_plan_days)
DELETE FROM diet_plans
 WHERE created_by IN (SELECT user_id FROM _victims)
    OR created_by_trainer_id IN (
         SELECT id FROM user_profiles
          WHERE user_id IN (SELECT user_id FROM _victims)
       );

-- Foods authored by victims
DELETE FROM foods WHERE created_by IN (SELECT user_id FROM _victims);

-- Null out assigned_trainer_id on any surviving profile that pointed at a victim
UPDATE user_profiles
   SET assigned_trainer_id = NULL
 WHERE assigned_trainer_id IN (
         SELECT id FROM user_profiles
          WHERE user_id IN (SELECT user_id FROM _victims)
       );

-- ─── 3. Delete the auth users themselves (cascades wipe user_profiles etc.)
DELETE FROM auth.users
 WHERE id IN (SELECT user_id FROM _victims);

-- ─── 4. Create nabeel@ironcan.com / nabeel@123 ─────────────────────────────
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- If an account with this email already exists, drop it first.
  DELETE FROM auth.users WHERE email = 'nabeel@ironcan.com';

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'nabeel@ironcan.com',
    crypt('nabeel@123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'nabeel@ironcan.com'),
    'email',
    new_user_id::text,
    now(), now(), now()
  );

  -- The on_auth_user_created trigger created a user_profiles row;
  -- promote it so the account is usable immediately.
  UPDATE user_profiles
     SET status = 'approved',
         onboarding_completed = false,
         updated_at = now()
   WHERE user_id = new_user_id;
END $$;

COMMIT;

-- Sanity check
SELECT u.email, p.role, p.status
  FROM auth.users u
  JOIN user_profiles p ON p.user_id = u.id
 ORDER BY p.role, u.email;
