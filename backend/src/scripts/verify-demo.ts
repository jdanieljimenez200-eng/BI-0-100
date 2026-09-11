/**
 * Verificación end-to-end de la cuenta DEMO (solo local).
 * Arranca el server real → login → resumen → detalle de análisis por módulo.
 */
import { initializeApp } from '../app';

const BASE = 'http://localhost:3001';
const EMAIL = 'demo@bi0a100.com';
const PASSWORD = 'Demo123!';

async function main() {
  await initializeApp();
  await new Promise((r) => setTimeout(r, 800));

  let fallos = 0;
  const ok = (nombre: string, cond: boolean, extra = '') => {
    console.log(`${cond ? '✔' : '❌'} ${nombre}${extra ? ` — ${extra}` : ''}`);
    if (!cond) fallos++;
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = (await loginRes.json()) as {
    accessToken?: string;
    user?: { plan?: string };
    error?: string;
  };
  ok('POST /auth/login', loginRes.status === 200 && !!login.accessToken, `plan=${login.user?.plan}`);
  const token = login.accessToken ?? '';

  const authHeaders = { Authorization: `Bearer ${token}` };
  const getJson = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: authHeaders });
    return { status: r.status, body: (await r.json()) as any };
  };

  // ── Resumen dashboard ──────────────────────────────────────────────────────
  const resumen = await getJson('/api/dashboard/resumen');
  const productos = resumen.body?.productos ?? [];
  ok(
    'GET /dashboard/resumen',
    resumen.status === 200 && productos.length === 2,
    `${productos.length} productos`
  );
  for (const p of productos) {
    const mods = Object.entries(p.analisis ?? {}) as [string, { estado?: string } | null][];
    const completados = mods.filter(([, s]) => s?.estado === 'completado').map(([m]) => m);
    ok(
      `  producto "${p.nombre}"`,
      mods.length === 5 && completados.length === 5,
      `completados: ${completados.join(', ')}`
    );
  }

  // ── Detalle de cada módulo (contrato de las páginas de resultado) ──────────
  const primero = productos[0];
  const checks: [string, string, (b: any) => boolean][] = [
    [
      'mercado',
      `/api/mercado/${primero.analisis.mercado.id}`,
      (b) =>
        b.reporte_bi_data != null &&
        Array.isArray(b.dafo_data?.fortalezas) &&
        b.viabilidad_score != null &&
        b.tendencias_data != null &&
        b.competencia_data != null &&
        Array.isArray(b.secciones_bloqueadas) &&
        b.secciones_bloqueadas.length === 0,
    ],
    [
      'marketing',
      `/api/marketing/${primero.analisis.marketing.id}`,
      (b) =>
        Array.isArray(b.estrategias_data) &&
        b.estrategias_data.length > 0 &&
        b.calendario_data != null &&
        b.secciones_bloqueadas.length === 0,
    ],
    [
      'ventas',
      `/api/ventas/${primero.analisis.ventas.id}`,
      (b) =>
        Array.isArray(b.tips_data) &&
        b.tips_data.length > 0 &&
        b.historia_data?.como_lo_logro != null &&
        b.porque_fallan_data?.razones?.length > 0 &&
        b.secciones_bloqueadas.length === 0,
    ],
    [
      'finanzas',
      `/api/finanzas/${primero.analisis.finanzas.id}`,
      (b) => b.proyeccion_data != null && b.breakeven_data != null && b.resumen_data != null,
    ],
    [
      'legal',
      `/api/legal/${primero.analisis.legal.id}`,
      (b) => b.resultado_data != null && b.cumplimiento_global != null,
    ],
    [
      'brief',
      `/api/brief/${(await getJson('/api/brief/recientes')).body[0]?.id}`,
      (b) => b.resultado_data != null && b.secciones_bloqueadas.length === 0,
    ],
  ];

  for (const [modulo, path, valida] of checks) {
    const r = await getJson(path);
    ok(`GET /${modulo}/<id>`, r.status === 200 && valida(r.body), `status=${r.status}`);
  }

  // ── Historia diaria ────────────────────────────────────────────────────────
  const hist = await getJson(`/api/ventas/historias/diaria?productoId=${primero.id}`);
  ok('GET /ventas/historias/diaria', hist.status === 200 && !!hist.body?.como_lo_logro);

  console.log('────────────────────────────────────────────');
  if (fallos === 0) {
    console.log('✅ DEMO VERIFICADA END-TO-END');
  } else {
    console.log(`❌ ${fallos} checks fallaron`);
  }
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Verificación crash:', err);
  process.exit(1);
});
