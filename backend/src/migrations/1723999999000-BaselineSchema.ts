import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BASELINE DEL ESQUEMA — primera migración de la cadena (timestamp inferior a
 * 1724000000000-AddIndexesForPerformance).
 *
 * Motivo de existir: 23 de las 31 tablas de la base de datos nunca fueron
 * creadas por una migración, sino por `synchronize: true` en desarrollo. Las 8
 * restantes SÍ tienen migración propia y por eso NO se tocan aquí:
 *   analisis_legal, invitaciones_trabajador, asignaciones_trabajador, articulos,
 *   metas_negocio, perfiles_analiticos, perfil_videos (+ `migrations`, interna
 *   de TypeORM).
 *
 * Contenido, extraído literalmente de un `pg_dump --schema-only` de la BD real
 * (no reconstruido desde las entidades, para no divergir en tipos, longitudes
 * de varchar, precisión de numeric ni defaults):
 *   - extensión uuid-ossp con `WITH SCHEMA public` (todos los `id` usan
 *     `public.uuid_generate_v4()`; sin la cualificación de esquema el default
 *     falla si el search_path es distinto)
 *   - 23 CREATE TABLE
 *   - 23 PRIMARY KEY + 3 UNIQUE
 *   - 46 FOREIGN KEY, con su ON DELETE exacto (CASCADE / SET NULL / sin acción):
 *     es la parte que no se puede inferir y que decide qué pasa al borrar un
 *     usuario o un producto
 *   - 39 índices. NO incluye los 24 que ya crean
 *     1724000000000-AddIndexesForPerformance (los 18 `idx_analisis_*_*` más
 *     idx_usuario_email, idx_usuario_plan, idx_producto_usuario_id) y
 *     1774918332277-UpdateIndexes (IDX_analisis_mercado_estado,
 *     IDX_analisis_mercado_usuario, IDX_productos_usuario), ni los que
 *     pertenecen a tablas con migración propia.
 *
 * Es IDEMPOTENTE a propósito: sobre la base de datos existente `migration:run`
 * no recrea nada y solo registra la fila en `migrations`; sobre una base de
 * datos limpia crea el esquema completo.
 */

interface ConstraintSpec {
  /** Nombre de la tabla, sin cualificar. */
  table: string;
  /** Nombre exacto de la constraint tal como existe en producción. */
  name: string;
  /** Cuerpo de la constraint, sin el `ADD CONSTRAINT "<name>"`. */
  definition: string;
}

const CREATE_EXTENSION = 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public';

const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS public.usuarios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    nombre character varying NOT NULL,
    plan character varying DEFAULT 'freemium'::character varying NOT NULL,
    account_role character varying DEFAULT 'owner'::character varying NOT NULL,
    es_admin boolean DEFAULT false NOT NULL,
    owner_id uuid,
    analisis_disponibles integer DEFAULT 0 NOT NULL,
    creditos_marketing integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    limit_analisis_mercado integer DEFAULT '-1'::integer NOT NULL,
    limit_analisis_marketing integer DEFAULT '-1'::integer NOT NULL,
    limit_analisis_finanzas integer DEFAULT '-1'::integer NOT NULL,
    limit_analisis_legal integer DEFAULT '-1'::integer NOT NULL,
    limit_analisis_brief integer DEFAULT '-1'::integer NOT NULL,
    max_productos integer DEFAULT '-1'::integer NOT NULL,
    max_herramientas integer DEFAULT '-1'::integer NOT NULL,
    stripe_customer_id character varying,
    stripe_subscription_id character varying,
    stripe_event_ts bigint,
    plan_expires_at timestamp without time zone,
    datos_negocio jsonb,
    vertical_activo character varying
  )`,

  `CREATE TABLE IF NOT EXISTS public.productos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    categoria character varying(255),
    precio numeric(10,2),
    stock integer,
    status character varying(50) DEFAULT 'activo'::character varying NOT NULL,
    negocio_id uuid,
    pais character varying(2),
    nse character varying(50),
    imagen_url character varying(500),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    fecha_creacion timestamp without time zone,
    video_url character varying(500)
  )`,

  `CREATE TABLE IF NOT EXISTS public.negocios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    nombre character varying NOT NULL,
    emoji character varying DEFAULT '📁'::character varying,
    descripcion text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.herramientas_seleccionadas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    herramienta_key character varying(40) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.temas_usuario (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    wallpaper_url character varying,
    wallpaper_preset character varying(60),
    wallpaper_overlay integer DEFAULT 50 NOT NULL,
    tema_preset character varying(20),
    color_acento character varying(9),
    color_fondo character varying(20),
    logo_url character varying,
    nombre_sistema character varying(60),
    ui_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.stripe_event (
    event_id character varying NOT NULL,
    event_type character varying NOT NULL,
    event_created bigint NOT NULL,
    procesado_en timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.analisis_mercado (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    producto_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    pais character varying DEFAULT 'MX'::character varying NOT NULL,
    scope character varying DEFAULT 'local'::character varying NOT NULL,
    ciudad character varying,
    estado character varying,
    viabilidad_score integer,
    viabilidad_estado character varying,
    viabilidad_factores jsonb,
    volumen_busquedas_mensual integer,
    tendencia_porcentaje numeric(6,2),
    total_competidores integer,
    tendencias_data jsonb,
    competencia_data jsonb,
    densidad_data jsonb,
    dafo_data jsonb,
    tam_data jsonb,
    alertas jsonb,
    reporte_bi_data jsonb,
    precio_usuario numeric(12,2),
    confianza_analisis character varying,
    payback_data jsonb,
    renta_zona_data jsonb,
    estudio_area_data jsonb,
    datos_oficiales_data jsonb,
    estado_analisis character varying DEFAULT 'procesando'::character varying NOT NULL,
    error_mensaje text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_completado timestamp without time zone
  )`,

  `CREATE TABLE IF NOT EXISTS public.analisis_marketing (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    producto_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    analisis_mercado_id character varying,
    voz_marca character varying,
    presupuesto_mensual integer,
    meta_campana character varying,
    estrategias_data jsonb,
    copies_data jsonb,
    calendario_data jsonb,
    estado_analisis character varying DEFAULT 'procesando'::character varying NOT NULL,
    error_mensaje text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_completado timestamp without time zone
  )`,

  `CREATE TABLE IF NOT EXISTS public.analisis_finanzas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    producto_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    pais character varying DEFAULT 'MX'::character varying NOT NULL,
    inputs_data jsonb,
    proyeccion_data jsonb,
    breakeven_data jsonb,
    resumen_data jsonb,
    sensibilidad_data jsonb,
    estado_analisis character varying DEFAULT 'procesando'::character varying NOT NULL,
    overrides_data jsonb,
    error_mensaje text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_completado timestamp without time zone
  )`,

  `CREATE TABLE IF NOT EXISTS public.analisis_brief (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    producto_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    percepcion text,
    emocion character varying DEFAULT 'neutral'::character varying NOT NULL,
    anti_valores text,
    estilo_visual character varying DEFAULT ''::character varying NOT NULL,
    paleta_elegida character varying DEFAULT 'A'::character varying NOT NULL,
    tipo_logo character varying DEFAULT ''::character varying NOT NULL,
    simbolo_representativo character varying DEFAULT ''::character varying NOT NULL,
    resultado_cliente text,
    tono_comunicacion character varying,
    posicionamiento character varying,
    nivel_diferenciacion character varying,
    resultado_data jsonb,
    estado_analisis character varying DEFAULT 'procesando'::character varying NOT NULL,
    error_mensaje text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_completado timestamp without time zone
  )`,

  `CREATE TABLE IF NOT EXISTS public.analisis_ventas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    pais character varying DEFAULT 'MX'::character varying NOT NULL,
    tipo_venta character varying DEFAULT 'B2C_directo'::character varying NOT NULL,
    canal_principal character varying DEFAULT 'directo'::character varying NOT NULL,
    ticket_promedio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    tamano_equipo character varying DEFAULT 'solo_tu'::character varying NOT NULL,
    objetivo_ventas character varying,
    nombre_producto character varying DEFAULT ''::character varying NOT NULL,
    categoria character varying DEFAULT ''::character varying NOT NULL,
    precio numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    inputs_data jsonb,
    tips_data jsonb,
    historia_data jsonb,
    porque_fallan_data jsonb,
    secciones_bloqueadas text,
    estado_analisis character varying DEFAULT 'procesando'::character varying NOT NULL,
    error_mensaje text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_completado timestamp without time zone
  )`,

  `CREATE TABLE IF NOT EXISTS public.marcas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    producto_id uuid,
    nombre character varying NOT NULL,
    slogan character varying,
    descripcion text,
    logo_url character varying,
    dominio character varying,
    paleta_colores jsonb,
    tipografia character varying,
    brief_data jsonb,
    logo_analysis jsonb,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.clientes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    negocio_id uuid,
    producto_id uuid,
    nombre character varying(200) NOT NULL,
    tipo_contacto character varying(20) DEFAULT 'cliente'::character varying NOT NULL,
    empresa character varying(200),
    email character varying(200),
    telefono character varying(30),
    direccion text,
    notas text,
    categoria character varying(100),
    emoji character varying(8),
    estado character varying(20) DEFAULT 'cliente'::character varying NOT NULL,
    fecha_ultimo_contacto date,
    activo boolean DEFAULT true NOT NULL,
    atributos_extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.citas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    negocio_id uuid,
    producto_id uuid,
    cliente_id uuid,
    titulo character varying(200) NOT NULL,
    fecha date NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    cliente_nombre character varying(200),
    cliente_telefono character varying(30),
    cliente_email character varying(200),
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    notas text,
    color character varying(20) DEFAULT '#3B82F6'::character varying NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    negocio_id uuid,
    producto_id uuid,
    numero character varying(20) NOT NULL,
    cliente_nombre character varying(200) NOT NULL,
    cliente_empresa character varying(200),
    cliente_email character varying(200),
    cliente_telefono character varying(30),
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    descuento_pct numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    descuento_monto numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    impuesto_tasa numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    impuesto_nombre character varying(20) DEFAULT 'IVA'::character varying NOT NULL,
    impuesto_monto numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    moneda character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    fecha_vencimiento date,
    notas text,
    marca_nombre character varying(200),
    marca_color character varying(7),
    marca_logo_url character varying,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.empleados (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    negocio_id uuid,
    producto_id uuid,
    nombre character varying(200) NOT NULL,
    cargo character varying(100),
    salario numeric(14,2) NOT NULL,
    tipo_pago character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    moneda character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    telefono character varying(30),
    email character varying(200),
    fecha_inicio date,
    notas text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.pagos_nomina (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    empleado_id uuid NOT NULL,
    empleado_nombre character varying(200) NOT NULL,
    monto numeric(14,2) NOT NULL,
    moneda character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    periodo_inicio date NOT NULL,
    periodo_fin date NOT NULL,
    fecha_pago date NOT NULL,
    notas text,
    movimiento_id uuid,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.insumos_inventario (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    negocio_id uuid,
    nombre character varying(255) NOT NULL,
    categoria character varying(100),
    unidad character varying(30) DEFAULT 'pieza'::character varying NOT NULL,
    stock_actual numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    stock_minimo numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    costo_promedio numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    proveedor_default character varying(200),
    ubicacion character varying(200),
    emoji character varying(8),
    imagen_url character varying(500),
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.items_pos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    negocio_id uuid,
    nombre character varying(255) NOT NULL,
    descripcion text,
    precio numeric(12,2) NOT NULL,
    categoria character varying(100),
    imagen_url character varying(500),
    emoji character varying(8),
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.movimientos_contables (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    producto_id uuid,
    tipo character varying(10) NOT NULL,
    descripcion character varying(255) NOT NULL,
    categoria character varying(100),
    monto numeric(12,2) NOT NULL,
    fecha date NOT NULL,
    parent_movimiento_id uuid,
    es_auto_generado boolean DEFAULT false NOT NULL,
    tiene_cfdi boolean DEFAULT false NOT NULL,
    fuente character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    batch_id uuid,
    referencia_tipo character varying(30),
    referencia_id uuid,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    insumo_id uuid NOT NULL,
    producto_id uuid,
    tipo character varying(20) NOT NULL,
    cantidad numeric(12,3) NOT NULL,
    costo_unitario numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    costo_total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    stock_resultante numeric(12,3) DEFAULT '0'::numeric NOT NULL,
    fecha date NOT NULL,
    motivo character varying(255),
    proveedor character varying(200),
    movimiento_contable_id uuid,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.ventas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    creado_por_id uuid,
    producto_id uuid NOT NULL,
    negocio_id uuid,
    numero_ticket character varying(20) NOT NULL,
    fecha date NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    impuesto_monto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    impuesto_tasa numeric(5,4) DEFAULT '0'::numeric NOT NULL,
    impuesto_nombre character varying(50) DEFAULT 'IVA'::character varying NOT NULL,
    moneda character varying(3) DEFAULT 'MXN'::character varying NOT NULL,
    total numeric(12,2) NOT NULL,
    metodo_pago character varying(30) DEFAULT 'efectivo'::character varying NOT NULL,
    cliente_nombre character varying(200),
    cliente_telefono character varying(30),
    notas text,
    estado character varying(20) DEFAULT 'completada'::character varying NOT NULL,
    movimiento_contable_id uuid,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS public.venta_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    venta_id uuid NOT NULL,
    item_pos_id uuid,
    nombre_snapshot character varying(255) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    cantidad numeric(8,2) DEFAULT '1'::numeric NOT NULL,
    subtotal_linea numeric(12,2) NOT NULL
  )`,
];

/** 23 PRIMARY KEY + 3 UNIQUE, con los nombres exactos de producción. */
const CONSTRAINTS_PK_UQ: ConstraintSpec[] = [
  { table: 'usuarios', name: 'PK_d7281c63c176e152e4c531594a8', definition: 'PRIMARY KEY (id)' },
  { table: 'productos', name: 'PK_04f604609a0949a7f3b43400766', definition: 'PRIMARY KEY (id)' },
  { table: 'negocios', name: 'PK_07babc2e49895ef5292beeb4441', definition: 'PRIMARY KEY (id)' },
  {
    table: 'herramientas_seleccionadas',
    name: 'PK_e0d835a9e711e32ed6607dd320d',
    definition: 'PRIMARY KEY (id)',
  },
  { table: 'temas_usuario', name: 'PK_4735a061eee9c73d00939f8c590', definition: 'PRIMARY KEY (id)' },
  {
    table: 'stripe_event',
    name: 'PK_8fd90f868c33706efde57d7211e',
    definition: 'PRIMARY KEY (event_id)',
  },
  {
    table: 'analisis_mercado',
    name: 'PK_c5923e455769d4a0d65ff3063e0',
    definition: 'PRIMARY KEY (id)',
  },
  {
    table: 'analisis_marketing',
    name: 'PK_69fa318d3b698d19d9c9f82e1cc',
    definition: 'PRIMARY KEY (id)',
  },
  {
    table: 'analisis_finanzas',
    name: 'PK_74e8e0dc528053d35f3fae6ea9e',
    definition: 'PRIMARY KEY (id)',
  },
  {
    table: 'analisis_brief',
    name: 'PK_b0790129bc4bc53606011af20bd',
    definition: 'PRIMARY KEY (id)',
  },
  {
    table: 'analisis_ventas',
    name: 'PK_b1ab0b9761bf09c2f2f8e5b3646',
    definition: 'PRIMARY KEY (id)',
  },
  { table: 'marcas', name: 'PK_0dabf9ed9a15bfb634cb675f7d4', definition: 'PRIMARY KEY (id)' },
  { table: 'clientes', name: 'PK_d76bf3571d906e4e86470482c08', definition: 'PRIMARY KEY (id)' },
  { table: 'citas', name: 'PK_43851fd780e10030fbe5bb1b912', definition: 'PRIMARY KEY (id)' },
  { table: 'cotizaciones', name: 'PK_4fcc685d6bca9b3a997ba9cd3bc', definition: 'PRIMARY KEY (id)' },
  { table: 'empleados', name: 'PK_73a63a6fcb4266219be3eb0ce8a', definition: 'PRIMARY KEY (id)' },
  { table: 'pagos_nomina', name: 'PK_2fa5a96b02fcadd82d991092a1d', definition: 'PRIMARY KEY (id)' },
  {
    table: 'insumos_inventario',
    name: 'PK_0c2d2d880d3281807bea427d245',
    definition: 'PRIMARY KEY (id)',
  },
  { table: 'items_pos', name: 'PK_71dd10789fdd613899966bb245f', definition: 'PRIMARY KEY (id)' },
  {
    table: 'movimientos_contables',
    name: 'PK_0db46299d2bbd34e471dac18102',
    definition: 'PRIMARY KEY (id)',
  },
  {
    table: 'movimientos_inventario',
    name: 'PK_812f6e4f95b017981363c4b9ff9',
    definition: 'PRIMARY KEY (id)',
  },
  { table: 'ventas', name: 'PK_b8b73abe8561829c019531d9a2e', definition: 'PRIMARY KEY (id)' },
  { table: 'venta_items', name: 'PK_6506a1ae8240b069cab6a5c7c96', definition: 'PRIMARY KEY (id)' },

  { table: 'usuarios', name: 'UQ_446adfc18b35418aac32ae0b7b5', definition: 'UNIQUE (email)' },
  {
    table: 'temas_usuario',
    name: 'UQ_2f1552cc553e8c577cdf7c53e98',
    definition: 'UNIQUE (usuario_id)',
  },
  {
    table: 'herramientas_seleccionadas',
    name: 'UQ_a41cdd490e96916fde500a0debb',
    definition: 'UNIQUE (usuario_id, herramienta_key)',
  },
];

/**
 * 46 FOREIGN KEY. El `ON DELETE` es literal del dump: es lo que decide si al
 * borrar un usuario o un producto los hijos se borran (CASCADE), se quedan
 * huérfanos con NULL (SET NULL) o el borrado falla (sin acción).
 */
const CONSTRAINTS_FK: ConstraintSpec[] = [
  {
    table: 'usuarios',
    name: 'FK_bfadc259f72c9b1ab51301f0e31',
    definition: 'FOREIGN KEY (owner_id) REFERENCES public.usuarios(id)',
  },
  {
    table: 'productos',
    name: 'FK_12b2bc8b2bf53a2225681984614',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)',
  },
  {
    table: 'negocios',
    name: 'FK_e3c7403dc33dcdd05c8736a5026',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'herramientas_seleccionadas',
    name: 'FK_0793db1577f433ec36b50d80057',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)',
  },

  {
    table: 'analisis_mercado',
    name: 'FK_4244779721d22bf4dad0f55264e',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_mercado',
    name: 'FK_4cf8f9f7b70b92ac45b59b7e9b8',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_marketing',
    name: 'FK_226181e954d5eb35f5466e47575',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_marketing',
    name: 'FK_cf72911b5f21b7fc91a3df77d58',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_finanzas',
    name: 'FK_2226430c7d4cc8ed496fe2b8ac1',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_finanzas',
    name: 'FK_30ed2cae56e2cab897fee83b9d1',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_brief',
    name: 'FK_53bcdb67ba3c133428d4ade0d87',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_brief',
    name: 'FK_5fb27250dc1aba51136c8423c8a',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE',
  },
  {
    table: 'analisis_ventas',
    name: 'FK_8bff2e615c7b674d72d927ad456',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)',
  },
  {
    table: 'analisis_ventas',
    name: 'FK_3624baecdaf80e3a62ed3767c9b',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id)',
  },

  {
    table: 'marcas',
    name: 'FK_863b18e8dac607855c5a54f0cf9',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'marcas',
    name: 'FK_a1d19caf658701eecf7faf44a7c',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL',
  },

  {
    table: 'clientes',
    name: 'FK_edcf87e2f9017c3bd010d54b2d1',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'clientes',
    name: 'FK_7c4641e1e95b7f809e4fee1b4fd',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL',
  },
  {
    table: 'clientes',
    name: 'FK_9e1dbee916002abee2678f14b6f',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL',
  },

  {
    table: 'citas',
    name: 'FK_a1662fa22f39475bb39bf010ef6',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'citas',
    name: 'FK_667625f6a2a09ee125f8637a7f8',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL',
  },
  {
    table: 'citas',
    name: 'FK_f397ad5beb86af84c8376cc7af5',
    definition: 'FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL',
  },

  {
    table: 'cotizaciones',
    name: 'FK_de57c2896aac257e6a756b71e25',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'cotizaciones',
    name: 'FK_c8272964bd6ba9d875ce6dc7f32',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL',
  },

  {
    table: 'empleados',
    name: 'FK_8a9bfbf5f1b55c0ca3a16abd3f0',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'empleados',
    name: 'FK_1ec496b359395bd9c3d439c561d',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL',
  },

  {
    table: 'pagos_nomina',
    name: 'FK_ebd4a3f80b8b62ef0bbf938b9b0',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'pagos_nomina',
    name: 'FK_93ece0516336d6ee07aaa860cf5',
    definition: 'FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE CASCADE',
  },
  {
    table: 'pagos_nomina',
    name: 'FK_435ec96c791fb365ca02045c044',
    definition:
      'FOREIGN KEY (movimiento_id) REFERENCES public.movimientos_contables(id) ON DELETE SET NULL',
  },

  {
    table: 'insumos_inventario',
    name: 'FK_14d1e4a8c13d1af174e59e11733',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'insumos_inventario',
    name: 'FK_2b6068b65905e521dd9e3f8ef2f',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE CASCADE',
  },

  {
    table: 'items_pos',
    name: 'FK_0f705061d1bddcdb58b5ceaa70d',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'items_pos',
    name: 'FK_c0b87260985e78031c6e472f60a',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE CASCADE',
  },

  {
    table: 'movimientos_contables',
    name: 'FK_4c79b3b78978b2215247dbe834f',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'movimientos_contables',
    name: 'FK_60bd498a0b3da18d35b023272ff',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL',
  },
  {
    table: 'movimientos_contables',
    name: 'FK_76ccd57d27469741d487f83919d',
    definition:
      'FOREIGN KEY (parent_movimiento_id) REFERENCES public.movimientos_contables(id) ON DELETE SET NULL',
  },

  {
    table: 'movimientos_inventario',
    name: 'FK_c86769588f51c7bbb6bf78ca32b',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'movimientos_inventario',
    name: 'FK_ceca390fb37d6b21633d0fef288',
    definition:
      'FOREIGN KEY (insumo_id) REFERENCES public.insumos_inventario(id) ON DELETE CASCADE',
  },
  {
    table: 'movimientos_inventario',
    name: 'FK_34e722a39e30087fa624b5955d5',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL',
  },
  {
    table: 'movimientos_inventario',
    name: 'FK_7a176b2a91a46a59e3a110c63b7',
    definition:
      'FOREIGN KEY (movimiento_contable_id) REFERENCES public.movimientos_contables(id) ON DELETE SET NULL',
  },

  {
    table: 'ventas',
    name: 'FK_5c564fe8d2b5182a37211405827',
    definition: 'FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE',
  },
  {
    table: 'ventas',
    name: 'FK_dbcba4a1d0ba46537c27db0ee60',
    definition: 'FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE',
  },
  {
    table: 'ventas',
    name: 'FK_8b2b2cde7281e2782e4a1a24013',
    definition: 'FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL',
  },
  {
    table: 'ventas',
    name: 'FK_e317ea0dca77e12c629c225bff2',
    definition:
      'FOREIGN KEY (movimiento_contable_id) REFERENCES public.movimientos_contables(id) ON DELETE SET NULL',
  },

  {
    table: 'venta_items',
    name: 'FK_85028d5f15f881b7bb95f61c293',
    definition: 'FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE',
  },
  {
    table: 'venta_items',
    name: 'FK_f42486b38d5abb5a6f95bfaf95e',
    definition: 'FOREIGN KEY (item_pos_id) REFERENCES public.items_pos(id) ON DELETE SET NULL',
  },
];

/**
 * 39 índices. Deliberadamente NO están aquí los 24 que crean
 * AddIndexesForPerformance1724000000000 y UpdateIndexes1774918332277.
 */
const CREATE_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS "IDX_0793db1577f433ec36b50d8005" ON public.herramientas_seleccionadas USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_2f1552cc553e8c577cdf7c53e9" ON public.temas_usuario USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_e3c7403dc33dcdd05c8736a502" ON public.negocios USING btree (usuario_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_1639fc7ae3af3fce1828731e06" ON public.analisis_mercado USING btree (estado_analisis)`,
  `CREATE INDEX IF NOT EXISTS "IDX_6c32cde1fb045c28fb01e73925" ON public.analisis_mercado USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_2f18dbf5ca52c91f28aa65ec31" ON public.analisis_marketing USING btree (estado_analisis)`,
  `CREATE INDEX IF NOT EXISTS "IDX_1a669437c9a42a9bcc66cd0139" ON public.analisis_marketing USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_623096f466fd39d757f91a1a16" ON public.analisis_finanzas USING btree (estado_analisis)`,
  `CREATE INDEX IF NOT EXISTS "IDX_07e854d206e5d25e540cfc63bd" ON public.analisis_finanzas USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_bc06528e7248c0253d3a091e9b" ON public.analisis_brief USING btree (estado_analisis)`,
  `CREATE INDEX IF NOT EXISTS "IDX_46dc351aa65b48179e74b4afb0" ON public.analisis_brief USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_d2d5d7b64d6d0af3e40c325ee8" ON public.analisis_ventas USING btree (usuario_id, producto_id, estado_analisis)`,

  `CREATE INDEX IF NOT EXISTS "IDX_c6d4bece057ba1345e58982e86" ON public.marcas USING btree (usuario_id, producto_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_edcf87e2f9017c3bd010d54b2d" ON public.clientes USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_97b2cfa2f11aabcafc577eaf57" ON public.clientes USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_b5332be6ab156cdf3ba24f7e53" ON public.clientes USING btree (usuario_id, negocio_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_811071d1b5c3c46e2dbcbad6b2" ON public.clientes USING btree (usuario_id, tipo_contacto)`,

  `CREATE INDEX IF NOT EXISTS "IDX_a1662fa22f39475bb39bf010ef" ON public.citas USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_321a6f560a535d91dad1821dbd" ON public.citas USING btree (usuario_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS "IDX_ef4a08a25f6d8e43c97070a6bc" ON public.citas USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_2464991d651e00f86ef92501a5" ON public.citas USING btree (usuario_id, cliente_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_de57c2896aac257e6a756b71e2" ON public.cotizaciones USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_af321886db4857b0ac7a917aa7" ON public.cotizaciones USING btree (usuario_id, producto_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_8a9bfbf5f1b55c0ca3a16abd3f" ON public.empleados USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_96138f10b2b0d6807661f2e63d" ON public.empleados USING btree (usuario_id, producto_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_ebd4a3f80b8b62ef0bbf938b9b" ON public.pagos_nomina USING btree (usuario_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_93ece0516336d6ee07aaa860cf" ON public.pagos_nomina USING btree (empleado_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_d21681675dc64211b0fe6fe5bb" ON public.insumos_inventario USING btree (usuario_id, negocio_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_9c6c74303659e6b4e49b2d02e9" ON public.items_pos USING btree (usuario_id, negocio_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_3267754f10d318811d1e08609a" ON public.movimientos_contables USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_a10ba94549d2e74c332bfdb866" ON public.movimientos_contables USING btree (fecha)`,
  `CREATE INDEX IF NOT EXISTS "IDX_1f28a8d93bea2c5e2c65799683" ON public.movimientos_contables USING btree (fuente)`,
  `CREATE INDEX IF NOT EXISTS "IDX_905fec5cf08eea80d6c6dbcd9f" ON public.movimientos_contables USING btree (batch_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_76ccd57d27469741d487f83919" ON public.movimientos_contables USING btree (parent_movimiento_id)`,

  `CREATE INDEX IF NOT EXISTS "IDX_13c862c1ecd7936b65b0de5d2d" ON public.movimientos_inventario USING btree (usuario_id, insumo_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_e378a019355e3d8da118061555" ON public.movimientos_inventario USING btree (fecha)`,

  `CREATE INDEX IF NOT EXISTS "IDX_2bdea994abda9805d4ba248b1c" ON public.ventas USING btree (usuario_id, producto_id)`,
  `CREATE INDEX IF NOT EXISTS "IDX_4db7514cff921e78d93fe1284f" ON public.ventas USING btree (fecha)`,
  `CREATE INDEX IF NOT EXISTS "IDX_85028d5f15f881b7bb95f61c29" ON public.venta_items USING btree (venta_id)`,
];

/** Las 23 tablas de esta baseline, en orden inverso de dependencia para `down()`. */
const BASELINE_TABLES: string[] = [
  'venta_items',
  'ventas',
  'movimientos_inventario',
  'pagos_nomina',
  'empleados',
  'citas',
  'clientes',
  'cotizaciones',
  'items_pos',
  'insumos_inventario',
  'marcas',
  'analisis_ventas',
  'analisis_brief',
  'analisis_finanzas',
  'analisis_marketing',
  'analisis_mercado',
  'movimientos_contables',
  'temas_usuario',
  'herramientas_seleccionadas',
  'stripe_event',
  'productos',
  'negocios',
  'usuarios',
];

/**
 * Añade una constraint solo si no existe ya. La comprobación va parametrizada
 * ($1/$2); los identificadores del DDL se interpolan porque Postgres no admite
 * parámetros ahí, y provienen exclusivamente de las constantes de este módulo
 * (nunca de entrada externa).
 */
async function addConstraintIfMissing(
  queryRunner: QueryRunner,
  spec: ConstraintSpec
): Promise<void> {
  const rows: Array<{ existe: boolean }> = await queryRunner.query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
         AND t.relname = $1
         AND c.conname = $2
     ) AS "existe"`,
    [spec.table, spec.name]
  );

  if (rows[0]?.existe) {
    return;
  }

  await queryRunner.query(
    `ALTER TABLE public."${spec.table}" ADD CONSTRAINT "${spec.name}" ${spec.definition}`
  );
}

export class BaselineSchema1723999999000 implements MigrationInterface {
  public name = 'BaselineSchema1723999999000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La extensión debe ir primera: todos los `id` la usan como DEFAULT.
    await queryRunner.query(CREATE_EXTENSION);

    for (const statement of CREATE_TABLES) {
      await queryRunner.query(statement);
    }

    // PK y UNIQUE antes de las FK: una FK exige un índice único en el destino.
    for (const spec of CONSTRAINTS_PK_UQ) {
      await addConstraintIfMissing(queryRunner, spec);
    }

    for (const spec of CONSTRAINTS_FK) {
      await addConstraintIfMissing(queryRunner, spec);
    }

    for (const statement of CREATE_INDEXES) {
      await queryRunner.query(statement);
    }
  }

  /**
   * DESTRUCTIVO: revertir la baseline borra las 23 tablas y todos sus datos.
   * Se usa CASCADE porque tablas creadas por migraciones posteriores
   * (articulos, metas_negocio, asignaciones_trabajador, perfiles_analiticos…)
   * apuntan a usuarios/productos/negocios con FK; sin CASCADE el DROP falla.
   * Ejecutar `migration:revert` hasta este punto solo tiene sentido para
   * reconstruir una base de datos desechable desde cero.
   *
   * La extensión uuid-ossp NO se elimina: es compartida con las tablas de las
   * demás migraciones, que también usan uuid_generate_v4() como default.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of BASELINE_TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS public."${table}" CASCADE`);
    }
  }
}