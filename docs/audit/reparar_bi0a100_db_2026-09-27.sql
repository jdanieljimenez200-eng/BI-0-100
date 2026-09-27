-- Reparación NO destructiva de bi0a100_db: la alinea con el esquema de las migraciones.
-- Generado por la auditoría de base de datos (2026-09-27). No toca filas.
-- Una sola transacción: si algo falla, no se aplica nada.
BEGIN;

-- 1) Lo que el synchronize antiguo añadió y las migraciones no crean
ALTER TABLE "perfiles_analiticos" DROP CONSTRAINT IF EXISTS "uq_perfil_usuario_plataforma_handle";
DROP INDEX IF EXISTS "IDX_4bc0eaaba999785a9c40acc89f";
DROP INDEX IF EXISTS "IDX_c2b317a6906dee7e80276abe72";

-- 2) Lo que el synchronize antiguo borró (FK y CHECK primero, luego índices)
ALTER TABLE "usuarios" ADD CONSTRAINT "FK_usuarios_owner_id" FOREIGN KEY (owner_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "FK_ventas_cotizacion" FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE "cotizaciones" ADD CONSTRAINT "FK_cotizaciones_cliente" FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "FK_movimientos_inventario_venta" FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL;
ALTER TABLE "expertos" ADD CONSTRAINT "CHK_expertos_estado" CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'aprobado'::character varying, 'rechazado'::character varying, 'suspendido'::character varying])::text[])));
ALTER TABLE "resenas_experto" ADD CONSTRAINT "CHK_resenas_experto_puntuacion" CHECK (((puntuacion >= 1) AND (puntuacion <= 5)));
ALTER TABLE "resenas_experto" ADD CONSTRAINT "CHK_resenas_experto_estado" CHECK (((estado)::text = ANY ((ARRAY['publicada'::character varying, 'oculta'::character varying])::text[])));
ALTER TABLE "patrocinios_experto" ADD CONSTRAINT "CHK_patrocinios_experto_estado" CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'cancelado'::character varying, 'vencido'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_usuario_estado ON public.analisis_mercado USING btree (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_fecha_creacion ON public.analisis_mercado USING btree (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_mercado_producto_id ON public.analisis_mercado USING btree (producto_id);
CREATE INDEX IF NOT EXISTS idx_analisis_marketing_usuario_estado ON public.analisis_marketing USING btree (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_marketing_fecha_creacion ON public.analisis_marketing USING btree (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_marketing_producto_id ON public.analisis_marketing USING btree (producto_id);
CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_usuario_estado ON public.analisis_finanzas USING btree (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_fecha_creacion ON public.analisis_finanzas USING btree (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_finanzas_producto_id ON public.analisis_finanzas USING btree (producto_id);
CREATE INDEX IF NOT EXISTS idx_analisis_brief_usuario_estado ON public.analisis_brief USING btree (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_brief_fecha_creacion ON public.analisis_brief USING btree (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_brief_producto_id ON public.analisis_brief USING btree (producto_id);
CREATE INDEX IF NOT EXISTS idx_analisis_ventas_usuario_estado ON public.analisis_ventas USING btree (usuario_id, estado_analisis);
CREATE INDEX IF NOT EXISTS idx_analisis_ventas_fecha_creacion ON public.analisis_ventas USING btree (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_analisis_ventas_producto_id ON public.analisis_ventas USING btree (producto_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_email ON public.usuarios USING btree (email);
CREATE INDEX IF NOT EXISTS idx_usuario_plan ON public.usuarios USING btree (plan);
CREATE INDEX IF NOT EXISTS idx_producto_usuario_id ON public.productos USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS "IDX_analisis_mercado_usuario" ON public.analisis_mercado USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS "IDX_usuarios_owner_id" ON public.usuarios USING btree (owner_id);
CREATE INDEX IF NOT EXISTS "IDX_movimientos_referencia" ON public.movimientos_contables USING btree (referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS "IDX_metas_negocio_periodo_fin" ON public.metas_negocio USING btree (periodo_fin);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfil_usuario_plataforma_handle ON public.perfiles_analiticos USING btree (usuario_id, plataforma, handle);
CREATE INDEX IF NOT EXISTS "IDX_cotizaciones_usuario_cliente" ON public.cotizaciones USING btree (usuario_id, cliente_id);
CREATE INDEX IF NOT EXISTS "IDX_movimientos_inventario_venta" ON public.movimientos_inventario USING btree (venta_id);
CREATE INDEX IF NOT EXISTS "IDX_mov_inv_usuario_fecha_tipo" ON public.movimientos_inventario USING btree (usuario_id, fecha, tipo);
CREATE INDEX IF NOT EXISTS "IDX_mov_cont_usuario_fecha_tipo" ON public.movimientos_contables USING btree (usuario_id, fecha, tipo);
CREATE INDEX IF NOT EXISTS "IDX_expertos_directorio" ON public.expertos USING btree (estado, categoria, rating_promedio DESC);
CREATE INDEX IF NOT EXISTS "IDX_expertos_pendientes" ON public.expertos USING btree (fecha_creacion) WHERE ((estado)::text = 'pendiente'::text);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_patrocinios_experto_subscription" ON public.patrocinios_experto USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "IDX_patrocinios_experto_activos" ON public.patrocinios_experto USING btree (categoria, prioridad DESC) WHERE ((estado)::text = 'activo'::text);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expertos_usuario_categoria" ON public.expertos USING btree (usuario_id, categoria) WHERE (usuario_id IS NOT NULL);

-- 3) Columnas: mismos valores por defecto y longitud que en producción
ALTER TABLE "analisis_legal" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "asignaciones_trabajador" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "invitaciones_trabajador" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "canales_cobro" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "negocios" ALTER COLUMN "emoji" SET DEFAULT '📁';
ALTER TABLE "analisis_ventas" ALTER COLUMN "tamano_equipo" TYPE varchar(20);

COMMIT;
