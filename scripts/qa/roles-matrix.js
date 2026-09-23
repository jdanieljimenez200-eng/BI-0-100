/**
 * scripts/qa/roles-matrix.js
 * 
 * Matriz de Roles y Permisos (Fase 3 & Fase 5 Pre-Deploy)
 * Audita 25 endpoints clave contra 4 perfiles de usuario:
 * 1. Anónimo (sin token)
 * 2. Trabajador sin permiso asignado
 * 3. Trabajador con permiso asignado (POS)
 * 4. Owner (dueño de la cuenta)
 * 5. SuperAdmin (es_admin = true) vs Usuario común en /admin/*
 */

const http = require('http');
const { execSync } = require('child_process');

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

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

function executePsql(query) {
  try {
    execSync(`docker exec bi0a100-postgres-1 psql -U bi0a100_user -d bi0a100_db -c "${query}"`, { stdio: 'pipe' });
  } catch (e) {
    console.warn('Advertencia ejecutando psql:', e.message);
  }
}

async function run() {
  console.log('🛡️  INICIANDO AUDITORÍA DE MATRIZ DE ROLES Y PERMISOS');
  console.log('===================================================\n');

  const ts = Date.now();

  // 1. Crear Owner
  console.log('[1/4] Creando usuario Owner...');
  const ownerEmail = `qa_owner_${ts}@bi0a100.test`;
  const ownerSignup = await request('POST', '/auth/signup', {
    nombre: 'Owner QA',
    email: ownerEmail,
    password: 'Password123!',
  });
  const ownerToken = ownerSignup.body.token || ownerSignup.body.accessToken;
  const ownerId = ownerSignup.body.user?.id || ownerSignup.body.usuario?.id;
  executePsql(`UPDATE usuarios SET plan = 'business', account_role = 'owner' WHERE id = '${ownerId}'`);

  // Crear producto para el Owner
  const prodRes = await request('POST', '/productos', {
    nombre: 'Restaurante Bistro QA',
    pais: 'MX',
    tipo: 'producto',
    precio: 150,
    presupuesto: 3000,
  }, ownerToken);
  const productoId = prodRes.body.id;
  console.log(`   ✓ Owner configurado (ID: ${ownerId}, Producto: ${productoId})`);

  // 2. Crear Trabajador con permisos solo en POS
  console.log('[2/4] Creando usuario Trabajador y asignando permisos...');
  const workerEmail = `qa_worker_${ts}@bi0a100.test`;
  const workerCreate = await request('POST', '/equipo/trabajadores', {
    nombre: 'Trabajador Cajero',
    email: workerEmail,
    password: 'Password123!',
  }, ownerToken);
  const workerId = workerCreate.body.id;

  // Asignar permiso exclusivo de POS para el producto del Owner
  const asigRes = await request('POST', '/equipo/asignaciones', {
    trabajador_id: workerId,
    producto_id: productoId,
    permisos: {
      pos: true,
      inventario: false,
      contabilidad: false,
      cotizaciones: false,
      clientes: false,
      nomina: false,
      calendario: false,
    },
  }, ownerToken);
  console.log(`   ✓ Asignación creada: ${asigRes.status === 201 ? 'Éxito' : 'Fallo'}`);

  // Iniciar sesión como trabajador para obtener su token JWT
  const workerLogin = await request('POST', '/auth/login', {
    email: workerEmail,
    password: 'Password123!',
  });
  const workerToken = workerLogin.body.token || workerLogin.body.accessToken;
  console.log(`   ✓ Trabajador logueado con token JWT (ID: ${workerId})`);

  // 3. Crear SuperAdmin
  console.log('[3/4] Creando usuario Administrador...');
  const adminEmail = `qa_admin_${ts}@bi0a100.test`;
  const adminSignup = await request('POST', '/auth/signup', {
    nombre: 'Super Admin QA',
    email: adminEmail,
    password: 'Password123!',
  });
  const adminToken = adminSignup.body.token || adminSignup.body.accessToken;
  const adminId = adminSignup.body.user?.id || adminSignup.body.usuario?.id;
  executePsql(`UPDATE usuarios SET es_admin = true WHERE id = '${adminId}'`);
  console.log(`   ✓ SuperAdmin configurado (ID: ${adminId})`);

  // Crear insumo base para el Owner
  const insumoBase = await request('POST', '/inventario/insumos', {
    nombre: 'Insumo Matriz QA',
    unidad: 'pza',
    stock_actual: 20,
    costo_promedio: 15,
  }, ownerToken);
  const insumoId = insumoBase.body.id;

  // 4. Matriz de los 25 Endpoints
  console.log('\n[4/4] Evaluando 25 endpoints contra los 4 perfiles...');

  const endpoints = [
    { id: 1, method: 'GET', path: '/productos', body: null, name: 'Listar Productos' },
    { id: 2, method: 'POST', path: '/productos', body: { nombre: 'P2', pais: 'MX', precio: 10 }, name: 'Crear Producto' },
    { id: 3, method: 'GET', path: '/pos/ventas', body: null, name: 'Listar Ventas POS' },
    { id: 4, method: 'POST', path: '/pos/ventas', body: { producto_id: productoId, lineas: [{ nombre: 'Agua', precio_unitario: 20, cantidad: 1 }] }, name: 'Crear Venta POS' },
    { id: 5, method: 'GET', path: '/pos/catalogo', body: null, name: 'Listar Catálogo POS' },
    { id: 6, method: 'POST', path: '/pos/catalogo', body: { nombre: 'Item Test', precio: 10 }, name: 'Crear Item POS' },
    { id: 7, method: 'GET', path: '/cotizaciones', body: null, name: 'Listar Cotizaciones' },
    { id: 8, method: 'POST', path: '/cotizaciones', body: { cliente_nombre: 'Cli', items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 10 }] }, name: 'Crear Cotización' },
    { id: 9, method: 'GET', path: '/inventario/insumos', body: null, name: 'Listar Insumos' },
    { id: 10, method: 'POST', path: '/inventario/insumos', body: { nombre: 'Harina', unidad: 'kg', stock_actual: 5, costo_promedio: 10 }, name: 'Crear Insumo' },
    { id: 11, method: 'POST', path: '/inventario/movimientos', body: { insumo_id: insumoId, tipo: 'entrada', cantidad: 1 }, name: 'Registrar Mov. Inventario' },
    { id: 12, method: 'GET', path: `/contabilidad/${productoId}`, body: null, name: 'Listar Mov. Contables' },
    { id: 13, method: 'POST', path: `/contabilidad/${productoId}`, body: { tipo: 'ingreso', descripcion: 'Venta QA', monto: 150, fecha: '2026-09-20' }, name: 'Crear Mov. Contable' },
    { id: 14, method: 'GET', path: '/clientes', body: null, name: 'Listar Clientes CRM' },
    { id: 15, method: 'POST', path: '/clientes', body: { nombre: 'Cliente QA' }, name: 'Crear Cliente CRM' },
    { id: 16, method: 'GET', path: '/calendario', body: null, name: 'Listar Citas Calendario' },
    { id: 17, method: 'POST', path: '/calendario', body: { titulo: 'Cita QA', fecha: '2026-09-20', hora_inicio: '10:00', hora_fin: '11:00' }, name: 'Crear Cita Calendario' },
    { id: 18, method: 'GET', path: '/nomina/empleados', body: null, name: 'Listar Empleados Nómina' },
    { id: 19, method: 'POST', path: '/nomina/empleados', body: { nombre: 'Empleado QA', salario: 5000, tipo_pago: 'quincenal' }, name: 'Crear Empleado Nómina' },
    { id: 20, method: 'GET', path: '/equipo/trabajadores', body: null, name: 'Listar Equipo (Owner)' },
    { id: 21, method: 'POST', path: '/equipo/trabajadores', body: { nombre: 'W2', email: `w2_${ts}@bi0a100.test`, password: 'Password123!' }, name: 'Crear Trabajador (Owner)' },
    { id: 22, method: 'GET', path: '/equipo/capabilities', body: null, name: 'Catálogo Capacidades' },
    { id: 23, method: 'GET', path: '/billing/status', body: null, name: 'Estado de Facturación' },
    { id: 24, method: 'GET', path: '/admin/network/resenas', body: null, name: 'Admin Moderar Reseñas' },
    { id: 25, method: 'GET', path: '/network/mis-fichas', body: null, name: 'Consultar Mis Fichas Red' },
  ];

  const resultados = [];
  let fallosTotales = 0;

  console.log('| # | Endpoint | Anónimo | Trabajador (Solo POS) | Owner | Admin | Resultado |');
  console.log('|---|---|:---:|:---:|:---:|:---:|:---:|');

  for (const ep of endpoints) {
    // 1. Anonimo
    const resAnon = await request(ep.method, ep.path, ep.body, null);
    
    // 2. Trabajador
    const resWorker = await request(ep.method, ep.path, ep.body, workerToken);

    // 3. Owner
    const resOwner = await request(ep.method, ep.path, ep.body, ownerToken);

    // 4. Admin
    const resAdmin = await request(ep.method, ep.path, ep.body, adminToken);

    // Validaciones de seguridad esperadas:
    // - Anonimo: debe ser 401 en todo
    const anonOk = resAnon.status === 401;

    // - Admin: debe tener 200 en /admin/*; usuario no-admin (Owner o Worker) debe tener 403 en /admin/*
    let adminOk = true;
    if (ep.path.startsWith('/admin')) {
      adminOk = resAdmin.status === 200 && resOwner.status === 403 && resWorker.status === 403;
    }

    // - Equipo: Trabajador debe tener 403 en /equipo/trabajadores (solo owner)
    let equipoOk = true;
    if (ep.path.startsWith('/equipo/trabajadores')) {
      equipoOk = resWorker.status === 403 && (resOwner.status === 200 || resOwner.status === 201);
    }

    // - Herramientas: Trabajador tiene POS asignado (200/201), pero NO tiene Inventario, Cotizaciones, Contabilidad, etc (403)
    let permisosOk = true;
    if (ep.path.startsWith('/pos')) {
      permisosOk = resWorker.status === 200 || resWorker.status === 201;
    } else if (
      ep.path.startsWith('/inventario') ||
      ep.path.startsWith('/cotizaciones') ||
      ep.path.startsWith('/contabilidad') ||
      ep.path.startsWith('/calendario') ||
      ep.path.startsWith('/nomina') ||
      ep.path.startsWith('/clientes')
    ) {
      permisosOk = resWorker.status === 403;
    }

    const testPassed = anonOk && adminOk && equipoOk && permisosOk;
    if (!testPassed) fallosTotales++;

    const row = `| ${ep.id} | ${ep.method} ${ep.path} | ${resAnon.status} | ${resWorker.status} | ${resOwner.status} | ${resAdmin.status} | ${testPassed ? '✅ PASS' : '❌ FAIL'} |`;
    console.log(row);
    resultados.push({ ...ep, anon: resAnon.status, worker: resWorker.status, owner: resOwner.status, admin: resAdmin.status, pass: testPassed });
  }

  console.log('\n===================================================');
  if (fallosTotales === 0) {
    console.log(`🎉 AUDITORÍA DE MATRIZ DE ROLES: 25/25 ENDPOINTS VALIDADOS EXITOSAMENTE (0 VULNERABILIDADES)`);
  } else {
    console.error(`❌ AUDITORÍA DE MATRIZ DE ROLES: ${fallosTotales} ENDPOINTS NO CUMPLIERON EL CRITERIO ESPERADO`);
    process.exit(1);
  }
  console.log('===================================================\n');
}

run().catch((err) => {
  console.error('\n❌ ERROR CRÍTICO EN AUDITORÍA DE ROLES:', err);
  process.exit(1);
});
