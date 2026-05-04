-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 5 — Diet revamp
-- ═══════════════════════════════════════════════════════════════════════════════
-- Snapshot rule (single source of truth for diet_logs):
--   food_snapshot.{calories,protein_g,...} are macros for ONE serving_unit
--   (= serving_size grams of that unit). diet_logs.quantity is the multiplier.
--   Summary = snap × quantity.
--
-- Two changes required by the revamp:
--   1. Track which trainer-plan meal item a log corresponds to so we can
--      idempotently materialize planned logs and edit them by reference.
--   2. Prevent duplicate planned logs for the same (user, date, meal, food)
--      so lazy materialization is safe under concurrent reads.

ALTER TABLE diet_logs
  ADD COLUMN IF NOT EXISTS meal_item_id uuid
  REFERENCES diet_plan_meal_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_diet_logs_meal_item
  ON diet_logs(meal_item_id) WHERE meal_item_id IS NOT NULL;

-- One planned log per (user, date, meal, food). Prevents double-materialization.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_diet_logs_planned_per_meal
  ON diet_logs(user_id, date, meal_type, food_id)
  WHERE is_planned = true;
