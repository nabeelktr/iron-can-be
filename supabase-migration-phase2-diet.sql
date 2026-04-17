-- IronCan Diet Enhancement — Phase 2
-- Adds household_units + barcode to foods, and seeds a starter Indian food DB.
-- Safe to run once in the Supabase SQL editor. Uses IF NOT EXISTS / ON CONFLICT
-- so re-running is a no-op.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Extend foods table
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS household_units jsonb,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS cuisine text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- household_units shape:
-- [{"label": "1 roti (medium)", "grams": 40, "calories": 104, "default": true}, ...]

CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_barcode_unique
  ON foods(barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON foods USING gin (name gin_trgm_ops);
-- ^ requires pg_trgm extension; if not enabled, this will fail. Enable once with:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_foods_cuisine ON foods(cuisine) WHERE cuisine IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Indian starter food seed (~27 foundational items)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Strategy: macros per 100g (standard), plus household_units covering the
-- common portions Indian users actually eat. Values sourced from NIN IFCT 2017
-- and widely-used references. Refine in the admin food manager as needed.
--
-- `foods.created_by` is NOT NULL and references an auth user. The DO block
-- below auto-picks a super_admin's auth user_id so the seed works on any
-- environment without manual UUID substitution. If no super_admin exists yet,
-- it falls back to the earliest auth.users row. If the foods table is empty
-- AND there are no users at all, the seed is skipped with a notice.

DO $$
DECLARE
  seed_user_id uuid;
BEGIN
  SELECT up.user_id INTO seed_user_id
  FROM user_profiles up
  WHERE up.role = 'super_admin'
  ORDER BY up.created_at
  LIMIT 1;

  IF seed_user_id IS NULL THEN
    SELECT id INTO seed_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;

  IF seed_user_id IS NULL THEN
    RAISE NOTICE 'No auth users found — skipping Indian food seed. Create a user first, then re-run this file.';
    RETURN;
  END IF;

  INSERT INTO foods (
    created_by, name, brand, calories, protein_g, carbs_g, fat_g, fiber_g,
    serving_size, serving_unit, is_verified, is_active, cuisine, tags, household_units
  ) VALUES
    (seed_user_id, 'Roti (whole wheat)', NULL, 264, 9.2, 55.7, 3.8, 7.4, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','staple','bread'],
      '[
        {"label":"1 roti (small)","grams":30,"calories":79,"default":false},
        {"label":"1 roti (medium)","grams":40,"calories":106,"default":true},
        {"label":"1 roti (large)","grams":60,"calories":158,"default":false}
      ]'::jsonb),
    (seed_user_id, 'Chapati (with ghee)', NULL, 320, 9.0, 55.0, 8.0, 7.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','staple','bread'],
      '[{"label":"1 chapati (medium)","grams":45,"calories":144,"default":true}]'::jsonb),
    (seed_user_id, 'Paratha (plain)', NULL, 310, 7.5, 45.0, 11.0, 5.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','staple','bread'],
      '[{"label":"1 paratha (medium)","grams":80,"calories":248,"default":true}]'::jsonb),
    (seed_user_id, 'Aloo Paratha', NULL, 285, 6.0, 38.0, 12.0, 4.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast'],
      '[{"label":"1 paratha (medium)","grams":120,"calories":342,"default":true}]'::jsonb),
    (seed_user_id, 'Basmati Rice (cooked)', NULL, 130, 2.7, 28.0, 0.3, 0.4, 100, 'g', true, true, 'Indian',
      ARRAY['vegan','staple','grain'],
      '[
        {"label":"1 katori (small)","grams":80,"calories":104,"default":false},
        {"label":"1 katori (standard)","grams":150,"calories":195,"default":true},
        {"label":"1 cup cooked","grams":195,"calories":254,"default":false}
      ]'::jsonb),
    (seed_user_id, 'Dal Tadka (toor)', NULL, 116, 8.0, 15.0, 2.5, 5.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','lentil','north-indian'],
      '[
        {"label":"1 katori (standard)","grams":150,"calories":174,"default":true},
        {"label":"1 bowl","grams":250,"calories":290,"default":false}
      ]'::jsonb),
    (seed_user_id, 'Dal Makhani', NULL, 195, 8.5, 17.0, 10.5, 5.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','lentil','north-indian'],
      '[{"label":"1 katori (standard)","grams":150,"calories":293,"default":true}]'::jsonb),
    (seed_user_id, 'Sambar', NULL, 85, 4.5, 12.0, 1.8, 3.8, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','lentil','south-indian'],
      '[{"label":"1 katori (standard)","grams":200,"calories":170,"default":true}]'::jsonb),
    (seed_user_id, 'Rasam', NULL, 42, 1.8, 7.5, 0.8, 1.2, 100, 'g', true, true, 'Indian',
      ARRAY['vegan','soup','south-indian'],
      '[{"label":"1 katori","grams":200,"calories":84,"default":true}]'::jsonb),
    (seed_user_id, 'Chicken Curry', NULL, 185, 17.0, 6.0, 10.5, 1.5, 100, 'g', true, true, 'Indian',
      ARRAY['non-vegetarian','curry'],
      '[{"label":"1 katori (standard)","grams":180,"calories":333,"default":true}]'::jsonb),
    (seed_user_id, 'Butter Chicken', NULL, 230, 14.0, 7.0, 16.5, 1.0, 100, 'g', true, true, 'Indian',
      ARRAY['non-vegetarian','curry','north-indian'],
      '[{"label":"1 katori (standard)","grams":180,"calories":414,"default":true}]'::jsonb),
    (seed_user_id, 'Paneer Butter Masala', NULL, 258, 11.0, 9.0, 20.0, 1.5, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','paneer','north-indian'],
      '[{"label":"1 katori (standard)","grams":150,"calories":387,"default":true}]'::jsonb),
    (seed_user_id, 'Palak Paneer', NULL, 180, 10.5, 8.0, 12.0, 3.5, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','paneer','north-indian'],
      '[{"label":"1 katori (standard)","grams":150,"calories":270,"default":true}]'::jsonb),
    (seed_user_id, 'Chole / Chana Masala', NULL, 164, 8.0, 24.0, 4.0, 7.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','legume','north-indian'],
      '[{"label":"1 katori (standard)","grams":150,"calories":246,"default":true}]'::jsonb),
    (seed_user_id, 'Rajma Masala', NULL, 155, 8.5, 22.0, 3.5, 7.5, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','legume','north-indian'],
      '[{"label":"1 katori (standard)","grams":150,"calories":233,"default":true}]'::jsonb),
    (seed_user_id, 'Idli', NULL, 160, 4.0, 32.0, 1.2, 1.4, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast','south-indian','steamed'],
      '[
        {"label":"1 idli","grams":45,"calories":72,"default":false},
        {"label":"2 idlis","grams":90,"calories":144,"default":true}
      ]'::jsonb),
    (seed_user_id, 'Plain Dosa', NULL, 170, 4.0, 30.0, 4.0, 1.5, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast','south-indian'],
      '[{"label":"1 dosa (medium)","grams":90,"calories":153,"default":true}]'::jsonb),
    (seed_user_id, 'Masala Dosa', NULL, 210, 5.0, 34.0, 6.5, 2.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast','south-indian'],
      '[{"label":"1 dosa (medium)","grams":150,"calories":315,"default":true}]'::jsonb),
    (seed_user_id, 'Poha', NULL, 170, 3.5, 28.0, 4.5, 1.3, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast','maharashtrian'],
      '[{"label":"1 plate","grams":150,"calories":255,"default":true}]'::jsonb),
    (seed_user_id, 'Upma', NULL, 185, 4.0, 26.0, 7.0, 1.8, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','breakfast','south-indian'],
      '[{"label":"1 plate","grams":150,"calories":278,"default":true}]'::jsonb),
    (seed_user_id, 'Curd (dahi, full-fat)', NULL, 98, 3.7, 4.8, 6.8, 0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','dairy'],
      '[
        {"label":"1 katori (small)","grams":100,"calories":98,"default":true},
        {"label":"1 glass lassi","grams":250,"calories":245,"default":false}
      ]'::jsonb),
    (seed_user_id, 'Paneer (cottage cheese)', NULL, 265, 18.0, 1.2, 20.8, 0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','dairy','protein'],
      '[{"label":"1 cube (30g)","grams":30,"calories":80,"default":true}]'::jsonb),
    (seed_user_id, 'Chicken Biryani', NULL, 200, 9.0, 26.0, 7.0, 1.2, 100, 'g', true, true, 'Indian',
      ARRAY['non-vegetarian','rice','mughlai'],
      '[{"label":"1 plate","grams":300,"calories":600,"default":true}]'::jsonb),
    (seed_user_id, 'Veg Biryani', NULL, 175, 4.5, 29.0, 5.5, 2.0, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','rice','mughlai'],
      '[{"label":"1 plate","grams":300,"calories":525,"default":true}]'::jsonb),
    (seed_user_id, 'Samosa', NULL, 308, 5.0, 32.0, 18.0, 2.5, 100, 'g', true, true, 'Indian',
      ARRAY['vegetarian','snack','fried'],
      '[{"label":"1 samosa (medium)","grams":100,"calories":308,"default":true}]'::jsonb),
    (seed_user_id, 'Banana', NULL, 89, 1.1, 22.8, 0.3, 2.6, 100, 'g', true, true, NULL,
      ARRAY['vegan','fruit'],
      '[
        {"label":"1 banana (small)","grams":100,"calories":89,"default":false},
        {"label":"1 banana (medium)","grams":120,"calories":107,"default":true}
      ]'::jsonb),
    (seed_user_id, 'Boiled Egg', NULL, 155, 13.0, 1.1, 11.0, 0, 100, 'g', true, true, NULL,
      ARRAY['non-vegetarian','protein','breakfast'],
      '[{"label":"1 egg","grams":50,"calories":78,"default":true}]'::jsonb)
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Post-migration checklist
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. If pg_trgm isn't enabled, run:  CREATE EXTENSION IF NOT EXISTS pg_trgm;
--    then re-run:  CREATE INDEX IF NOT EXISTS idx_foods_name_trgm ON foods USING gin (name gin_trgm_ops);
-- 2. Admins can extend household_units + seed from AdminFoodManagementScreen.
-- 3. RLS on foods: search route reads via the authenticated user's supabase client,
--    so foods must be readable by role=authenticated. If you tightened RLS, add:
--      CREATE POLICY "read active foods" ON foods FOR SELECT TO authenticated USING (is_active = true);
