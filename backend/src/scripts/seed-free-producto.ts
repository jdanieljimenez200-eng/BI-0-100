/**
 * seed-free-producto.ts — Añade UN producto con el análisis de Mercado ya
 * 'completado' a la cuenta freemium `freemium@bi0a100.test`.
 *
 * Esa cuenta nace pelada (sin productos ni análisis), así que el dashboard se
 * ve vacío y no permite comprobar nada. Este script la deja en el estado real
 * de un usuario gratuito que ya gastó su único intento de Mercado:
 *   · Reintentar Mercado sobre este producto → 403 (límite alcanzado).
 *   · Lanzar Marketing sobre este producto   → permitido (cuota intacta).
 *   · UpsellSlot visible (plan 'freemium' → esPlanDePago = false).
 *
 * Los campos de usuario se escriben con los MISMOS valores que seedUsers.ts
 * (plan freemium, role user, analisis_disponibles 1, creditos_marketing 0),
 * de modo que ejecutar cualquiera de los dos scripts deja la cuenta idéntica y
 * las credenciales siguen siendo válidas.
 *
 * Llama DIRECTAMENTE al orquestador real (síncrono, sin cola BullMQ), así que
 * los campos jsonb quedan con la forma exacta que produce el módulo y no hay
 * dependencia de que el worker esté vivo. Sin ANTHROPIC_API_KEY los servicios
 * con IA usan su fallback mock coherente; con la key, contenido IA real.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend npx ts-node src/scripts/seed-free-producto.ts
 *   # o, desde backend/:  npm run seed:free
 *
 * Idempotente: busca al usuario por email; si existe, reusa su id y borra sus
 * análisis y productos previos (deja exactamente 1 producto y 1 análisis).
 * NUNCA ejecutar contra una base de datos de producción.
 *
 * Credenciales sembradas:
 *   freemium@bi0a100.test  /  Freemium123!   [freemium, user]
 */
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

const BCRYPT_ROUNDS = 12;

// Idénticas a la entrada 'freemium@bi0a100.test' de seedUsers.ts. Si cambias una,
// cambia la otra: el objetivo es que ambos scripts converjan al mismo estado.
const CUENTA = {
  email: 'freemium@bi0a100.test',
  password: 'Freemium123!',
  nombre: 'Free Demo',
  plan: 'freemium',
  analisis_disponibles: 1,
  creditos_marketing: 0,
};

async function upsertUsuario(): Promise<Usuario> {
  const repo = AppDataSource.getRepository(Usuario);
  const password_hash = await bcrypt.hash(CUENTA.password, BCRYPT_ROUNDS);
  const existing = await repo.findOne({ where: { email: CUENTA.email } });

  if (existing) {
    existing.password_hash = password_hash;
    existing.nombre = CUENTA.nombre;
    existing.plan = CUENTA.plan;
    existing.role = 'user';
    existing.account_role = 'owner';
    existing.owner_id = null;
    existing.analisis_disponibles = CUENTA.analisis_disponibles;
    existing.creditos_marketing = CUENTA.creditos_marketing;
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
    plan: CUENTA.plan,
    role: 'user',
    account_role: 'owner',
    owner_id: null,
    analisis_disponibles: CUENTA.analisis_disponibles,
    creditos_marketing: CUENTA.creditos_marketing,
    activo: true,
    intentos_login: 0,
  });
  await repo.save(usuario);
  console.log(`＋ usuario creado: ${CUENTA.email}`);
  return usuario;
}

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
      'seed-free-producto.ts abortado: NODE_ENV=production. Solo para desarrollo local.'
    );
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const usuario = await upsertUsuario();
  const usuarioId = usuario.id;
  console.log(
    `\n━━━ ${usuario.email} (${usuarioId}) — plan: ${usuario.plan} ━━━`
  );

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
    precio_esperado: 180,
    inversion_inicial: 45000,
    costos_fijos: 9000,
    canal_venta: 'Redes sociales y entrega a domicilio',
    puv: 'Brownie de masa madre con chocolate 70%, sin conservadores, horneado el mismo día del pedido y entregado en bici en menos de 3 horas.',
    cliente_ideal:
      'Mujeres y hombres 25-40, NSE C+/B, oficinistas y creativos de Roma-Condesa que compran antojos premium por Instagram.',
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
  console.log(
    `   marketing: ${nMarketing}/1 | ventas: ${nVentas}/1 | finanzas: ${nFinanzas}/1 | legal: ${nLegal}/1  ← disponibles`
  );

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
    console.log(
      '✅ Cuenta freemium lista: 1 producto, Mercado en "completado", resto de módulos sin usar.'
    );
  } else {
    console.log(
      `⚠️  Estado inesperado (mercado: ${estado}, plan: ${usuario.plan}). Revisa los logs de arriba.`
    );
  }

  console.log('\n🔑 Credenciales:');
  console.log(`   ${CUENTA.email}  /  ${CUENTA.password}   [${CUENTA.plan}, user]`);
  console.log('\n🧪 Qué comprobar en el navegador:');
  console.log('   1. /dashboard → UpsellSlot variant="inline" al final de la página.');
  console.log('   2. Sidebar expandido → UpsellSlot variant="compact".');
  console.log('   3. Descartar el slot → no reaparece (localStorage, 7 días).');
  console.log(
    '   4. Reintentar Mercado en este producto → bloqueado. Lanzar Marketing → permitido.'
  );

  await AppDataSource.destroy();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});