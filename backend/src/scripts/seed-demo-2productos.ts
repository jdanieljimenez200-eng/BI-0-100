/**
 * seed-demo-2productos.ts — Siembra UNA cuenta nueva con DOS productos
 * distintos y los 5 análisis (Mercado, Marketing, Ventas, Finanzas, Legal)
 * ya en estado 'completado' para cada uno, llamando DIRECTAMENTE a los
 * orquestadores reales (síncrono, sin cola BullMQ).
 *
 * Producto 1: "Brownies Artesanales" — repostería premium por encargo en CDMX
 * Producto 2: "App de Paseo de Perros" — servicio digital de paseo canino
 *
 * Sin ANTHROPIC_API_KEY, los servicios con IA usan su fallback mock coherente.
 * Finanzas es 100% determinista (funciones puras), siempre con números reales.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-demo-2productos.ts
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos antes de sembrar.
 *
 * Credenciales sembradas:
 *   demo@bi0a100.test  /  DemoUser123!   [pro, user]
 *
 * NUNCA ejecutar contra una base de datos de producción.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';

import { ejecutarAnalisisMercado } from '../services/mercado/mercadoOrchestrator';
import { ejecutarAnalisisMarketing } from '../services/marketing/marketingOrchestrator';
import { ejecutarAnalisisVentas } from '../services/ventas/ventasOrchestrator';
import { ejecutarAnalisisFinanzas } from '../services/finanzas/finanzasOrchestrator';
import { ejecutarAnalisisLegal } from '../services/legal/legalOrchestrator';

import { MercadoAnalisisInput } from '../services/mercado/types';
import { MarketingAnalisisInput } from '../services/marketing/types';
import { VentasAnalisisInput } from '../services/ventas/types';
import { FinanzasInput } from '../services/finanzas/types';
import { LegalAnalisisInput } from '../services/legal/types';

const BCRYPT_ROUNDS = 12;

// ─── Datos de la cuenta ──────────────────────────────────────────────────────
const CUENTA = {
  email: 'demo@bi0a100.test',
  password: 'DemoUser123!',
  nombre: 'Demo Dos Productos',
};

// ─── Producto 1: Brownies Artesanales ────────────────────────────────────────
const BROWNIE = {
  nombre: 'Brownies Artesanales',
  categoria: 'Alimentos y bebidas',
  tipo: 'producto' as const,
  descripcion: 'Brownies de chocolate belga con nuez y caramelo salado, horneados por encargo con entrega el mismo día en CDMX. Presentación en caja de 6 y 12 piezas para regalo.',
  estatus_proyecto: 'Idea',
  pais: 'MX',
  precio_esperado: 280,
  inversion_inicial: 45000,
  costos_fijos: 12000,
  canal_venta: 'Redes sociales y WhatsApp',
  puv: 'Brownies gourmet de chocolate belga, horneados al momento y entregados el mismo día en CDMX. Caja regalo premium.',
  cliente_ideal: 'Mujeres 25-45, NSE C+/A-, urbanas CDMX, que buscan regalos gourmet originales o postres premium para eventos.',
  nse: 'C+',
  direccion: 'Col. Roma Norte, Ciudad de México',
  precio_venta: 280,
  costo_variable: 95,
  costos_fijos_mes: 12000,
  inversion: 45000,
  unidades_mes: 180,
  crecimiento: 10,
};

// ─── Producto 2: App de Paseo de Perros ─────────────────────────────────────
const DOGWALK = {
  nombre: 'PaseaCanMX',
  categoria: 'Servicios',
  tipo: 'servicio' as const,
  descripcion: 'Plataforma móvil que conecta dueños de perros con paseadores verificados en CDMX. Incluye rastreo GPS en vivo, fotos del paseo y pago en app. Modelo comisión 25% por paseo.',
  estatus_proyecto: 'Idea',
  pais: 'MX',
  precio_esperado: 150,
  inversion_inicial: 220000,
  costos_fijos: 48000,
  canal_venta: 'App Store y Google Play',
  puv: 'Paseos de perros con paseadores verificados, rastreo GPS en tiempo real y fotos del paseo. Agenda desde tu celular en 2 toques.',
  cliente_ideal: 'Profesionistas 28-50 con perro, jornada laboral larga, NSE C+/A-, zonas Condesa/Roma/Polanco/Del Valle/Nápoles CDMX.',
  nse: 'A-',
  direccion: 'CDMX (cobertura metropolitana)',
  precio_venta: 150,
  costo_variable: 48,
  costos_fijos_mes: 48000,
  inversion: 220000,
  unidades_mes: 600,
  crecimiento: 25,
};

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
    existing.creditos_marketing = 100;
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
    creditos_marketing: 100,
    activo: true,
    intentos_login: 0,
  });
  await repo.save(usuario);
  console.log(`＋ usuario creado: ${CUENTA.email}`);
  return usuario;
}

async function limpiarPrevios(usuarioId: string): Promise<void> {
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const marketingRepo = AppDataSource.getRepository(AnalisisMarketing);
  const ventasRepo = AppDataSource.getRepository(AnalisisVentas);
  const finanzasRepo = AppDataSource.getRepository(AnalisisFinanzas);
  const legalRepo = AppDataSource.getRepository(AnalisisLegal);
  const productoRepo = AppDataSource.getRepository(Producto);

  const resultados = await Promise.all([
    mercadoRepo.delete({ usuario_id: usuarioId }),
    marketingRepo.delete({ usuario_id: usuarioId }),
    ventasRepo.delete({ usuario_id: usuarioId }),
    finanzasRepo.delete({ usuario_id: usuarioId }),
    legalRepo.delete({ usuario_id: usuarioId }),
  ]);
  const borrados = resultados.reduce((total, r) => total + (r.affected ?? 0), 0);
  const { affected: productosBorrados } = await productoRepo.delete({ usuario_id: usuarioId });
  console.log(`🧹 Limpieza: ${borrados} análisis y ${productosBorrados ?? 0} productos previos eliminados`);
}

async function seedAnalisisParaProducto(producto: Producto, usuarioId: string): Promise<void> {
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const marketingRepo = AppDataSource.getRepository(AnalisisMarketing);
  const ventasRepo = AppDataSource.getRepository(AnalisisVentas);
  const finanzasRepo = AppDataSource.getRepository(AnalisisFinanzas);
  const legalRepo = AppDataSource.getRepository(AnalisisLegal);

  console.log(`\n  ┌─ Análisis para "${producto.nombre}"`);

  // ─── MERCADO ───────────────────────────────────────────────────────────────
  const mercadoInput: MercadoAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    pais: 'MX',
    scope: 'local',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    nse_target: producto.nse || 'C+',
    forma_cobro: 'Pago único',
  };
  const aMercado = await mercadoRepo.save(mercadoRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    pais: mercadoInput.pais,
    scope: mercadoInput.scope,
    ciudad: mercadoInput.ciudad,
    estado: mercadoInput.estado,
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisMercado(aMercado.id, producto, mercadoInput);
  console.log(`  │ 📊 Mercado     → ${aMercado.id}`);

  // ─── MARKETING ──────────────────────────────────────────────────────────────
  const marketingInput: MarketingAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    vozMarca: 'Profesional y accesible',
    presupuestoMensual: 5000,
    metaCampana: 'Awareness + Conversion',
    plataformas: ['Instagram', 'TikTok'],
    capacidadContenido: '3-4/semana',
  };
  const aMarketing = await marketingRepo.save(marketingRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    voz_marca: 'Profesional y accesible',
    presupuesto_mensual: 5000,
    meta_campana: 'Awareness + Conversion',
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisMarketing(aMarketing.id, producto, marketingInput);
  console.log(`  │ 📣 Marketing   → ${aMarketing.id}`);

  // ─── VENTAS ─────────────────────────────────────────────────────────────────
  const ventasInput: VentasAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    canalesVenta: ['Online', 'Redes Sociales'],
    estrategiaFijacionPrecio: 'Competitiva',
    margenBrutoEsperado: 60,
  };
  const aVentas = await ventasRepo.save(ventasRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    tipo_venta: 'B2C_directo',
    canal_principal: 'online',
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisVentas(aVentas.id, producto, ventasInput);
  console.log(`  │ 💼 Ventas      → ${aVentas.id}`);

  // ─── FINANZAS ───────────────────────────────────────────────────────────────
  const finanzasInput: FinanzasInput = {
    productoId: producto.id,
    usuarioId,
    precio_venta: producto.precio_esperado,
    costo_variable_unitario: (producto.precio_esperado * 0.35),
    costos_fijos_mensuales: producto.costos_fijos,
    unidades_mes_inicial: 100,
    tasa_crecimiento_mensual: 8,
  };
  const aFinanzas = await finanzasRepo.save(finanzasRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    pais: 'MX',
    inputs_data: finanzasInput,
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisFinanzas(aFinanzas.id, finanzasInput, producto);
  console.log(`  │ 💰 Finanzas    → ${aFinanzas.id}`);

  // ─── LEGAL ──────────────────────────────────────────────────────────────────
  const legalInput: LegalAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    forma_juridica: 'Persona Física con Actividad Empresarial',
    tiene_empleados: false,
    vende_en_linea: true,
    exporta_importa: false,
    giro_especifico: producto.categoria,
  };
  const aLegal = await legalRepo.save(legalRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    pais: 'MX',
    forma_juridica: legalInput.forma_juridica,
    tiene_empleados: legalInput.tiene_empleados,
    vende_en_linea: legalInput.vende_en_linea,
    exporta_importa: legalInput.exporta_importa,
    giro_especifico: legalInput.giro_especifico,
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisLegal(aLegal.id, producto, legalInput);
  console.log(`  │ ⚖️  Legal       → ${aLegal.id}`);

  // ─── Verificación ───────────────────────────────────────────────────────────
  const estados = await Promise.all([
    mercadoRepo.findOneBy({ id: aMercado.id }),
    marketingRepo.findOneBy({ id: aMarketing.id }),
    ventasRepo.findOneBy({ id: aVentas.id }),
    finanzasRepo.findOneBy({ id: aFinanzas.id }),
    legalRepo.findOneBy({ id: aLegal.id }),
  ]);

  const resumen = `mercado: ${estados[0]?.estado_analisis} | marketing: ${estados[1]?.estado_analisis} | ventas: ${estados[2]?.estado_analisis} | finanzas: ${estados[3]?.estado_analisis} | legal: ${estados[4]?.estado_analisis}`;
  console.log(`  │ ${resumen}`);

  const ok = estados.every((e) => e?.estado_analisis === 'completado');
  console.log(`  └─ ${ok ? '✅ Todos completados' : '⚠️  Algún análisis NO completó'}`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo-2productos.ts abortado: NODE_ENV=production. Solo para desarrollo local.');
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  const usuarioId = usuario.id;
  console.log(`\n━━━ ${usuario.email} (${usuarioId}) — plan: ${usuario.plan} ━━━`);

  await limpiarPrevios(usuarioId);

  // ─── Crear 2 productos ────────────────────────────────────────────────────
  const productoRepo = AppDataSource.getRepository(Producto);

  const brownie = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: BROWNIE.nombre,
    categoria: BROWNIE.categoria,
    tipo: BROWNIE.tipo,
    descripcion: BROWNIE.descripcion,
    estatus_proyecto: BROWNIE.estatus_proyecto,
    pais: BROWNIE.pais,
    precio_esperado: BROWNIE.precio_esperado,
    inversion_inicial: BROWNIE.inversion_inicial,
    costos_fijos: BROWNIE.costos_fijos,
    canal_venta: BROWNIE.canal_venta,
    puv: BROWNIE.puv,
    cliente_ideal: BROWNIE.cliente_ideal,
    nse: BROWNIE.nse,
    direccion: BROWNIE.direccion,
  }));
  console.log(`📦 Producto 1 creado: ${brownie.nombre}`);

  const dogwalk = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: DOGWALK.nombre,
    categoria: DOGWALK.categoria,
    tipo: DOGWALK.tipo,
    descripcion: DOGWALK.descripcion,
    estatus_proyecto: DOGWALK.estatus_proyecto,
    pais: DOGWALK.pais,
    precio_esperado: DOGWALK.precio_esperado,
    inversion_inicial: DOGWALK.inversion_inicial,
    costos_fijos: DOGWALK.costos_fijos,
    canal_venta: DOGWALK.canal_venta,
    puv: DOGWALK.puv,
    cliente_ideal: DOGWALK.cliente_ideal,
    nse: DOGWALK.nse,
    direccion: DOGWALK.direccion,
  }));
  console.log(`📦 Producto 2 creado: ${dogwalk.nombre}`);

  // ─── Ejecutar análisis para cada producto ─────────────────────────────────
  await seedAnalisisParaProducto(brownie, usuarioId);
  await seedAnalisisParaProducto(dogwalk, usuarioId);

  // ─── Resultado final ──────────────────────────────────────────────────────
  console.log('\n─── Resultado del seed ───');
  console.log(`  Productos: 2`);
  console.log(`  Análisis por producto: 5 (Mercado, Marketing, Ventas, Finanzas, Legal)`);
  console.log(`  Total análisis: 10`);
  console.log('✅ Seed completado — los 10 análisis deben estar en "completado".');
  console.log('\n🔑 Credenciales:');
  console.log(`   ${CUENTA.email}  /  ${CUENTA.password}   [pro, user]`);

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});