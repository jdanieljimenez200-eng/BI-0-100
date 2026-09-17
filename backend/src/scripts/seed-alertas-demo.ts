/**
 * Seed de datos OPERATIVOS para el panel de Alertas.
 *
 * Crea ventas, artículos con stock crítico y metas de negocio para que el
 * panel /dashboard/alertas muestre alertas reales y el resumen ejecutivo IA
 * tenga contexto con qué trabajar.
 *
 * Diseñado para demo@bi0a100.com (plan pro_plus).
 * Idempotente: no duplica si ya existen filas con mismos nombres/tickets.
 *
 * Uso:
 *   docker exec bi0a100-backend-1 sh -c "cd /app && npx ts-node --transpile-only src/scripts/seed-alertas-demo.ts"
 */
import './guardiaSeeds';
import 'reflect-metadata';
import 'dotenv/config';

import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { Venta } from '../models/Venta';
import { Articulo } from '../models/Articulo';
import { MetaNegocio } from '../models/MetaNegocio';

const EMAIL = 'demo@bi0a100.com';

// ── helpers ──────────────────────────────────────────────────────────────────

function toISO(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function rand(min: number, max: number): number {
  return Math.round(Math.random() * (max - min) + min);
}

// ── ventas de los últimos 30 días (periodo "actual") ─────────────────────────
// ~18 ventas a distintos precios para simular ingresos reales.
// Los últimos 10 días tienen MÁS ventas para que haya base en el periodo
// anterior con MENOS ingresos → dispara variación positiva (o negativa).

async function seedVentas(usuarioId: string, productoId: string): Promise<void> {
  const repo = AppDataSource.getRepository(Venta);

  // Comprueba si ya hay ventas para no duplicar
  const existentes = await repo.count({ where: { usuario_id: usuarioId } });
  if (existentes > 0) {
    console.log(`  · ventas: ya existen ${existentes} registros — omitido`);
    return;
  }

  // Periodo actual: últimos 30 días (ventas normales)
  const ventasActuales = [
    // semana 4 (más fuerte)
    { offset: -1,  total: 1_620, ticket: 'DEM-0001' },
    { offset: -2,  total:   960, ticket: 'DEM-0002' },
    { offset: -3,  total: 2_340, ticket: 'DEM-0003' },
    { offset: -4,  total:   540, ticket: 'DEM-0004' },
    { offset: -5,  total: 1_800, ticket: 'DEM-0005' },
    { offset: -6,  total: 2_160, ticket: 'DEM-0006' },
    { offset: -7,  total:   720, ticket: 'DEM-0007' },
    // semana 3
    { offset: -8,  total: 1_440, ticket: 'DEM-0008' },
    { offset: -9,  total:   360, ticket: 'DEM-0009' },
    { offset: -10, total: 1_080, ticket: 'DEM-0010' },
    { offset: -12, total:   900, ticket: 'DEM-0011' },
    { offset: -14, total: 1_260, ticket: 'DEM-0012' },
    // semana 2
    { offset: -16, total:   720, ticket: 'DEM-0013' },
    { offset: -18, total:   540, ticket: 'DEM-0014' },
    { offset: -20, total: 1_080, ticket: 'DEM-0015' },
    // semana 1 (más flojo)
    { offset: -24, total:   360, ticket: 'DEM-0016' },
    { offset: -27, total:   540, ticket: 'DEM-0017' },
    { offset: -29, total:   720, ticket: 'DEM-0018' },
  ];

  // Periodo anterior: días -31 a -60 (ingresos ~30% menores → alarma amarilla)
  const ventasAnteriores = [
    { offset: -32, total:   900, ticket: 'DEM-0019' },
    { offset: -35, total:   720, ticket: 'DEM-0020' },
    { offset: -38, total:   540, ticket: 'DEM-0021' },
    { offset: -41, total:   360, ticket: 'DEM-0022' },
    { offset: -44, total:   900, ticket: 'DEM-0023' },
    { offset: -47, total:   540, ticket: 'DEM-0024' },
    { offset: -50, total:   720, ticket: 'DEM-0025' },
    { offset: -53, total:   360, ticket: 'DEM-0026' },
    { offset: -56, total:   540, ticket: 'DEM-0027' },
    { offset: -59, total:   720, ticket: 'DEM-0028' },
  ];

  const todas = [...ventasActuales, ...ventasAnteriores];
  const entidades: Venta[] = todas.map(({ offset, total, ticket }) => {
    const v = repo.create({
      usuario_id: usuarioId,
      producto_id: productoId,
      numero_ticket: ticket,
      fecha: toISO(offset),
      subtotal: +(total / 1.16).toFixed(2),
      impuesto_monto: +(total - total / 1.16).toFixed(2),
      impuesto_tasa: 0.16,
      impuesto_nombre: 'IVA',
      moneda: 'MXN',
      total,
      metodo_pago: (['efectivo', 'tarjeta', 'transferencia'] as const)[rand(0, 2)],
      estado: 'completada',
      negocio_id: null,
      creado_por_id: null,
      movimiento_contable_id: null,
      cliente_nombre: null,
      cliente_telefono: null,
      notas: null,
    });
    return v;
  });

  await repo.save(entidades);
  const ingresoActual = ventasActuales.reduce((s, v) => s + v.total, 0);
  const ingresoAnterior = ventasAnteriores.reduce((s, v) => s + v.total, 0);
  console.log(`  ✔ ventas: ${todas.length} registros creados`);
  console.log(`     Periodo actual:   $${ingresoActual.toLocaleString('es-MX')} MXN`);
  console.log(`     Periodo anterior: $${ingresoAnterior.toLocaleString('es-MX')} MXN`);
}

// ── artículos con stock crítico ───────────────────────────────────────────────

async function seedArticulos(usuarioId: string): Promise<void> {
  const repo = AppDataSource.getRepository(Articulo);

  const existentes = await repo.count({ where: { usuario_id: usuarioId } });
  if (existentes > 0) {
    console.log(`  · artículos: ya existen ${existentes} registros — omitido`);
    return;
  }

  const articulos = [
    // 🔴 ROJO: agotados
    {
      nombre: 'Harina de trigo (kg)',
      tipo: 'insumo' as const,
      unidad: 'kg',
      stock_actual: 0,
      stock_minimo: 10,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 18,
    },
    {
      nombre: 'Cajas de empaque pizza',
      tipo: 'insumo' as const,
      unidad: 'pieza',
      stock_actual: 0,
      stock_minimo: 50,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 4.5,
    },
    // 🟡 AMARILLO: bajo mínimo
    {
      nombre: 'Queso mozzarella (kg)',
      tipo: 'insumo' as const,
      unidad: 'kg',
      stock_actual: 3,
      stock_minimo: 8,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 95,
    },
    {
      nombre: 'Salsa de tomate (lt)',
      tipo: 'insumo' as const,
      unidad: 'litro',
      stock_actual: 2,
      stock_minimo: 5,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 32,
    },
    {
      nombre: 'Pepperoni (kg)',
      tipo: 'insumo' as const,
      unidad: 'kg',
      stock_actual: 1.5,
      stock_minimo: 4,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 120,
    },
    // 🟢 VERDE: OK (para mostrar balance)
    {
      nombre: 'Pizza Margherita',
      tipo: 'producto' as const,
      unidad: 'pieza',
      stock_actual: 25,
      stock_minimo: 5,
      es_insumo: false,
      es_vendible: true,
      precio_venta: 180,
      costo_unitario: 65,
    },
    {
      nombre: 'Pizza Pepperoni',
      tipo: 'producto' as const,
      unidad: 'pieza',
      stock_actual: 18,
      stock_minimo: 5,
      es_insumo: false,
      es_vendible: true,
      precio_venta: 210,
      costo_unitario: 80,
    },
    // Pastelería Lua
    {
      nombre: 'Mantequilla sin sal (kg)',
      tipo: 'insumo' as const,
      unidad: 'kg',
      stock_actual: 0,
      stock_minimo: 3,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 145,
    },
    {
      nombre: 'Azúcar glass (kg)',
      tipo: 'insumo' as const,
      unidad: 'kg',
      stock_actual: 1,
      stock_minimo: 5,
      es_insumo: true,
      es_vendible: false,
      precio_venta: 0,
      costo_unitario: 28,
    },
    {
      nombre: 'Pastel de 3 leches',
      tipo: 'producto' as const,
      unidad: 'pieza',
      stock_actual: 8,
      stock_minimo: 2,
      es_insumo: false,
      es_vendible: true,
      precio_venta: 450,
      costo_unitario: 160,
    },
  ];

  const entidades = articulos.map((a) =>
    repo.create({
      usuario_id: usuarioId,
      negocio_id: null,
      creado_por_id: null,
      nombre: a.nombre,
      tipo: a.tipo,
      unidad: a.unidad,
      stock_actual: a.stock_actual,
      stock_minimo: a.stock_minimo,
      costo_promedio: a.costo_unitario,
      es_insumo: a.es_insumo,
      es_vendible: a.es_vendible,
      precio_venta: a.precio_venta,
      costo_unitario: a.costo_unitario,
      activo: true,
      atributos_extra: {},
      orden: 0,
    })
  );

  await repo.save(entidades);
  const agotados = articulos.filter((a) => a.stock_actual <= 0).length;
  const bajoMin = articulos.filter((a) => a.stock_actual > 0 && a.stock_actual <= a.stock_minimo).length;
  console.log(`  ✔ artículos: ${articulos.length} creados (${agotados} agotados 🔴, ${bajoMin} bajo mínimo 🟡)`);
}

// ── metas de negocio ──────────────────────────────────────────────────────────

async function seedMetas(usuarioId: string): Promise<void> {
  const repo = AppDataSource.getRepository(MetaNegocio);

  const existentes = await repo.count({ where: { usuario_id: usuarioId } });
  if (existentes > 0) {
    console.log(`  · metas: ya existen ${existentes} registros — omitido`);
    return;
  }

  const hoy = toISO(0);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = new Date(
    parseInt(hoy.slice(0, 4)),
    parseInt(hoy.slice(5, 7)),   // mes siguiente → último día del mes actual
    0
  ).toISOString().slice(0, 10);

  const metas = [
    // 🟡 Meta de ingresos: ~75% del objetivo (dispara amarillo)
    {
      nombre: 'Ingresos mensuales agosto',
      tipo: 'ingresos' as const,
      objetivo: 25_000,        // objetivo: $25,000
      avance_manual: 0,        // se calcula desde ventas reales
      periodo_inicio: inicioMes,
      periodo_fin: finMes,
      notas: 'Meta mensual de ingresos totales del negocio',
    },
    // 🟡 Meta de ventas: número de tickets
    {
      nombre: 'Pedidos semanales',
      tipo: 'ventas' as const,
      objetivo: 60,             // objetivo: 60 pedidos en el mes
      avance_manual: 0,
      periodo_inicio: toISO(-29),
      periodo_fin: hoy,
      notas: 'Número de pedidos completados en 30 días',
    },
    // 🟢 Meta personalizada ya cumplida
    {
      nombre: 'Nuevos clientes referidos',
      tipo: 'personalizada' as const,
      objetivo: 10,
      avance_manual: 12,       // superada → verde
      periodo_inicio: inicioMes,
      periodo_fin: finMes,
      notas: 'Clientes nuevos captados por recomendación',
    },
    // 🟡 Meta personalizada a la mitad
    {
      nombre: 'Reseñas en Google Maps',
      tipo: 'personalizada' as const,
      objetivo: 20,
      avance_manual: 8,        // 40% → amarillo
      periodo_inicio: inicioMes,
      periodo_fin: finMes,
      notas: 'Reseñas de 5 estrellas conseguidas el mes',
    },
  ];

  const entidades = metas.map((m) =>
    repo.create({
      usuario_id: usuarioId,
      negocio_id: null,
      nombre: m.nombre,
      tipo: m.tipo,
      objetivo: m.objetivo,
      avance_manual: m.avance_manual,
      periodo_inicio: m.periodo_inicio,
      periodo_fin: m.periodo_fin,
      notas: m.notas,
      activa: true,
    })
  );

  await repo.save(entidades);
  console.log(`  ✔ metas: ${metas.length} creadas`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('── Seed ALERTAS OPERATIVAS demo@bi0a100.com ─────────');
  await AppDataSource.initialize();
  console.log('✔ Conexión a BD establecida');

  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    where: { email: EMAIL },
  });
  if (!usuario) {
    console.error(`❌ Usuario ${EMAIL} no encontrado. Ejecuta primero seed:demo`);
    process.exit(1);
  }
  console.log(`✔ Usuario: ${usuario.email} (plan: ${usuario.plan})`);

  // Necesitamos un producto_id para las ventas
  const producto = await AppDataSource.getRepository(Producto).findOne({
    where: { usuario_id: usuario.id },
    order: { created_at: 'ASC' },
  });
  if (!producto) {
    console.error('❌ No hay productos. Ejecuta primero seed:demo');
    process.exit(1);
  }
  console.log(`✔ Producto raíz: "${producto.nombre}"`);

  console.log('\n▶ Ventas históricas (30d actual + 30d anterior):');
  await seedVentas(usuario.id, producto.id);

  console.log('\n▶ Artículos / inventario:');
  await seedArticulos(usuario.id);

  console.log('\n▶ Metas de negocio:');
  await seedMetas(usuario.id);

  console.log('\n────────────────────────────────────────────────────');
  console.log('✅ ALERTAS DEMO LISTA');
  console.log('   Panel:  http://localhost:3000/dashboard/alertas');
  console.log('   Espera ver:');
  console.log('   🔴 3 artículos agotados (harina, cajas, mantequilla)');
  console.log('   🟡 Stock bajo en mozzarella, salsa, pepperoni, azúcar');
  console.log('   🟡 Metas de ingresos y pedidos sin cumplir');
  console.log('   🟢 Meta de referidos superada');
  console.log('   📊 Comparativa ingresos 30d vs. 30d anterior');
  console.log('   ✨ Resumen ejecutivo IA (plan pro_plus activo)');
  console.log('────────────────────────────────────────────────────');

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Seed falló:', err);
  try { await AppDataSource.destroy(); } catch { /* noop */ }
  process.exit(1);
});
