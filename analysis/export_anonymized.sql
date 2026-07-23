-- Vista de exportación anonimizada para el análisis estadístico del Entregable 4.
-- Se ejecuta contra la base de datos `visualiza` tras cerrar todas las sesiones.
-- Reglas de anonimización:
--   - Se sustituye el código del participante por un id ordinal estable.
--   - No se exporta ningún timestamp absoluto, solo offsets relativos al inicio de la sesión.
--   - El resultado se vuelca a CSV: `psql -c "\COPY (SELECT * FROM anonymized_export) TO 'visualiza_export.csv' CSV HEADER"`.
--
-- La telemetría de tarea y el SUS se emparejan por (sesión, tipo de componente,
-- condición): un LEFT JOIN doble por sesión produciría el producto cartesiano
-- 10 tareas × 10 SUS = 100 filas por sesión e invalidaría el análisis pareado.

DROP VIEW IF EXISTS anonymized_export CASCADE;

CREATE OR REPLACE VIEW anonymized_export AS
WITH ordinal_participants AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY "CreatedAt") AS participant_no
    FROM "Participants"
),
session_join AS (
    SELECT s."Id"            AS session_id,
           op.participant_no AS participant_no,
           s."StartedAt"     AS started_at,
           s."CompletedAt"   AS completed_at
    FROM "Sessions" s
    JOIN ordinal_participants op ON op.id = s."ParticipantId"
),
paired AS (
    SELECT COALESCE(tm."SessionId", sr."SessionId")         AS session_id,
           COALESCE(tm."ComponentType", sr."ComponentType") AS component_type,
           COALESCE(tm."Condition", sr."Condition")         AS condition,
           tm."DurationMs" AS task_duration_ms,
           tm."ErrorCount" AS task_error_count,
           tm."Success"    AS task_success,
           sr."Score"      AS sus_score
    FROM "TaskMeasurements" tm
    FULL OUTER JOIN "SusResponses" sr
      ON sr."SessionId"     = tm."SessionId"
     AND sr."ComponentType" = tm."ComponentType"
     AND sr."Condition"     = tm."Condition"
)
SELECT
    sj.participant_no,
    sj.session_id,
    EXTRACT(EPOCH FROM (sj.completed_at - sj.started_at))::int AS session_seconds,
    -- Telemetría de tarea
    p.component_type    AS task_component_type,
    p.condition         AS task_condition,
    p.task_duration_ms,
    p.task_error_count,
    p.task_success,
    -- SUS (mismas claves que la tarea, columnas duplicadas por compatibilidad con analyze_sus.R)
    p.component_type    AS sus_component_type,
    p.condition         AS sus_condition,
    p.sus_score
FROM session_join sj
JOIN paired p ON p.session_id = sj.session_id
ORDER BY sj.participant_no, p.component_type, p.condition;
