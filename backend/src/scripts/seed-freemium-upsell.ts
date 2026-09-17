/**
 * seed-freemium-upsell.ts — Siembra UNA cuenta FREEMIUM con UN producto y
 * SOLO el análisis de Mercado en estado 'completado'.
 *
 * Objetivo: reproducir el estado exacto en el que UpsellSlot debe verse —
 * plan gratuito (`plan: 'freemium'`), la cuota de Mercado ya gastada y los
 * otros módulos aún disponibles. Sirve además para comprobar a mano el
 * enforcement de `requireCanRunAnalisis`:
 *   · Reintentar Mercado sobre este producto → 403 (límite alcanzado).
 *   · Lanzar Marketing sobre este producto   → permitido (cuota intacta).
 *
 * Llama DIRECTAMENTE al orquestador real (síncrono, sin cola BullMQ), así que
 * los campos jsonb quedan con la forma exacta que produce el módulo y no hay
 * dependencia de que el worker esté vivo. Sin ANTHROPIC_API_KEY los servicios
 * con IA usan su fallback mock coherente; con la key, contenido IA real.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-freemium-upsell.ts
 *   # o, desde backend/:  npm run seed:freemium
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos (deja exactamente 1 producto y 1 análisis).
 * NUNCA ejecutar contra una base de datos de producción.
 *
 * Credenciales sembradas:
 *   freemium@bi0a100.test  /  Freemium123!   [freemium, user]
 */
import './guardiaSeeds';
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { Not } from 'typeorm';

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
import { MercadoAnalisisInput } from '../services/mercado/types';

// Mismo cost factor que el signup real (routes/auth.ts:90) y que seedUsers.ts.
const BCRYPT_ROUNDS = 12;

const CUENTA = {
  email: 'freemium@bi0a100.test',
  password: 'Freemium123!',
  nombre: 'Ana Torres (freemium)',
};

// Económicos del negocio, reutilizados entre el Producto (SSOT) y el análisis.
const PRECIO_CAJA = 180;        // caja de 6 brownies
const INVERSION_INICIAL = 45000; // horno, batidora, empaque, capital de trabajo
const COSTOS_FIJOS_MES = 9000;   // cocina compartida, luz, gas, envíos base

/** Crea (o actualiza) la cuenta freemium y devuelve la entidad persistida. */
async function upsertUsuario(): Promise<Usuario> {
  const repo = AppDataSource.getRepository(Usuario);
  const password_hash = await bcrypt.hash(CUENTA.password, BCRYPT_ROUNDS);
  const existing = await repo.findOne({ where: { email: CUENTA.email } });

  if (existing) {
    existing.password_hash = password_hash;
    existing.nombre = CUENTA.nombre;
    existing.plan = 'freemium';
    existing.role = 'user';
    existing.account_role = 'owner';
    existing.owner_id = null;
    // Freemium: el default de la columna es 1. No inflamos el contador, porque
    // el objetivo es justamente ver los límites del plan gratuito.
    existing.analisis_disponibles = 1;
    existing.creditos_marketing = 0;
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
    plan: 'freemium',
    role: 'user',
    account_role: 'owner',
    owner_id: null,
    analisis_disponibles: 1,
    creditos_marketing: 0,
    activo: true,
    intentos_login: 0,
  });
  await repo.save(usuario);
  console.log(`＋ usuario creado: ${CUENTA.email}`);
  return usuario;
}

/** Borra análisis y productos previos del usuario (limpieza idempotente). */
async function limpiarPrevios(usuarioId: string): Promise<void> {
  const repos = [
    AppDataSource.getRepository(AnalisisMercado),
    AppDataSource.getRepository(AnalisisMarketing),
    AppDataSource.getRepository(AnalisisVentas),
    AppDataSource.getRepository(AnalisisFinanzas),
    AppDataSource.getRepository(AnalisisLegal),
  ];

  let borrados = 0;
  for (const repo of repos) {
    const { affected } = await repo.delete({ usuario_id: usuarioId });
    borrados += affected ?? 0;
  }
  const { affected: productosBorrados } = await AppDataSource
    .getRepository(Producto)
    .delete({ usuario_id: usuarioId });

  console.log(
    `🧹 Limpieza: ${borrados} análisis y ${productosBorrados ?? 0} productos previos eliminados`
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-freemium-upsell.ts abortado: NODE_ENV=production. Solo para desarrollo local.'
    );
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  const usuarioId = usuario.id;
  console.log(`\n━━━ ${usuario.email} (${usuarioId}) — plan: ${usuario.plan} ━━━`);

  await limpiarPrevios(usuarioId);

  // ─── Producto único ────────────────────────────────────────────────────────
  const productoRepo = AppDataSource.getRepository(Producto);
  const producto = await productoRepo.save(productoRepo.create({
    usuario_id: usuarioId,
    nombre: 'Brownies de masa madre',
    categoria: 'Alimentos y bebidas',
    tipo: 'producto',
    descripcion:
      'Repostería artesanal en cocina compartida: cajas de 6 brownies de chocolate 70% con masa madre, venta por Instagram y WhatsApp con entrega en bici en la colonia Roma y Condesa (CDMX).',
    estatus_proyecto: 'Idea',
    pais: 'MX',
    precio_esperado: PRECIO_CAJA,
    inversion_inicial: INVERSION_INICIAL,
    costos_fijos: COSTOS_FIJOS_MES,
    canal_venta: 'Redes sociales y entrega a domicilio',
    puv: 'Brownie de masa madre con chocolate 70%, sin conservadores, horneado el mismo día del pedido y entregado en bici en menos de 3 horas.',
    cliente_ideal: 'Mujeres y hombres 25-40, NSE C+/B, oficinistas y creativos de Roma-Condesa que compran antojos premium por Instagram.',
    nse: 'C+',
    direccion: 'Col. Roma Norte, Cuauhtémoc, Ciudad de México',
  }));
  console.log(`📦 Producto creado: ${producto.nombre} (${producto.id})`);

  // ─── MERCADO (el único análisis consumido) ─────────────────────────────────
  const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);
  const mercadoInput: MercadoAnalisisInput = {
    productoId: producto.id,
    usuarioId,
    pais: 'MX',
    scope: 'local',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    nse_target: 'C+',
    forma_cobro: 'Pago único',
    competidores_conocidos:
      'Reposterías de barrio en Roma-Condesa, marcas de brownies por Instagram, cafeterías de especialidad con repostería propia',
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

  // ─── Verificación del estado de cuota ─────────────────────────────────────
  // Se cuenta con el MISMO filtro que usan las rutas (`Not('error')`), para que
  // lo impreso aquí sea exactamente lo que verá requireCanRunAnalisis.
  // `Not('error')` sin anotar infiere FindOperator<string>, que no encaja con el
  // union literal de `estado_analisis` de cada entidad; fijando el parámetro de
  // tipo a 'error' el mismo operador sirve para los cinco modelos.
  const donde = {
    usuario_id: usuarioId,
    producto_id: producto.id,
    estado_analisis: Not<'error'>('error'),
  };
  const [nMercado, nMarketing, nVentas, nFinanzas, nLegal] = await Promise.all([
    mercadoRepo.count({ where: donde }),
    AppDataSource.getRepository(AnalisisMarketing).count({ where: donde }),
    AppDataSource.getRepository(AnalisisVentas).count({ where: donde }),
    AppDataSource.getRepository(AnalisisFinanzas).count({ where: donde }),
    AppDataSource.getRepository(AnalisisLegal).count({ where: donde }),
  ]);

  const mercadoFinal = await mercadoRepo.findOneBy({ id: aMercado.id });
  const estado = mercadoFinal?.estado_analisis ?? 'desconocido';

  console.log('\n─── Cuota vista por requireCanRunAnalisis (límite freemium: 1) ───');
  console.log(`   mercado: ${nMercado}/1  ← consumido, debe dar 403 al reintentar`);
  console.log(`   marketing: ${nMarketing}/1 | ventas: ${nVentas}/1 | finanzas: ${nFinanzas}/1 | legal: ${nLegal}/1  ← disponibles`);

  const ok =
    estado === 'completado' &&
    usuario.plan === 'freemium' &&
    nMercado === 1 &&
    nMarketing === 0 &&
    nVentas === 0 &&
    nFinanzas === 0 &&
    nLegal === 0;

  console.log('\n─── Resultado del seed ───');
  if (ok) {
    console.log('✅ Cuenta freemium lista: 1 producto, Mercado en "completado", resto de módulos sin usar.');
  } else {
    console.log(`⚠️  Estado inesperado (mercado: ${estado}, plan: ${usuario.plan}). Revisa los logs de arriba.`);
  }

  console.log('\n🔑 Credenciales:');
  console.log(`   ${CUENTA.email}  /  ${CUENTA.password}   [freemium, user]`);
  console.log('\n🧪 Qué comprobar en el navegador:');
  console.log('   1. /dashboard → UpsellSlot variant="inline" al final de la página.');
  console.log('   2. Sidebar expandido → UpsellSlot variant="compact".');
  console.log('   3. Descartar el slot → no reaparece (localStorage, 7 días).');
  console.log('   4. "Descargar PDF" en el resultado de Mercado → el slot NO sale (data-print="hide").');
  console.log('   5. Reintentar Mercado en este producto → bloqueado. Lanzar Marketing → permitido.');

  await AppDataSource.destroy();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});