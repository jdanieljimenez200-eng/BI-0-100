/**
 * Seed DEMO completo — SOLO desarrollo local.
 *
 * Crea la cuenta demo@bi0a100.com (plan pro_plus, todo desbloqueado) con
 * 2 productos y análisis COMPLETADOS en los 6 módulos. No encola jobs: invoca
 * los orquestadores reales directamente, así que los datos tienen EXACTAMENTE
 * el mismo shape que produce producción (sin ANTHROPIC_API_KEY usan los mocks
 * deterministas de cada servicio → rápido y sin coste).
 *
 * Idempotente: re-ejecutar refresca contraseña/plan y NO duplica productos ni
 * análisis (salta los módulos que ya tengan un análisis no-error).
 *
 * Uso:
 *   docker compose up -d postgres redis
 *   npm run seed:demo        (desde backend/)
 */
import 'reflect-metadata';
import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import { AnalisisMarketing } from '../models/AnalisisMarketing';
import { AnalisisVentas } from '../models/AnalisisVentas';
import { AnalisisFinanzas } from '../models/AnalisisFinanzas';
import { AnalisisLegal } from '../models/AnalisisLegal';
import { AnalisisBrief } from '../models/AnalisisBrief';

import { orquestarMercado } from '../services/mercado/mercadoOrchestrator';
import { orquestarMarketing } from '../services/marketing/marketingOrchestrator';
import { ejecutarAnalisisVentas } from '../services/ventas/ventasOrchestrator';
import { ejecutarAnalisisFinanzas } from '../services/finanzas/finanzasOrchestrator';
import type { FinanzasInput } from '../services/finanzas/types';
import { ejecutarAnalisisLegal } from '../services/legal/legalOrchestrator';
import { ejecutarAnalisisBrief } from '../services/brief/briefOrchestrator';

const EMAIL = 'demo@bi0a100.com';
const PASSWORD = 'Demo123!';
const NOMBRE = 'Demo BI0A100';

interface DemoProducto {
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: number;
  pais: string;
}

const PRODUCTOS: DemoProducto[] = [
  {
    nombre: 'Pizzas Artesanales Don Jorge',
    descripcion:
      'Pizzería de barrio con masa de fermentación lenta, ingredientes locales y entrega a domicilio en 30 minutos.',
    categoria: 'Alimentos',
    precio: 180,
    pais: 'MX',
  },
  {
    nombre: 'Pastelería Lua',
    descripcion:
      'Pastelería boutique especializada en pasteles personalizados para eventos y postres veganos.',
    categoria: 'Repostería',
    precio: 450,
    pais: 'MX',
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureUsuario(): Promise<Usuario> {
  const repo = AppDataSource.getRepository(Usuario);
  let usuario = await repo.findOne({ where: { email: EMAIL } });

  const password_hash = await bcrypt.hash(PASSWORD, 12);
  if (!usuario) {
    usuario = repo.create({
      email: EMAIL,
      password_hash,
      nombre: NOMBRE,
      account_role: 'owner',
      plan: 'pro_plus',
      es_admin: false,
      activo: true,
    });
    await repo.save(usuario);
    console.log(`✔ Usuario creado: ${EMAIL}`);
  } else {
    usuario.password_hash = password_hash;
    usuario.plan = 'pro_plus';
    usuario.activo = true;
    usuario.es_admin = false;
    await repo.save(usuario);
    console.log(`✔ Usuario existente actualizado: ${EMAIL}`);
  }
  return usuario;
}

async function ensureProducto(
  usuarioId: string,
  def: DemoProducto
): Promise<{ producto: Producto; creado: boolean }> {
  const repo = AppDataSource.getRepository(Producto);
  const existente = await repo.findOne({
    where: { usuario_id: usuarioId, nombre: def.nombre },
  });
  if (existente) return { producto: existente, creado: false };

  const producto = repo.create({
    usuario_id: usuarioId,
    nombre: def.nombre,
    descripcion: def.descripcion,
    categoria: def.categoria,
    precio: def.precio,
    status: 'activo',
    pais: def.pais,
  });
  await repo.save(producto);
  console.log(`  + Producto creado: ${def.nombre}`);
  return { producto, creado: true };
}

async function yaTiene(
  entity: new () => unknown,
  usuarioId: string,
  productoId: string
): Promise<boolean> {
  const n = await (AppDataSource.getRepository(entity) as any).count({
    where: { usuario_id: usuarioId, producto_id: productoId },
  });
  return n > 0;
}

function filaBase() {
  return { estado_analisis: 'procesando' as const };
}

async function correrMercado(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisMercado, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisMercado);
  const fila = await repo.save(
    repo.create({
      usuario_id: usuarioId,
      producto_id: p.id,
      pais: p.pais || 'MX',
      scope: 'local',
      ciudad: 'Guadalajara',
      estado: 'Jalisco',
      ...filaBase(),
    })
  );
  await orquestarMercado(fila.id, usuarioId, p.id, {
    productoId: p.id,
    usuarioId,
    pais: 'MX',
    scope: 'local',
    ciudad: 'Guadalajara',
    estado: 'Jalisco',
    tipo_local: 'local',
    m2_declarados: 45,
    precio_m2_mes_declarado: 320,
    personal: 3,
    zona: 'Lafayette',
  });
  return 'ok';
}

async function correrMarketing(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisMarketing, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisMarketing);
  const fila = await repo.save(repo.create({ usuario_id: usuarioId, producto_id: p.id, ...filaBase() }));
  await orquestarMarketing(fila.id, usuarioId, p.id, {
    productoId: p.id,
    usuarioId,
    vozMarca: 'Cercano',
    presupuestoMensual: 3000,
    metaCampana: 'Lanzamiento',
    clienteIdeal: 'Familias y oficinas del área a 3 km que piden comida por WhatsApp',
    plataformas: ['Instagram', 'Facebook', 'WhatsApp'],
    capacidadContenido: '3-4/semana',
  });
  return 'ok';
}

async function correrVentas(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisVentas, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisVentas);
  const fila = await repo.save(repo.create({ usuario_id: usuarioId, producto_id: p.id, ...filaBase() }));
  await ejecutarAnalisisVentas(fila.id, usuarioId, p, {
    tipo_venta: 'B2C_directo',
    canal_principal: 'telefono',
    ticket_promedio: Number(p.precio) || 180,
    tamano_equipo: '1_2_personas',
    objetivo_ventas: 'Duplicar pedidos semanales en 6 meses',
  });
  return 'ok';
}

async function correrFinanzas(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisFinanzas, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisFinanzas);
  const fila = await repo.save(repo.create({ usuario_id: usuarioId, producto_id: p.id, ...filaBase() }));
  const input: FinanzasInput = {
    productoId: p.id,
    usuarioId,
    precio_venta: Number(p.precio) || 180,
    costo_variable_unitario: Math.round((Number(p.precio) || 180) * 0.38),
    costos_fijos_mensuales: 18500,
    unidades_mes_inicial: 420,
    tasa_crecimiento_mensual: 12,
  };
  await ejecutarAnalisisFinanzas(fila.id, input, p);
  return 'ok';
}

async function correrLegal(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisLegal, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisLegal);
  const fila = await repo.save(repo.create({ usuario_id: usuarioId, producto_id: p.id, ...filaBase() }));
  await ejecutarAnalisisLegal(fila.id, p, {
    productoId: p.id,
    usuarioId,
    forma_juridica: 'Persona física con actividad empresarial',
    tiene_empleados: true,
    numero_empleados: 2,
    vende_en_linea: true,
    exporta_importa: false,
    giro_especifico: 'Alimentos',
    estado_constitucion: 'Jalisco',
    anios_operando: '1-2',
  });
  return 'ok';
}

async function correrBrief(usuarioId: string, p: Producto) {
  if (await yaTiene(AnalisisBrief, usuarioId, p.id)) return 'skip';
  const repo = AppDataSource.getRepository(AnalisisBrief);
  const fila = await repo.save(repo.create({ usuario_id: usuarioId, producto_id: p.id, ...filaBase() }));
  await ejecutarAnalisisBrief(fila.id, p, {
    productoId: p.id,
    usuarioId,
    percepcion: ['Artesanal', 'Confiable'],
    emocion: 'Pertenencia',
    anti_valores: ['Atrevido'],
    estilo_visual: 'Artesanal/Handmade',
    paleta_elegida: 'A',
    tipo_logo: 'Isologo (texto+ícono juntos)',
    simbolo_representativo: 'Horno de leña con una pizza',
    resultado_cliente: 'Sabe que come bien, con ingredientes frescos y sin esperar una hora',
    tono_comunicacion: 'Cercano y cálido',
    posicionamiento: 'Calidad premium (mejor calidad)',
    nivel_diferenciacion: 'Medio (algunas diferencias)',
  });
  return 'ok';
}

async function main() {
  console.log('── Seed DEMO BI0A100 ───────────────────────────────');
  await AppDataSource.initialize();
  console.log('✔ Conexión a BD establecida');

  const usuario = await ensureUsuario();

  // SEED_FORCE=1 → borra los análisis previos de los productos demo para
  // regenerarlos con el código actual (útil tras cambiar orquestadores).
  if (process.env.SEED_FORCE === '1') {
    const productosPrevios = await AppDataSource.getRepository(Producto).find({
      where: { usuario_id: usuario.id },
    });
    for (const p of productosPrevios) {
      for (const repo of [
        AnalisisMercado,
        AnalisisMarketing,
        AnalisisVentas,
        AnalisisFinanzas,
        AnalisisLegal,
        AnalisisBrief,
      ]) {
        await (AppDataSource.getRepository(repo) as any).delete({ producto_id: p.id });
      }
    }
    console.log(`♻ FORCE: análisis previos eliminados (${productosPrevios.length} productos)`);
  }

  for (const def of PRODUCTOS) {
    console.log(`\n▶ Producto: ${def.nombre}`);
    const { producto: p } = await ensureProducto(usuario.id, def);

    const pasos: [string, () => Promise<string>][] = [
      ['mercado', () => correrMercado(usuario.id, p)],
      ['marketing', () => correrMarketing(usuario.id, p)],
      ['ventas', () => correrVentas(usuario.id, p)],
      ['finanzas', () => correrFinanzas(usuario.id, p)],
      ['legal', () => correrLegal(usuario.id, p)],
      ['brief', () => correrBrief(usuario.id, p)],
    ];

    for (const [nombre, fn] of pasos) {
      const t0 = Date.now();
      const res = await fn();
      if (res === 'skip') {
        console.log(`  · ${nombre}: ya tenía análisis — omitido`);
      } else {
        console.log(`  ✔ ${nombre}: completado (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      }
    }
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log('✅ DEMO LISTA');
  console.log(`   Correo:     ${EMAIL}`);
  console.log(`   Contraseña: ${PASSWORD}`);
  console.log('   Plan:       pro_plus (todo desbloqueado)');
  console.log('   URL login:  http://localhost:3000/auth/login');
  console.log('────────────────────────────────────────────────────');

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  try {
    await AppDataSource.destroy();
  } catch {
    /* noop */
  }
  process.exit(1);
});
