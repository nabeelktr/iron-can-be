-- Fuzzy, ranked food search.
-- Uses pg_trgm (already enabled) for typo-tolerant matching across name + brand.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Brand trigram index so fuzzy brand match uses the index.
CREATE INDEX IF NOT EXISTS idx_foods_brand_trgm
  ON foods USING gin (brand gin_trgm_ops);

-- search_foods(q, lim):
--   Returns active foods ordered by:
--     1. match_rank (exact > prefix > contains > trigram-only)
--     2. trigram similarity to name (brand counted at 0.7 weight)
--     3. is_verified desc, then name asc as tie breakers.
--   Filter uses `name % q OR brand % q` (trigram-indexed) plus a contains-fallback
--   so very short queries still find substring hits.
CREATE OR REPLACE FUNCTION search_foods(q text, lim int DEFAULT 20)
RETURNS SETOF foods
LANGUAGE sql
STABLE
AS $$
  WITH q_norm AS (SELECT lower(trim(q)) AS q),
  ranked AS (
    SELECT
      f.*,
      GREATEST(
        similarity(lower(f.name), (SELECT q FROM q_norm)),
        COALESCE(similarity(lower(f.brand), (SELECT q FROM q_norm)), 0) * 0.7
      ) AS sim,
      CASE
        WHEN lower(f.name) = (SELECT q FROM q_norm) THEN 3
        WHEN lower(f.name) LIKE (SELECT q FROM q_norm) || '%' THEN 2
        WHEN lower(f.name) LIKE '%' || (SELECT q FROM q_norm) || '%' THEN 1
        ELSE 0
      END AS match_rank
    FROM foods f
    WHERE f.is_active = true
      AND (
        f.name % q
        OR (f.brand IS NOT NULL AND f.brand % q)
        OR lower(f.name) LIKE '%' || (SELECT q FROM q_norm) || '%'
        OR (f.brand IS NOT NULL AND lower(f.brand) LIKE '%' || (SELECT q FROM q_norm) || '%')
      )
  )
  SELECT
    id, created_by, name, brand, calories, protein_g, carbs_g, fat_g, fiber_g,
    serving_size, serving_unit, is_verified, is_active, created_at, updated_at,
    household_units, barcode, cuisine, tags
  FROM ranked
  ORDER BY
    match_rank DESC,
    sim DESC,
    is_verified DESC,
    name ASC
  LIMIT lim;
$$;

-- Grant execute to the same role the API uses.
GRANT EXECUTE ON FUNCTION search_foods(text, int) TO authenticated;

-- Notes:
-- 1. Default trigram similarity threshold is 0.3. To loosen for short queries:
--      SET pg_trgm.similarity_threshold = 0.2;
--    (set per-session in the route if needed)
-- 2. The function returns the full `foods` row shape so the API can map columns
--    directly without listing them. If you ALTER TABLE foods later, recreate this.
