-- ============================================================================
-- BI 0 A 100 — Migration baseline
--
-- Purpose: mark the 17 migrations already reflected in the live schema as
-- applied, WITHOUT re-running them, and create by hand the named indexes those
-- migrations would have created (synchronize only ever created hash-named
-- equivalents, and 22 of them have no equivalent at all).
--
-- PerfilesAnaliticos1775230000000 is deliberately NOT inserted: it is the only
-- migration whose effect is absent from the database, so it must run for real
-- via `npm run typeorm -- migration:run`.
--
-- Prerequisite: the "migrations" table must already exist. Create it with
-- TypeORM itself (metadata only, no schema change):
--   docker compose exec -T backend npm run typeorm -- migration:show
--
-- Run with:
--   docker compose cp backend/scripts/baseline-migrations.sql postgres:/tmp/baseline.sql
--   docker compose exec -T postgres psql -U bi0a100_user -d bi0a100_db -v ON_ERROR_STOP=1 -f /tmp/baseline.sql
--
-- Everything runs inside a single transaction: it either fully applies or
-- leaves the database untouched.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: refuse to run if TypeORM has not created its bookkeeping table yet.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'migrations'
    ) THEN
        RAISE EXCEPTION
            'Table "migrations" does not exist. Run first: docker compose exec -T backend npm run typeorm -- migration:show';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Baseline: 17 migrations marked as applied.
--
-- Matching is done on the CLASS name (TypeORM compares `name`), and rows are
-- inserted in class-timestamp order so the serial id follows execution order.
-- Idempotent: re-running inserts nothing.
-- ---------------------------------------------------------------------------
INSERT INTO migrations ("timestamp", "name")
SELECT v.ts, v.name
FROM (
    VALUES
        (1724000000000::bigint, 'AddIndexesForPerformance1724000000000'),
        (1724004000000::bigint, 'ArchiveProveedoresModule1724004000000'),
        (1774918332277::bigint, 'UpdateIndexes1774918332277'),
        (1774998000000::bigint, 'MercadoFase1Columns1774998000000'),
        (1775010000000::bigint, 'EquipoFase1775010000000'),
        (1775020000000::bigint, 'InvitacionesTrabajador1775020000000'),
        (1775030000000::bigint, 'AnalisisLegal1775030000000'),
        (1775100000000::bigint, 'ArticulosYContactos1775100000000'),
        (1775110000000::bigint, 'MovimientoTrazabilidad1775110000000'),
        (1775120000000::bigint, 'DropHerramientasActivadas1775120000000'),
        (1775140000000::bigint, 'DropProveedoresTable1775140000000'),
        (1775155000000::bigint, 'AddUsuarioEsAdmin1775155000000'),
        (1775160000000::bigint, 'ReworkAnalisisVentas1775160000000'),
        (1775165000000::bigint, 'AddProductoImagenUrl1775165000000'),
        (1775200000000::bigint, 'MarcaLogoAndBrief1775200000000'),
        (1775210000000::bigint, 'MetasNegocio1775210000000'),
        (1775220000000::bigint, 'AddProductoVideoUrl1775220000000')
) AS v(ts, name)
WHERE NOT EXISTS (
    SELECT 1 FROM migrations m WHERE m.name = v.name
)
ORDER BY v.ts;

-- ---------------------------------------------------------------------------
-- 2. Indexes with no hash-named equivalent in the live schema.
--
-- Skipped on purpose because synchronize already covers them:
--   * usuarios(email) unique       -> UQ_446adfc18b35418aac32ae0b7b5
--   * analisis_*(estado_analisis)  -> IDX_1639fc..., IDX_2f18db..., etc.
--   * analisis_*(usuario_id)       -> covered by (usuario_id, producto_id)
--   * clientes(usuario_id, tipo_contacto), articulos(...), metas_negocio(...),
--     marcas(...), asignaciones_trabajador(...), invitaciones(codigo) unique
--   * every FK declared by the migrations already exists (hash-named)
-- ---------------------------------------------------------------------------

-- UpdateIndexes1774918332277 + AddIndexesForPerformance1724000000000
-- (productos has no non-PK index at all today).
-- Both migrations declare an index on the same single column, so ONE index is
-- created here; "IDX_productos_usuario" would be a pure duplicate.
CREATE INDEX IF NOT EXISTS idx_producto_usuario_id
    ON productos (usuario_id);

-- EquipoFase1775010000000 — the self-FK on usuarios exists, but Postgres does
-- not index the referencing side automatically.
CREATE INDEX IF NOT EXISTS "IDX_usuarios_owner_id"
    ON usuarios (owner_id);

-- AddIndexesForPerformance1724000000000
CREATE INDEX IF NOT EXISTS idx_usuario_plan
    ON usuarios (plan);

-- MovimientoTrazabilidad1775110000000
CREATE INDEX IF NOT EXISTS "IDX_movimientos_referencia"
    ON movimientos_contables (referencia_tipo, referencia_id);

-- AddIndexesForPerformance1724000000000 — quota lookups (usuario_id +
-- estado_analisis) and dashboard timeseries (fecha_creacion), the hot paths.
-- The existing hash indexes do not serve these predicates: (estado_analisis)
-- alone is too unselective and (usuario_id, producto_id) does not start with
-- producto_id.
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_usuario_estado
    ON analisis_mercado (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_fecha_creacion
    ON analisis_mercado (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_producto_id
    ON analisis_mercado (producto_id);

CREATE INDEX IF NOT EXISTS idx_analisis_marketing_usuario_estado
    ON analisis_marketing (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_marketing_fecha_creacion
    ON analisis_marketing (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_marketing_producto_id
    ON analisis_marketing (producto_id);

CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_usuario_estado
    ON analisis_finanzas (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_fecha_creacion
    ON analisis_finanzas (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_producto_id
    ON analisis_finanzas (producto_id);

CREATE INDEX IF NOT EXISTS idx_analisis_legal_usuario_estado
    ON analisis_legal (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_legal_fecha_creacion
    ON analisis_legal (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_legal_producto_id
    ON analisis_legal (producto_id);

CREATE INDEX IF NOT EXISTS idx_analisis_brief_usuario_estado
    ON analisis_brief (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_brief_fecha_creacion
    ON analisis_brief (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_brief_producto_id
    ON analisis_brief (producto_id);

CREATE INDEX IF NOT EXISTS idx_analisis_ventas_usuario_estado
    ON analisis_ventas (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_ventas_fecha_creacion
    ON analisis_ventas (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_ventas_producto_id
    ON analisis_ventas (producto_id);

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Verification (read-only).
-- Expected: 17 rows in migrations, and 22 indexes created above.
-- ---------------------------------------------------------------------------
SELECT id, "timestamp", "name" FROM migrations ORDER BY "timestamp";

SELECT count(*) AS indices_baseline
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE 'idx\_%' OR indexname IN ('IDX_usuarios_owner_id', 'IDX_movimientos_referencia'));