/**
 * seed-mock-analisis.ts — Siembra una cuenta PRO con DOS productos y
 * análisis mock para testing del dashboard y componentes.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-mock-analisis.ts
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos.
 * NUNCA ejecutar contra una base de datos de producción.
 *
 * Credenciales sembradas:
 *   test@bi0a100.test  /  Test123!   [pro, user]
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
import { AnalisisBrief } from '../models/AnalisisBrief';

import { ejecutarAnalisisMercado } from '../services/mercado/mercadoOrchestrator';
import { ejecutarAnalisisMarketing } from '../services/marketing/marketingOrchestrator';
import { ejecutarVentas } from '../services/ventas/ventasOrchestrator';
import { ejecutarAnalisisFinanzas } from '../services/finanzas/finanzasOrchestrator';
import { ejecutarAnalisisLegal } from '../services/legal/legalOrchestrator';

import { MercadoAnalisisInput } from '../services/mercado/types';
import { MarketingAnalisisInput } from '../services/marketing/types';
import { VentasAnalisisInput } from '../services/ventas/types';
import { FinanzasInput } from '../services/finanzas/types';
import { LegalAnalisisInput } from '../services/legal/types';

const BCRYPT_ROUNDS = 12;

async function upsertUsuario(): Promise<Usuario> {
  const repo = AppDataSource.getRepository(Usuario);
  const password = 'Test123!';
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const email = 'test@bi0a100.test';

  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    existing.password_hash = password_hash;
    existing.nombre = 'Test User (PRO)';
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
    console.log(`↻ usuario actualizado: ${email}`);
    return existing;
  }

  const usuario = repo.create({
    email,
    password_hash,
    nombre: 'Test User (PRO)',
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
  console.log(`＋ usuario creado: ${email}`);
  return usuario;
}

async function limpiarPrevios(usuarioId: string): Promise<void> {
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const marketingRepo = AppDataSource.getRepository(AnalisisMarketing);
  const ventasRepo = AppDataSource.getRepository(AnalisisVentas);
  const finanzasRepo = AppDataSource.getRepository(AnalisisFinanzas);
  const legalRepo = AppDataSource.getRepository(AnalisisLegal);
  const briefRepo = AppDataSource.getRepository(AnalisisBrief);
  const productoRepo = AppDataSource.getRepository(Producto);

  const resultados = await Promise.all([
    mercadoRepo.delete({ usuario_id: usuarioId }),
    marketingRepo.delete({ usuario_id: usuarioId }),
    ventasRepo.delete({ usuario_id: usuarioId }),
    finanzasRepo.delete({ usuario_id: usuarioId }),
    legalRepo.delete({ usuario_id: usuarioId }),
    briefRepo.delete({ usuario_id: usuarioId }),
  ]);
  const borrados = resultados.reduce((total, r) => total + (r.affected ?? 0), 0);
  const { affected: productosBorrados } = await productoRepo.delete({ usuario_id: usuarioId });
  console.log(`🧹 Limpieza: ${borrados} análisis y ${productosBorrados ?? 0} productos previos eliminados`);
}

async function seedAnalisisParaProducto(
  producto: Producto,
  usuarioId: string,
): Promise<boolean> {
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const marketingRepo = AppDataSource.getRepository(AnalisisMarketing);
  const ventasRepo = AppDataSource.getRepository(AnalisisVentas);
  const finanzasRepo = AppDataSource.getRepository(AnalisisFinanzas);
  const legalRepo = AppDataSource.getRepository(AnalisisLegal);

  console.log(`\n  ┌─ ${producto.nombre} ─────────────────────────────────`);

  // ─── MERCADO ──────────────────────────────────────────────────────────────
  const mercadoInput: MercadoAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    pais: 'MX',
    scope: 'local',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    nse_target: 'C+',
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

  // ─── MARKETING ────────────────────────────────────────────────────────────
  const marketingInput: MarketingAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    vozMarca: 'Profesional',
    presupuestoMensual: 5000,
    metaCampana: 'Lanzamiento',
    plataformas: ['Instagram', 'TikTok'],
    capacidadContenido: '3-4/semana',
  };
  const aMarketing = await marketingRepo.save(marketingRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    voz_marca: 'Profesional',
    presupuesto_mensual: 5000,
    meta_campana: 'Lanzamiento',
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisMarketing(aMarketing.id, producto, marketingInput);
  console.log(`  │ 📣 Marketing   → ${aMarketing.id}`);

  // ─── VENTAS ────────────────────────────────────────────────────────────────
  const ventasInput: VentasAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    canalesVenta: ['Online'],
    estrategiaFijacionPrecio: 'Competitiva',
    margenBrutoEsperado: 40,
  };
  const aVentas = await ventasRepo.save(ventasRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    tipo_venta: 'B2C_directo',
    canal_principal: 'online',
    estado_analisis: 'procesando',
  }));
  await ejecutarVentas(aVentas.id, producto, ventasInput);
  console.log(`  │ 💼 Ventas      → ${aVentas.id}`);

  // ─── FINANZAS ─────────────────────────────────────────────────────────────
  const finanzasInput: FinanzasInput = {
    productoId: producto.id,
    usuarioId,
    precio_venta: 100,
    costo_variable_unitario: 30,
    costos_fijos_mensuales: 5000,
    unidades_mes_inicial: 50,
    tasa_crecimiento_mensual: 10,
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

  // ─── LEGAL ────────────────────────────────────────────────────────────────
  const legalInput: LegalAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    forma_juridica: 'Persona Física con Actividad Empresarial',
    tiene_empleados: false,
    vende_en_linea: true,
    exporta_importa: false,
    giro_especifico: 'Comercio electrónico',
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

  // ─── Verificación ─────────────────────────────────────────────────────────
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
  return ok;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-mock-analisis.ts abortado: NODE_ENV=production. Solo para desarrollo local.');
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  const usuarioId = usuario.id;
  console.log(`\n━━━ ${usuario.email} (${usuarioId}) — plan: ${usuario.plan} ━━━`);

  await limpiarPrevios(usuarioId);

  // ─── Crear 2 productos ────────────────────────────────────────────────────
  const productoRepo = AppDataSource.getRepository(Producto);

  const producto1 = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: 'Producto Test 1',
    categoria: 'Servicios',
    tipo: 'servicio',
    descripcion: 'Producto de prueba 1 para dashboard testing',
    estatus_proyecto: 'Idea',
    pais: 'MX',
    precio_esperado: 100,
    inversion_inicial: 10000,
    costos_fijos: 2000,
    canal_venta: 'Online',
    puv: 'Valor único de propuesta',
    cliente_ideal: 'Todos',
    nse: 'C+',
    direccion: 'CDMX',
  }));
  console.log(`📦 Producto 1 creado: ${producto1.nombre}`);

  const producto2 = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: 'Producto Test 2',
    categoria: 'Alimentos y bebidas',
    tipo: 'producto',
    descripcion: 'Producto de prueba 2 para dashboard testing',
    estatus_proyecto: 'Ejecución',
    pais: 'MX',
    precio_esperado: 50,
    inversion_inicial: 5000,
    costos_fijos: 1000,
    canal_venta: 'Tienda física',
    puv: 'Otro valor único',
    cliente_ideal: 'Mujeres 20-30',
    nse: 'B',
    direccion: 'CDMX',
  }));
  console.log(`📦 Producto 2 creado: ${producto2.nombre}`);

  // ─── Ejecutar análisis para cada producto ─────────────────────────────────
  const ok1 = await seedAnalisisParaProducto(producto1, usuarioId);
  const ok2 = await seedAnalisisParaProducto(producto2, usuarioId);

  // ─── Resultado final ──────────────────────────────────────────────────────
  const todoOk = ok1 && ok2;
  console.log('\n─── Resultado del seed ───');
  console.log(`  Productos: 2`);
  console.log(`  Análisis por producto: 5 (Mercado, Marketing, Ventas, Finanzas, Legal)`);
  console.log(`  Total análisis: 10`);
  if (todoOk) {
    console.log('✅ Seed completado — los 10 análisis quedaron en "completado".');
  } else {
    console.log('⚠️  Algún análisis NO quedó en "completado". Revisa los logs de arriba.');
  }
  console.log('\n🔑 Credenciales:');
  console.log(`   test@bi0a100.test  /  Test123!   [pro, user]`);

  await AppDataSource.destroy();
  process.exit(todoOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});