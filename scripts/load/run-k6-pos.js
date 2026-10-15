/**
 * scripts/load/run-k6-pos.js
 * 
 * Orquestador de la prueba de carga k6 para el módulo POS:
 * 1. Crea cuenta de prueba Owner
 * 2. Actualiza su plan a 'business' en Postgres
 * 3. Crea un producto para POS
 * 4. Invoca el contenedor Docker de Grafana k6 pasando las credenciales
 * 5. Muestra métricas de concurrencia y latencia p95
 */

const http = require('http');
const { execSync } = require('child_process');

const API_BASE = 'http://localhost:3001/api';

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
          resolve({ status: res.statusCode, body: JSON.parse(data) });
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

async function main() {
  console.log('⚡ PREPARANDO ENTORNO PARA PRUEBA DE CARGA POS (k6)');
  console.log('==================================================\n');

  const ts = Date.now();
  const email = `k6_pos_runner_${ts}@bi0a100.test`;

  console.log('[1/3] Creando usuario Owner para la prueba...');
  const signup = await request('POST', '/auth/signup', {
    nombre: 'Runner POS k6',
    email,
    password: 'Password123!',
    acepta_terminos: true,
  });

  const token = signup.body.token || signup.body.accessToken;
  const userId = signup.body.user?.id || signup.body.usuario?.id;

  execSync(`docker exec bi0a100-postgres-1 psql -U bi0a100_user -d bi0a100_db -c "UPDATE usuarios SET plan = 'business' WHERE id = '${userId}'"`, { stdio: 'pipe' });
  console.log('   ✓ Plan actualizado a Business en base de datos');

  console.log('[2/3] Creando producto para ventas POS...');
  const prod = await request('POST', '/productos', {
    nombre: 'Cafetería Gourmet k6',
    pais: 'MX',
    tipo: 'producto',
    precio: 95,
    presupuesto: 5000,
  }, token);
  const productoId = prod.body.id;
  console.log(`   ✓ Producto creado: ${productoId}`);

  console.log('\n[3/3] Ejecutando k6 en contenedor Docker (15 cajas registradoras concurrentes)...');
  const k6Cmd = `docker run --rm --network bi0a100_bi0a100-network -e API_URL=http://backend:3001/api -e TOKEN="${token}" -e PRODUCTO_ID="${productoId}" -v "j:/Bi0a100/scripts/load:/scripts" grafana/k6 run /scripts/k6-pos-write.js`;

  try {
    const output = execSync(k6Cmd, { encoding: 'utf-8', stdio: 'inherit' });
    console.log('\n✅ PRUEBA DE CARGA POS COMPLETADA SATISFACTORIAMENTE');
  } catch (err) {
    console.error('\n❌ ERROR EN PRUEBA DE CARGA:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
