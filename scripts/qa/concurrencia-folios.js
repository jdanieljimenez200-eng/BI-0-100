/**
 * scripts/qa/concurrencia-folios.js
 * 
 * Prueba de Concurrencia y Consistencia Transaccional (Fase 2 & Fase 4 Pre-Deploy)
 * 
 * Verifica bajo alta concurrencia real (20 requests paralelos):
 * 1. Generación de folios correlativos POS (pg_advisory_xact_lock) sin colisiones.
 * 2. Generación de números de cotización (COT-######) concurrentes sin duplicados.
 * 3. Deducción atómica de inventario con bloqueo pesimista: 20 deducciones sobre stock=10
 *    garantizando que el saldo resultante nunca sea negativo (10 éxitos, 10 rechazos controlados).
 */

const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';
const DB_HOST = process.env.DB_HOST || 'localhost';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('🚀 INICIANDO AUDITORÍA DE CONCURRENCIA Y CONSISTENCIA TRANSACCIONAL');
  console.log('=================================================================\n');

  const email = `qa_concurrency_${Date.now()}@bi0a100.test`;
  const password = 'Password123!';

  // 1. Registro de usuario QA
  console.log(`[1/4] Creando usuario de prueba: ${email}`);
  const signupRes = await request('POST', '/auth/signup', {
    nombre: 'QA Concurrencia',
    email,
    password,
  });

  if (signupRes.status !== 201) {
    throw new Error(`Error al registrar usuario QA: ${JSON.stringify(signupRes.body)}`);
  }

  const token = signupRes.body.token || signupRes.body.accessToken;
  const userId = signupRes.body.user?.id || signupRes.body.usuario?.id;
  console.log(`   ✓ Usuario creado con ID: ${userId}`);

  // Habilitar plan Business en DB para incluir todas las herramientas y movimientos ilimitados
  const { execSync } = require('child_process');
  try {
    execSync(`docker exec bi0a100-postgres-1 psql -U bi0a100_user -d bi0a100_db -c "UPDATE usuarios SET plan = 'business' WHERE id = '${userId}'"`, { stdio: 'pipe' });
    console.log('   ✓ Plan actualizado a "business" en base de datos (todas las herramientas incluidas, ilimitado)');
  } catch (err) {
    console.warn('   ⚠️ No se pudo ejecutar docker exec directamente para subir el plan:', err.message);
  }

  // 2. Crear producto y habilitar plan Pro/Business en el usuario
  console.log('[2/4] Creando producto para pruebas...');
  const prodRes = await request('POST', '/productos', {
    nombre: 'Café Especial QA',
    pais: 'MX',
    tipo: 'producto',
    precio: 75,
    presupuesto: 2000,
  }, token);

  if (prodRes.status !== 201 && prodRes.status !== 200) {
    throw new Error(`Error al crear producto: ${JSON.stringify(prodRes.body)}`);
  }
  const productoId = prodRes.body.id || prodRes.body.producto?.id;
  console.log(`   ✓ Producto creado: ${productoId}`);

  // =========================================================================
  // TEST 1: 20 Cobros POS Concurrentes
  // =========================================================================
  console.log('\n[TEST 1] Ejecutando 20 cobros POS simultáneos (Promise.all)...');
  const t0_pos = Date.now();
  const posPromises = [];
  for (let i = 1; i <= 20; i++) {
    posPromises.push(
      request('POST', '/pos/ventas', {
        producto_id: productoId,
        cliente_nombre: `Cliente Concurrente ${i}`,
        lineas: [
          { nombre: 'Café Americano 12oz', precio_unitario: 45, cantidad: 1 },
          { nombre: 'Galleta Avena', precio_unitario: 25, cantidad: 1 },
        ],
        metodo_pago: 'tarjeta',
      }, token)
    );
  }

  const posResponses = await Promise.all(posPromises);
  const duracion_pos = Date.now() - t0_pos;

  const ticketsGenerados = [];
  let fallosPos = 0;

  for (const r of posResponses) {
    if (r.status === 201) {
      ticketsGenerados.push(r.body.venta.numero_ticket);
    } else {
      fallosPos++;
      console.error(`   ⚠️ Venta rechazada (${r.status}):`, r.body);
    }
  }

  const ticketsUnicos = new Set(ticketsGenerados);
  console.log(`   ✓ Duración: ${duracion_pos} ms (promedio ${(duracion_pos / 20).toFixed(1)} ms/req)`);
  console.log(`   ✓ Exitosos: ${ticketsGenerados.length}/20 | Fallos: ${fallosPos}`);
  console.log(`   ✓ Tickets únicos generados: ${ticketsUnicos.size}/${ticketsGenerados.length}`);
  console.log(`   ✓ Muestra de folios: ${ticketsGenerados.slice(0, 5).join(', ')} ... ${ticketsGenerados.slice(-1)}`);

  if (ticketsUnicos.size !== ticketsGenerados.length || ticketsGenerados.length === 0) {
    throw new Error('❌ FALLO CRÍTICO: Se detectaron números de ticket POS duplicados o ausentes!');
  } else {
    console.log('   ✅ RESULTADO POS: 100% libre de colisiones correlativas.');
  }

  // =========================================================================
  // TEST 2: 20 Cotizaciones Concurrentes
  // =========================================================================
  console.log('\n[TEST 2] Ejecutando 20 cotizaciones simultáneas (Promise.all)...');
  const t0_cot = Date.now();
  const cotPromises = [];
  for (let i = 1; i <= 20; i++) {
    cotPromises.push(
      request('POST', '/cotizaciones', {
        cliente_nombre: `Empresa Prospecto ${i} SA de CV`,
        items: [
          { descripcion: 'Servicio de Consultoría', cantidad: 1, precio_unitario: 1500 },
        ],
      }, token)
    );
  }

  const cotResponses = await Promise.all(cotPromises);
  const duracion_cot = Date.now() - t0_cot;

  const foliosCot = [];
  let fallosCot = 0;

  for (const r of cotResponses) {
    if (r.status === 201) {
      foliosCot.push(r.body.numero);
    } else {
      fallosCot++;
      console.error(`   ⚠️ Cotización rechazada (${r.status}):`, r.body);
    }
  }

  const foliosCotUnicos = new Set(foliosCot);
  console.log(`   ✓ Duración: ${duracion_cot} ms (promedio ${(duracion_cot / 20).toFixed(1)} ms/req)`);
  console.log(`   ✓ Exitosas: ${foliosCot.length}/20 | Fallos: ${fallosCot}`);
  console.log(`   ✓ Folios únicos generados: ${foliosCotUnicos.size}/${foliosCot.length}`);
  console.log(`   ✓ Muestra de folios: ${foliosCot.slice(0, 5).join(', ')} ... ${foliosCot.slice(-1)}`);

  if (foliosCotUnicos.size !== foliosCot.length || foliosCot.length === 0) {
    throw new Error('❌ FALLO CRÍTICO: Se detectaron folios de cotización duplicados!');
  } else {
    console.log('   ✅ RESULTADO COTIZACIONES: 100% libre de colisiones.');
  }

  // =========================================================================
  // TEST 3: Deducción Concurrente de Inventario con Límite de Stock
  // =========================================================================
  console.log('\n[TEST 3] Verificando consistencia transaccional en inventario...');
  console.log('   Deduciendo 20 unidades concurrentes sobre un insumo con stock inicial = 10');

  // Alta de insumo con stock = 10
  const insumoRes = await request('POST', '/inventario/insumos', {
    nombre: 'Grano Arábica 1kg',
    categoria: 'Materia Prima',
    unidad: 'kg',
    stock_minimo: 2,
    stock_actual: 10,
    costo_promedio: 180,
  }, token);

  if (insumoRes.status !== 201 && insumoRes.status !== 200) {
    throw new Error(`Error al crear insumo: ${JSON.stringify(insumoRes.body)}`);
  }
  const insumoId = insumoRes.body.id;
  console.log(`   ✓ Insumo creado con ID: ${insumoId} y stock_actual: 10`);

  // Lanzar 20 deducciones simultáneas de 1 unidad cada una
  const invPromises = [];
  for (let i = 1; i <= 20; i++) {
    invPromises.push(
      request('POST', '/inventario/movimientos', {
        insumo_id: insumoId,
        tipo: 'salida',
        cantidad: 1,
        motivo: `Consumo concurrente ${i}`,
      }, token)
    );
  }

  const invResponses = await Promise.all(invPromises);

  let salidasAceptadas = 0;
  let salidasRechazadas = 0;

  for (const r of invResponses) {
    if (r.status === 201 || r.status === 200) {
      salidasAceptadas++;
    } else if (r.status === 400 || r.status === 409 || r.status === 422) {
      salidasRechazadas++;
    } else {
      console.warn(`   ⚠️ Código inesperado (${r.status}):`, r.body);
    }
  }

  // Consultar estado final del insumo
  const getInsumos = await request('GET', '/inventario/insumos', null, token);
  const insumoFinal = (getInsumos.body.insumos || []).find((i) => i.id === insumoId);
  const stockFinal = Number(insumoFinal ? insumoFinal.stock_actual : -999);

  console.log(`   ✓ Salidas aceptadas: ${salidasAceptadas}`);
  console.log(`   ✓ Salidas rechazadas por stock insuficiente: ${salidasRechazadas}`);
  console.log(`   ✓ Stock final en base de datos: ${stockFinal}`);

  if (stockFinal < 0) {
    throw new Error(`❌ FALLO CRÍTICO: El stock es NEGATIVO (${stockFinal})! Carrera de datos detectada!`);
  }

  if (salidasAceptadas !== 10 || salidasRechazadas !== 10 || stockFinal !== 0) {
    throw new Error(`❌ FALLO EN REGLA DE NEGOCIO: Esperados 10 éxitos y 10 rechazos, stock 0. Obtenidos: ${salidasAceptadas} éxitos, ${salidasRechazadas} rechazos, stock: ${stockFinal}`);
  }

  console.log('   ✅ RESULTADO INVENTARIO: 0% lecturas sucias, 0% saldos negativos, aislamiento transaccional estricto.');

  console.log('\n=================================================================');
  console.log('🎉 AUDITORÍA DE CONCURRENCIA Y TRANSACCIONES COMPLETADA CON ÉXITO');
  console.log('=================================================================');
}

run().catch((err) => {
  console.error('\n❌ ERROR DURANTE LA EJECUCIÓN DEL TEST:', err);
  process.exit(1);
});
