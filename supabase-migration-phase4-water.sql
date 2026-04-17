-- IronCan Phase 4 — Water tracking
-- Adds a water_logs table. Safe to re-run; uses IF NOT EXISTS everywhere.

BEGIN;

CREATE TABLE IF NOT EXISTS water_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  amount_ml   integer NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
  ON water_logs(user_id, date);

-- RLS: users can only see/modify their own rows.
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'water_logs'
      AND policyname = 'water_logs_self_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY water_logs_self_select ON water_logs
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'water_logs'
      AND policyname = 'water_logs_self_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY water_logs_self_insert ON water_logs
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'water_logs'
      AND policyname = 'water_logs_self_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY water_logs_self_delete ON water_logs
        FOR DELETE TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;
END $$;

COMMIT;
