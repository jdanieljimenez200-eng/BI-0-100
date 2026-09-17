/**
 * seed-demo-zona-m2.ts — Siembra UNA cuenta con CUATRO productos, cada uno con
 * su análisis de Mercado completado, elegidos para que se VEA el bloque de
 * "Local y Zona" (m², precio por m² y renta mensual) en las cuatro ramas reales
 * de `calcularRentaZona`:
 *
 *   1. Panadería Sol de Oro   → m² DECLARADOS + precio por m² declarado
 *                               origen: 'derivada_m2', superficie 'declarada', confianza alta
 *   2. Taller Bici Urbana     → SIN m² declarados: los estima el modelo operativo
 *                               origen: 'derivada_m2', superficie 'modelo_operativo', confianza media
 *   3. Cafetería Estación Norte → renta mensual DECLARADA muy por debajo del modelo
 *                               origen: 'declarada' + advertencia de desvío (>40%)
 *   4. Cactus Store MX        → tipo_local 'sin_local'
 *                               origen: 'sin_local', renta 0
 *
 * Los tres primeros declaran `precio_m2_mes_declarado`, así que la renta se
 * deriva SIN depender de ZONA_PRECIOS_M2_JSON ni de ZONA_PRECIOS_API_URL.
 *
 * Sin ANTHROPIC_API_KEY los servicios con IA usan su fallback mock coherente;
 * el bloque de zona es 100% determinista.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-demo-zona-m2.ts
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos antes de sembrar.
 *
 * Credenciales sembradas:
 *   zona@bi0a100.test  /  ZonaDemo123!   [pro, user]
 *
 * NUNCA ejecutar contra una base de datos de producción.
 */
import './guardiaSeeds';
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';

import { ejecutarAnalisisMercado } from '../services/mercado/mercadoOrchestrator';
import { MercadoAnalisisInput } from '../services/mercado/types';
import type { TipoLocal } from '../services/zona/types';

const BCRYPT_ROUNDS = 12;

const CUENTA = {
  email: 'zona@bi0a100.test',
  password: 'ZonaDemo123!',
  nombre: 'Demo Zona y m2',
};

/** Configuración de un producto demo + los inputs de Mercado que lo acompañan. */
interface ProductoDemo {
  /** Qué rama del cálculo de renta demuestra este producto. */
  caso: string;
  // ── Producto ──
  nombre: string;
  categoria: string;
  tipo: 'producto' | 'servicio';
  descripcion: string;
  estatus_proyecto: string;
  pais: string;
  precio_esperado: number;
  inversion_inicial: number;
  costos_fijos: number;
  canal_venta: string;
  puv: string;
  cliente_ideal: string;
  nse: string;
  direccion: string;
  // ── Mercado ──
  ciudad: string;
  estado: string;
  zona: string;
  forma_cobro: string;
  // ── Zona / local ──
  tipo_local: TipoLocal;
  m2_declarados?: number;
  precio_m2_mes_declarado?: number;
  personal?: number;
  renta_declarada?: number;
}

const PRODUCTOS: ProductoDemo[] = [
  {
    caso: 'm² declarados por el usuario + precio por m² declarado → renta derivada con confianza alta',
    nombre: 'Panadería Sol de Oro',
    categoria: 'Alimentos y bebidas',
    tipo: 'producto',
    descripcion:
      'Panadería artesanal de masa madre con obrador propio y venta en mostrador. Produce pan de fermentación lenta, conchas rellenas y bollería para cafeterías de la zona.',
    estatus_proyecto: 'Idea',
    pais: 'MX',
    precio_esperado: 65,
    inversion_inicial: 380000,
    costos_fijos: 74000,
    canal_venta: 'Mostrador propio y venta mayorista a cafeterías',
    puv: 'Pan de masa madre con fermentación de 24 horas, horneado dos veces al día, a precio de panadería de barrio.',
    cliente_ideal:
      'Familias y profesionistas 28-55 de Narvarte y Del Valle que compran pan fresco varias veces por semana, más cafeterías de especialidad que revenden bollería.',
    nse: 'C+',
    direccion: 'Av. Universidad valor 1200, Col. Narvarte, Ciudad de México',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    zona: 'Narvarte',
    forma_cobro: 'Pago único',
    tipo_local: 'produccion_alimentos',
    m2_declarados: 95,
    precio_m2_mes_declarado: 420,
    personal: 4,
  },
  {
    caso: 'sin m² declarados → los dimensiona el modelo operativo (confianza media + advertencia)',
    nombre: 'Taller Bici Urbana',
    categoria: 'Servicios',
    tipo: 'servicio',
    descripcion:
      'Taller de reparación y mantenimiento de bicicletas urbanas y eléctricas, con servicio express en 24 horas y recolección a domicilio dentro de la alcaldía.',
    estatus_proyecto: 'Idea',
    pais: 'MX',
    precio_esperado: 520,
    inversion_inicial: 210000,
    costos_fijos: 52000,
    canal_venta: 'Taller físico y WhatsApp con recolección a domicilio',
    puv: 'Servicio de taller en 24 horas con diagnóstico gratuito y recolección a domicilio, incluida la reparación de bicicletas eléctricas.',
    cliente_ideal:
      'Ciclistas urbanos 22-45 que usan la bici para ir al trabajo en Roma, Condesa y Doctores, más repartidores de app con bici eléctrica.',
    nse: 'C+',
    direccion: 'Calle Doctor Erazo 80, Col. Doctores, Ciudad de México',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    zona: 'Doctores',
    forma_cobro: 'Pago único',
    tipo_local: 'taller',
    precio_m2_mes_declarado: 260,
    personal: 3,
  },
  {
    caso: 'renta mensual declarada muy por debajo del modelo → origen declarada + advertencia de desvío',
    nombre: 'Cafetería Estación Norte',
    categoria: 'Alimentos y bebidas',
    tipo: 'servicio',
    descripcion:
      'Cafetería de especialidad con tostado propio, 24 lugares y barra de métodos manuales. Vende también café en grano para llevar y clases de barismo los sábados.',
    estatus_proyecto: 'Negocio en Marcha',
    pais: 'MX',
    precio_esperado: 78,
    inversion_inicial: 540000,
    costos_fijos: 96000,
    canal_venta: 'Local propio, apps de delivery y venta de grano en línea',
    puv: 'Café de origen tostado en el propio local, con trazabilidad del productor y cata guiada sin costo al comprar grano.',
    cliente_ideal:
      'Profesionistas y estudiantes 24-40 de Santa María la Ribera que trabajan desde cafeterías y valoran café de especialidad sobre precio bajo.',
    nse: 'C+',
    direccion: 'Calle Sabino 210, Col. Santa María la Ribera, Ciudad de México',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    zona: 'Santa María la Ribera',
    forma_cobro: 'Pago único',
    tipo_local: 'servicio_atencion',
    m2_declarados: 70,
    precio_m2_mes_declarado: 650,
    personal: 5,
    // 70 m² × 650 = 45.500/mes de modelo; la declarada queda ~45% por debajo
    // (contrato antiguo) y dispara la advertencia de desvío del servicio.
    renta_declarada: 25000,
  },
  {
    caso: 'operación sin local físico → renta 0 con origen sin_local',
    nombre: 'Cactus Store MX',
    categoria: 'Hogar y jardín',
    tipo: 'producto',
    descripcion:
      'Tienda en línea de cactus y suculentas en maceta de barro, enviada en caja con protección y guía de cuidado. Opera desde el domicilio del fundador, sin local comercial.',
    estatus_proyecto: 'Idea',
    pais: 'MX',
    precio_esperado: 240,
    inversion_inicial: 38000,
    costos_fijos: 9000,
    canal_venta: 'Tienda en línea propia e Instagram',
    puv: 'Cactus listos para regalo, con maceta de barro artesanal y guía de riego impresa, entregados en 48 horas y con garantía de llegada sin daños.',
    cliente_ideal:
      'Mujeres y hombres 22-40 de zonas urbanas que decoran departamento pequeño y buscan plantas de bajo mantenimiento o regalos originales.',
    nse: 'C',
    direccion: 'Venta 100% en línea, Ciudad de México',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    zona: 'Venta en línea',
    forma_cobro: 'Pago único',
    tipo_local: 'sin_local',
  },
];

/** Crea (o actualiza) la cuenta demo y devuelve la entidad persistida. */
async function upsertUsuario(): Promise<Usuario> {
  const repo = AppDataSource.getRepository(Usuario);
  const password_hash = await bcrypt.hash(CUENTA.password, BCRYPT_ROUNDS);
  const existing = await repo.findOne({ where: { email: CUENTA.email } });

  if (existing) {
    existing.password_hash = password_hash;
    existing.nombre = CUENTA.nombre;
    existing.plan = 'pro';
    existing.role = 'user';
    existing.account_role = 'owner';
    existing.owner_id = null;
    existing.analisis_disponibles = 999;
    existing.creditos_marketing = 50;
    existing.activo = true;
    existing.intentos_login = 0;
    existing.bloqueado_hasta = null as unknown as Date;
    await repo.save(existing);
    console.log(`↻ usuario actualizado: ${CUENTA.email}`);
    return existing;
  }

  const usuario = repo.create({
    email: CUENTA.email,
    password_hash,
    nombre: CUENTA.nombre,
    plan: 'pro',
    role: 'user',
    account_role: 'owner',
    owner_id: null,
    analisis_disponibles: 999,
    creditos_marketing: 50,
    activo: true,
    intentos_login: 0,
  });
  await repo.save(usuario);
  console.log(`＋ usuario creado: ${CUENTA.email}`);
  return usuario;
}

/**
 * Borra los productos previos del usuario. El delete del producto cascadea los
 * análisis (onDelete: 'CASCADE'), pero borramos analisis_mercado antes para que
 * el conteo del log sea real y para cubrir filas cuyo producto ya no exista.
 */
async function limpiarPrevios(usuarioId: string): Promise<void> {
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const productoRepo = AppDataSource.getRepository(Producto);

  const { affected: analisisBorrados } = await mercadoRepo.delete({ usuario_id: usuarioId });
  const { affected: productosBorrados } = await productoRepo.delete({ usuario_id: usuarioId });
  console.log(
    `🧹 Limpieza: ${analisisBorrados ?? 0} análisis de mercado y ${productosBorrados ?? 0} productos previos eliminados`,
  );
}

interface ResultadoSeed {
  producto: Producto;
  analisisId: string;
  caso: string;
  completado: boolean;
  resumenRenta: string;
}

/** Crea el producto, lanza su análisis de Mercado y reporta el bloque de zona. */
async function seedProducto(config: ProductoDemo, usuarioId: string): Promise<ResultadoSeed> {
  const productoRepo = AppDataSource.getRepository(Producto);
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);

  const producto = await productoRepo.save(
    productoRepo.create({
      usuario_id: usuarioId,
      nombre: config.nombre,
      categoria: config.categoria,
      tipo: config.tipo,
      descripcion: config.descripcion,
      estatus_proyecto: config.estatus_proyecto,
      pais: config.pais,
      precio_esperado: config.precio_esperado,
      inversion_inicial: config.inversion_inicial,
      costos_fijos: config.costos_fijos,
      canal_venta: config.canal_venta,
      puv: config.puv,
      cliente_ideal: config.cliente_ideal,
      nse: config.nse,
      direccion: config.direccion,
    }),
  );

  console.log(`\n┌─ 📦 ${producto.nombre} (${producto.id})`);
  console.log(`│  caso: ${config.caso}`);

  const input: MercadoAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    pais: config.pais,
    scope: 'local',
    ciudad: config.ciudad,
    estado: config.estado,
    nse_target: config.nse,
    forma_cobro: config.forma_cobro,
    // Zona / local — sin `tipo_local` el orquestador NO calcula renta.
    tipo_local: config.tipo_local,
    m2_declarados: config.m2_declarados,
    precio_m2_mes_declarado: config.precio_m2_mes_declarado,
    personal: config.personal,
    zona: config.zona,
    renta_declarada: config.renta_declarada,
  };

  const analisis = await mercadoRepo.save(
    mercadoRepo.create({
      producto_id: producto.id,
      usuario_id: usuarioId,
      pais: input.pais,
      scope: input.scope,
      ciudad: input.ciudad,
      estado: input.estado,
      estado_analisis: 'procesando',
    }),
  );

  await ejecutarAnalisisMercado(analisis.id, producto, input);

  const guardado = await mercadoRepo.findOneBy({ id: analisis.id });
  const renta = guardado?.renta_zona_data ?? null;
  const completado = guardado?.estado_analisis === 'completado';

  let resumenRenta: string;
  if (!renta) {
    resumenRenta = 'renta_zona_data = null (no se calculó: revisa tipo_local)';
    console.log(`│  ⚠️  ${resumenRenta}`);
  } else {
    resumenRenta =
      `origen=${renta.origen} | renta=${renta.renta_mensual ?? 'null'} ${renta.moneda ?? ''}`.trim() +
      ` | m²=${renta.m2_totales ?? 'null'} | precio/m²=${renta.precio_m2_mes ?? 'null'}` +
      ` | confianza=${renta.nivel_confianza}`;
    console.log(`│  🏠 ${resumenRenta}`);
    console.log(`│     nota: ${renta.nota}`);
    for (const advertencia of renta.advertencias) {
      console.log(`│     ⚠️  ${advertencia}`);
    }
  }

  console.log(
    `│  score=${guardado?.viabilidad_score ?? '—'} estado=${guardado?.viabilidad_estado ?? '—'} análisis=${guardado?.estado_analisis}`,
  );
  console.log(`└─ /dashboard/mercado/${producto.id}?analisis=${analisis.id}`);

  return { producto, analisisId: analisis.id, caso: config.caso, completado, resumenRenta };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo-zona-m2.ts abortado: NODE_ENV=production. Solo para desarrollo local.');
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  console.log(`\n━━━ ${usuario.email} (${usuario.id}) ━━━`);

  await limpiarPrevios(usuario.id);

  // Secuencial a propósito: los servicios de IA y de competencia comparten
  // rate limits, y así los logs de cada producto quedan legibles.
  const resultados: ResultadoSeed[] = [];
  for (const config of PRODUCTOS) {
    resultados.push(await seedProducto(config, usuario.id));
  }

  console.log('\n─── Resultado del seed ───');
  for (const r of resultados) {
    console.log(`  ${r.completado ? '✅' : '⚠️ '} ${r.producto.nombre}`);
    console.log(`      ${r.resumenRenta}`);
    console.log(`      /dashboard/mercado/${r.producto.id}?analisis=${r.analisisId}`);
  }

  console.log('\n🔑 Credenciales:');
  console.log(`   ${CUENTA.email}  /  ${CUENTA.password}   [pro, user]`);
  console.log('\n💡 Para ver el campo de m² en el FORMULARIO: entra a un producto,');
  console.log('   abre "Local y Zona" y elige un "Tipo de local" distinto de');
  console.log('   "Sin local" — el bloque de m², precio por m² y personal aparece entonces.');

  const todoOk = resultados.every((r) => r.completado);
  await AppDataSource.destroy();
  process.exit(todoOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});