/**
 * seed-pizzas-jorge.ts — Siembra UNA cuenta nueva ("Pizzas Jorge") con UN
 * producto y los 5 análisis (Mercado, Marketing, Ventas, Finanzas, Legal) ya en
 * estado 'completado', llamando DIRECTAMENTE a los orquestadores reales
 * (síncrono, sin cola BullMQ).
 *
 * Sin ANTHROPIC_API_KEY, los servicios con IA usan su fallback mock coherente.
 * Finanzas es 100% determinista (funciones puras), siempre con números reales.
 *
 * Caso: Pizzas Jorge — CDMX, Metro Niños Héroes, pizza a $130, canal mixto
 * (local + a domicilio).
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-pizzas-jorge.ts
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos antes de sembrar. NUNCA ejecutar contra una base
 * de datos de producción.
 *
 * Credenciales sembradas:
 *   jorge@bi0a100.test  /  PizzasJorge123!   [pro, user]
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
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';

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

// ─── Datos de la cuenta y del negocio ────────────────────────────────────────
const CUENTA = {
  email: 'jorge@bi0a100.test',
  password: 'PizzasJorge123!',
  nombre: 'Jorge Jiménez',
};

// Económicos de la pizzería (CDMX). Reutilizados de forma consistente.
const PRECIO_PIZZA = 130;
const COSTO_VARIABLE_PIZZA = 48;
const COSTOS_FIJOS_MES = 35000;
const INVERSION_INICIAL = 180000;
const UNIDADES_MES_INICIAL = 650;
const CRECIMIENTO_MENSUAL = 6;

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

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-pizzas-jorge.ts abortado: NODE_ENV=production. Solo para desarrollo local.');
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  const usuarioId = usuario.id;
  console.log(`\n━━━ ${usuario.email} (${usuarioId}) — plan: ${usuario.plan} ━━━`);

  await limpiarPrevios(usuarioId);

  // ─── Crear producto único ─────────────────────────────────────────────────
  const productoRepo = AppDataSource.getRepository(Producto);
  const producto = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: 'Pizzas Jorge',
    categoria: 'Alimentos y bebidas',
    tipo: 'producto',
    descripcion:
      'Pizzería en Metro Niños Héroes, CDMX. Pizza clásica a $130 (local + a domicilio por Uber Eats y Didi). Ingredientes premium, horno de leña, entregas en 45 min.',
    estatus_proyecto: 'Ejecución',
    pais: 'MX',
    precio_esperado: PRECIO_PIZZA,
    inversion_inicial: INVERSION_INICIAL,
    costos_fijos: COSTOS_FIJOS_MES,
    canal_venta: 'Local + Plataformas (Uber Eats, Didi)',
    puv: 'Pizza artesanal con ingredientes premium, horno de leña, entrega en 45 min en CDMX.',
    cliente_ideal: 'Jóvenes y profesionales 18-50, NSE C+/B, trabajadores remotos, familias zona Centro.',
    nse: 'B',
    direccion: 'Metro Niños Héroes, Cuauhtémoc, Ciudad de México',
  }));
  console.log(`📦 Producto creado: ${producto.nombre} (${producto.id})`);

  // ─── MERCADO ───────────────────────────────────────────────────────────────
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const mercadoInput: MercadoAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    pais: 'MX',
    scope: 'local',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    nse_target: 'B',
    forma_cobro: 'Pago por entrega + wallet',
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
  console.log(`📊 Mercado     → ${aMercado.id}`);

  // ─── MARKETING ──────────────────────────────────────────────────────────────
  const marketingRepo = AppDataSource.getRepository(AnalisisMarketing);
  const marketingInput: MarketingAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    vozMarca: 'Casual y accesible',
    presupuestoMensual: 8000,
    metaCampana: 'Retention + Awareness',
    plataformas: ['Instagram', 'TikTok', 'Google Ads', 'WhatsApp'],
    capacidadContenido: '2-3/semana',
  };
  const aMarketing = await marketingRepo.save(marketingRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    voz_marca: 'Casual y accesible',
    presupuesto_mensual: 8000,
    meta_campana: 'Retention + Awareness',
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisMarketing(aMarketing.id, producto, marketingInput);
  console.log(`📣 Marketing   → ${aMarketing.id}`);

  // ─── VENTAS ─────────────────────────────────────────────────────────────────
  const ventasRepo = AppDataSource.getRepository(AnalisisVentas);
  const ventasInput: VentasAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    analisisMercadoId: aMercado.id,
    canalesVenta: ['Mostrador local', 'Uber Eats', 'Didi', 'WhatsApp'],
    estrategiaFijacionPrecio: 'Competitiva',
    margenBrutoEsperado: 62,
  };
  const aVentas = await ventasRepo.save(ventasRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    analisis_mercado_id: aMercado.id,
    tipo_venta: 'B2C_mixto',
    canal_principal: 'mixto',
    estado_analisis: 'procesando',
  }));
  await ejecutarVentas(aVentas.id, producto, ventasInput);
  console.log(`💼 Ventas      → ${aVentas.id}`);

  // ─── FINANZAS ───────────────────────────────────────────────────────────────
  const finanzasRepo = AppDataSource.getRepository(AnalisisFinanzas);
  const finanzasInput: FinanzasInput = {
    productoId: producto.id,
    usuarioId,
    precio_venta: PRECIO_PIZZA,
    costo_variable_unitario: COSTO_VARIABLE_PIZZA,
    costos_fijos_mensuales: COSTOS_FIJOS_MES,
    unidades_mes_inicial: UNIDADES_MES_INICIAL,
    tasa_crecimiento_mensual: CRECIMIENTO_MENSUAL,
  };
  const aFinanzas = await finanzasRepo.save(finanzasRepo.create({
    producto_id: producto.id,
    usuario_id: usuarioId,
    pais: 'MX',
    inputs_data: finanzasInput,
    estado_analisis: 'procesando',
  }));
  await ejecutarAnalisisFinanzas(aFinanzas.id, finanzasInput, producto);
  console.log(`💰 Finanzas    → ${aFinanzas.id}`);

  // ─── LEGAL ──────────────────────────────────────────────────────────────────
  const legalRepo = AppDataSource.getRepository(AnalisisLegal);
  const legalInput: LegalAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    forma_juridica: 'Persona Física con Actividad Empresarial',
    tiene_empleados: true,
    vende_en_linea: true,
    exporta_importa: false,
    giro_especifico: 'Elaboración y venta de alimentos (pizzería) para llevar y a domicilio',
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
  console.log(`⚖️  Legal       → ${aLegal.id}`);

  // ─── Verificación ───────────────────────────────────────────────────────────
  const estados = await Promise.all([
    mercadoRepo.findOneBy({ id: aMercado.id }),
    marketingRepo.findOneBy({ id: aMarketing.id }),
    ventasRepo.findOneBy({ id: aVentas.id }),
    finanzasRepo.findOneBy({ id: aFinanzas.id }),
    legalRepo.findOneBy({ id: aLegal.id }),
  ]);

  const resumen = `mercado: ${estados[0]?.estado_analisis} | marketing: ${estados[1]?.estado_analisis} | ventas: ${estados[2]?.estado_analisis} | finanzas: ${estados[3]?.estado_analisis} | legal: ${estados[4]?.estado_analisis}`;
  console.log(`${resumen}`);

  const ok = estados.every((e) => e?.estado_analisis === 'completado');

  console.log('\n─── Resultado del seed ───');
  console.log(`  Producto: 1 (Pizzas Jorge)`);
  console.log(`  Análisis: 5 (Mercado, Marketing, Ventas, Finanzas, Legal)`);
  if (ok) {
    console.log('✅ Seed completado — todos los análisis en "completado".');
  } else {
    console.log('⚠️  Algún análisis NO quedó en "completado". Revisa los logs de arriba.');
  }
  console.log('\n🔑 Credenciales:');
  console.log(`   ${CUENTA.email}  /  ${CUENTA.password}   [pro, user]`);

  await AppDataSource.destroy();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});