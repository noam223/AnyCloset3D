-- Compact anonymized cabinet summaries for the cheap cabinet-chat AI agent.
-- Reads recent projects.project_data (cart items or legacy wing snapshots).

CREATE OR REPLACE FUNCTION public.cabinet_chat_examples(p_limit integer DEFAULT 150)
RETURNS TABLE (
  width integer,
  height integer,
  depth integer,
  cols integer,
  hang_cols integer,
  drawer_cols integer,
  drawer_count integer,
  drawer_kind text,
  has_doors boolean,
  front_face text,
  front_style text,
  model text,
  n integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH recent AS (
  SELECT project_data AS pd
  FROM projects
  WHERE project_data IS NOT NULL
  ORDER BY updated_at DESC NULLS LAST
  LIMIT GREATEST(20, LEAST(COALESCE(p_limit, 150) * 2, 400))
),
items AS (
  SELECT CASE
    WHEN jsonb_typeof(pd->'cart') = 'array' AND jsonb_array_length(pd->'cart') > 0 THEN pd->'cart'
    WHEN jsonb_typeof(pd->'orderCart') = 'array' AND jsonb_array_length(pd->'orderCart') > 0 THEN pd->'orderCart'
    ELSE jsonb_build_array(jsonb_build_object('rawState', pd))
  END AS cart
  FROM recent
),
expanded AS (
  SELECT COALESCE(elem->'rawState', elem) AS rs
  FROM items, LATERAL jsonb_array_elements(cart) elem
),
wings AS (
  SELECT
    COALESCE(rs->'wings'->'center', rs) AS w,
    COALESCE(rs->>'cabinetModel', rs->'wings'->'center'->>'cabinetModel', 'linear') AS model,
    COALESCE((rs->>'hasDoors')::boolean, (rs->'wings'->'center'->>'hasDoors')::boolean, true) AS has_doors,
    COALESCE(rs->>'frontFaceStyle', rs->'wings'->'center'->>'frontFaceStyle', 'solid') AS front_face,
    COALESCE(rs->>'frontStyle', rs->'wings'->'center'->>'frontStyle', 'external') AS front_style
  FROM expanded
),
final AS (
  SELECT
    ROUND(COALESCE((w->>'width')::numeric, 0))::integer AS width,
    ROUND(COALESCE(
      (w->>'globalHeight')::numeric,
      (w->'columns'->0->>'height')::numeric,
      0
    ))::integer AS height,
    ROUND(COALESCE((w->>'depth')::numeric, 0))::integer AS depth,
    COALESCE(jsonb_array_length(w->'columns'), 0)::integer AS cols,
    (
      SELECT COUNT(*)::integer
      FROM jsonb_array_elements(COALESCE(w->'columns', '[]'::jsonb)) c
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(c->'compartments', '[]'::jsonb)) x
        WHERE x->>'type' IN ('hanging', 'hanging_double')
      )
    ) AS hang_cols,
    (
      SELECT COUNT(*)::integer
      FROM jsonb_array_elements(COALESCE(w->'columns', '[]'::jsonb)) c
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(c->'compartments', '[]'::jsonb)) x
        WHERE x->>'type' IN ('internal_drawers', 'external_drawers')
      )
    ) AS drawer_cols,
    (
      SELECT COALESCE(MAX((NULLIF(x->>'count', ''))::int), 0)::integer
      FROM jsonb_array_elements(COALESCE(w->'columns', '[]'::jsonb)) c,
           jsonb_array_elements(COALESCE(c->'compartments', '[]'::jsonb)) x
      WHERE x->>'type' IN ('internal_drawers', 'external_drawers')
    ) AS drawer_count,
    (
      SELECT CASE
        WHEN bool_or(x->>'type' = 'internal_drawers') THEN 'internal'
        WHEN bool_or(x->>'type' = 'external_drawers') THEN 'external'
        ELSE NULL
      END
      FROM jsonb_array_elements(COALESCE(w->'columns', '[]'::jsonb)) c,
           jsonb_array_elements(COALESCE(c->'compartments', '[]'::jsonb)) x
    ) AS drawer_kind,
    has_doors,
    front_face,
    front_style,
    model
  FROM wings
)
SELECT
  width, height, depth, cols, hang_cols, drawer_cols, drawer_count, drawer_kind,
  has_doors, front_face, front_style, model, COUNT(*)::integer AS n
FROM final
WHERE width BETWEEN 60 AND 500
  AND cols BETWEEN 1 AND 12
  AND height BETWEEN 80 AND 360
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12
ORDER BY n DESC, width
LIMIT GREATEST(10, LEAST(COALESCE(p_limit, 150), 250));
$$;

REVOKE ALL ON FUNCTION public.cabinet_chat_examples(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cabinet_chat_examples(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cabinet_chat_examples(integer) TO authenticated;
