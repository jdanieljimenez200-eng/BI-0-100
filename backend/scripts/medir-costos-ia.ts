/**
 * Mide el costo REAL de la IA por módulo, con la API key real.
 *
 * Crea una cuenta y dos productos temporales, ejecuta cada análisis completo por
 * el mismo camino que un cliente (procesarAnalisis del worker) y las acciones
 * bajo demanda de Ventas, y resume lo que registró `uso_ia`: tokens, costo medio,
 * p90 y cuántas veces cayó a plantilla. Se detiene al llegar al tope de gasto.
 *
 *   docker compose exec -T backend npx ts-node scripts/medir-costos-ia.ts [rondas=5] [topeUsd=10]
 *
 * GASTA DINERO REAL. Sin ANTHROPIC_API_KEY no hace nada.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { AppDataSource } from '../src/config/database';
import { hayClaveAnthropic } from '../src/config/anthropic';
import { procesarAnalisis } from '../src/workers/analysisWorker';
import { conSeguimientoIA } from '../src/utils/seguimientoIA';
import {
  analizarCompetidor,
  evaluarGuion,
  generarFollowUps,
  generarPalabrasClaveAds,
  generarPerfilCliente,
  generarRebatidas,
} from '../src/services/ventas/ventasService';
import type { VentasAnalisisInput } from '../src/services/ventas/types';

const RONDAS = Number(process.argv[2] ?? 5);
const TOPE_USD = Number(process.argv[3] ?? 10);

const PRODUCTOS = [
  { nombre: 'Café de especialidad en grano', categoria: 'Alimentos y bebidas', precio: 280, pais: 'MX', descripcion: 'Café de Chiapas tostado artesanal, bolsa de 500 g, venta en local y por WhatsApp.' },
  { nombre: 'Asesoría contable para pymes', categoria: 'Servicios profesionales', precio: 1500, pais: 'MX', descripcion: 'Contabilidad mensual, declaraciones y nómina para negocios de 1 a 20 empleados.' },
];

const PAYLOADS: Record<string, (i: number) => Record<string, unknown>> = {
  mercado: (i) => ({
    pais: 'MX', scope: i % 2 ? 'nacional' : 'local', estado: 'Jalisco', ciudad: 'Guadalajara',
    forma_cobro: i % 2 ? 'Suscripción' : 'Pago Único', recurrencia_meses: 1, clientes_mes: 120,
    nse_target: 'C+', competidores_conocidos: 'Dos negocios similares en la zona', tipo_local: 'retail', m2_declarados: 40, renta_declarada: 18000,
  }),
  marketing: () => ({
    vozMarca: 'Profesional', presupuestoMensual: 5000, metaCampana: 'Crecimiento', clienteIdeal: 'Dueños de negocio de 30 a 50 años',
    plataformas: ['Instagram', 'Facebook', 'WhatsApp'], capacidadContenido: '3-4/semana', canalCierre: 'whatsapp_dm', nivelTraccion: 'en_marcha', margenEstimado: 'medio_30_50',
  }),
  finanzas: () => ({ precio_venta: 280, costo_variable_unitario: 120, costos_fijos_mensuales: 25000, unidades_mes_inicial: 150, tasa_crecimiento_mensual: 5 }),
  legal: () => ({ forma_juridica: 'Persona física con actividad empresarial', tiene_empleados: true, numero_empleados: 3, vende_en_linea: true, exporta_importa: false, giro_especifico: 'Venta al por menor', estado_constitucion: 'Jalisco', anios_operando: '1-2' }),
  brief: () => ({ percepcion: ['Confiable', 'Moderno'], emocion: 'Confianza', anti_valores: ['Barato'], estilo_visual: 'Minimalista', paleta_elegida: 'A', tipo_logo: 'Isologo', simbolo_representativo: 'Una hoja', resultado_cliente: 'Tranquilidad', tono_comunicacion: 'Cercano y cálido', posicionamiento: 'Calidad premium (mejor calidad)', nivel_diferenciacion: 'Medio (algunas diferencias)' }),
  ventas: () => ({ tipo_venta: 'B2C_directo', canal_principal: 'directo', ticket_promedio: 280, tamano_equipo: 'solo_tu', objetivo_ventas: 'Duplicar ventas en 6 meses' }),
};

const TABLA: Record<string, string> = {
  mercado: 'analisis_mercado', marketing: 'analisis_marketing', finanzas: 'analisis_finanzas',
  legal: 'analisis_legal', brief: 'analisis_brief', ventas: 'analisis_ventas',
};

const q = (sql: string, p: unknown[] = []) => AppDataSource.query(sql, p);

async function gastado(usuarioId: string): Promise<number> {
  const [r] = await q(`SELECT COALESCE(SUM(costo_usd), 0)::float AS total FROM uso_ia WHERE usuario_id = $1`, [usuarioId]);
  return Number(r.total);
}

async function crearFila(modulo: string, usuarioId: string, productoId: string): Promise<string> {
  if (modulo === 'ventas') {
    const [f] = await q(
      `INSERT INTO analisis_ventas (usuario_id, producto_id, pais, nombre_producto, categoria, precio, tipo_venta, canal_principal, ticket_promedio, tamano_equipo, estado_analisis)
       SELECT $1, p.id, p.pais, p.nombre, p.categoria, p.precio, 'B2C_directo', 'directo', 280, 'solo_tu', 'procesando' FROM productos p WHERE p.id = $2 RETURNING id`,
      [usuarioId, productoId]
    );
    return f.id;
  }
  const [f] = await q(`INSERT INTO ${TABLA[modulo]} (usuario_id, producto_id, estado_analisis) VALUES ($1, $2, 'procesando') RETURNING id`, [usuarioId, productoId]);
  return f.id;
}

async function main() {
  if (!hayClaveAnthropic()) {
    console.error('Falta ANTHROPIC_API_KEY: no se mide nada.');
    process.exitCode = 1;
    return;
  }
  await AppDataSource.initialize();

  const email = `medicion-ia-${randomUUID()}@bi0a100.local`;
  const [u] = await q(`INSERT INTO usuarios (email, password_hash, nombre, plan, activo) VALUES ($1, 'x', 'Medición IA', 'business', false) RETURNING id`, [email]);
  const usuarioId: string = u.id;
  const productos: string[] = [];
  for (const p of PRODUCTOS) {
    const [r] = await q(`INSERT INTO productos (usuario_id, nombre, categoria, precio, pais, descripcion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [
      usuarioId, p.nombre, p.categoria, p.precio, p.pais, p.descripcion,
    ]);
    productos.push(r.id);
  }
  console.log(`Cuenta de medición ${usuarioId} · ${RONDAS} rondas · tope $${TOPE_USD}`);

  let detenido = false;
  const estimados: Record<string, number> = {};

  for (let ronda = 0; ronda < RONDAS && !detenido; ronda++) {
    const productoId = productos[ronda % productos.length];
    for (const modulo of Object.keys(PAYLOADS)) {
      if ((await gastado(usuarioId)) >= TOPE_USD) {
        detenido = true;
        break;
      }
      const analisisId = await crearFila(modulo, usuarioId, productoId);
      const inicio = Date.now();
      try {
        await procesarAnalisis({
          id: randomUUID(),
          data: { moduleName: modulo, analisisId, usuarioId, productoId, payload: PAYLOADS[modulo](ronda) },
        } as unknown as Job);
        const [f] = await q(`SELECT resultado_estimado FROM ${TABLA[modulo]} WHERE id = $1`, [analisisId]);
        if (f?.resultado_estimado) estimados[modulo] = (estimados[modulo] ?? 0) + 1;
        console.log(`  ronda ${ronda + 1} · ${modulo} ok en ${Math.round((Date.now() - inicio) / 1000)} s${f?.resultado_estimado ? ' (ESTIMADO)' : ''}`);
      } catch (e) {
        console.log(`  ronda ${ronda + 1} · ${modulo} FALLÓ: ${(e as Error).message}`);
      }
    }

    // Acciones bajo demanda de Ventas (no pasan por la cola).
    if (!detenido && (await gastado(usuarioId)) < TOPE_USD) {
      const p = PRODUCTOS[ronda % PRODUCTOS.length];
      const input = {
        ...(PAYLOADS.ventas(ronda) as object), pais: 'MX', nombre_producto: p.nombre, categoria: p.categoria, precio: p.precio, descripcion: p.descripcion, tiene_video: false,
      } as VentasAnalisisInput;
      await conSeguimientoIA(async () => {
        try {
          const perfil = await generarPerfilCliente(input);
          await generarRebatidas(perfil, input);
          await generarFollowUps(input);
          await generarPalabrasClaveAds(perfil, input);
          await evaluarGuion('Hola, soy Ana. Nuestro café se tuesta cada semana en Guadalajara. Si lo pruebas y no te gusta, te devolvemos tu dinero. Escríbenos por WhatsApp.', input, perfil);
          await analizarCompetidor('Café La Esquina', 'En este video mostramos nuestro café americano a 35 pesos y promociones 2x1 los martes.', input);
          console.log(`  ronda ${ronda + 1} · ventas bajo demanda ok`);
        } catch (e) {
          console.log(`  ronda ${ronda + 1} · ventas bajo demanda FALLÓ: ${(e as Error).message}`);
        }
      }, { usuarioId, modulo: 'ventas_bajo_demanda' });
    }
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  const porSeccion = await q(
    `SELECT seccion, modelo, COUNT(*)::int AS llamadas,
            ROUND(AVG(input_tokens))::int AS input_medio, ROUND(AVG(output_tokens))::int AS output_medio,
            ROUND(AVG(cache_read_tokens))::int AS cache_medio,
            ROUND(AVG(costo_usd)::numeric, 4)::float AS costo_medio,
            ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY costo_usd))::numeric, 4)::float AS costo_p90,
            ROUND(AVG(duracion_ms) / 1000.0, 1)::float AS segundos_medio
       FROM uso_ia WHERE usuario_id = $1 GROUP BY seccion, modelo ORDER BY seccion`,
    [usuarioId]
  );
  const porAnalisis = await q(
    `SELECT modulo, COUNT(DISTINCT analisis_id)::int AS analisis,
            ROUND((SUM(costo_usd) / NULLIF(COUNT(DISTINCT analisis_id), 0))::numeric, 4)::float AS costo_por_analisis
       FROM uso_ia WHERE usuario_id = $1 AND analisis_id IS NOT NULL GROUP BY modulo ORDER BY modulo`,
    [usuarioId]
  );
  const bajoDemanda = await q(
    `SELECT seccion, ROUND(AVG(costo_usd)::numeric, 4)::float AS costo_medio
       FROM uso_ia WHERE usuario_id = $1 AND modulo = 'ventas_bajo_demanda' GROUP BY seccion ORDER BY seccion`,
    [usuarioId]
  );

  console.log('\n== Por llamada ==');
  console.table(porSeccion);
  console.log('== Por análisis completo ==');
  console.table(porAnalisis);
  console.log('== Ventas bajo demanda (por acción) ==');
  console.table(bajoDemanda);
  console.log('== Cayeron a plantilla ==', estimados);
  console.log(`\nGasto total: $${(await gastado(usuarioId)).toFixed(4)}${detenido ? ' (detenido por tope)' : ''}`);
  console.log(`Los registros quedan en uso_ia con usuario_id = ${usuarioId}.`);

  // La cuenta temporal se borra; el registro de uso se conserva (sin FK) para la propuesta de precios.
  await q(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]).catch((e) => console.log('No se pudo borrar la cuenta temporal:', (e as Error).message));
  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error('ERROR', e);
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
