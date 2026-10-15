import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6-pos-write.js
 * Prueba de carga concurrente de escritura y lectura en el módulo POS.
 * 
 * Simula 15 cajas registradoras cobrando y consultando catálogo en simultáneo.
 * Umbral: p95 < 400ms, errores < 1%.
 */

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '20s', target: 15 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api';

// Setup: Usar token provisto o crear cuenta
export function setup() {
  if (__ENV.TOKEN && __ENV.PRODUCTO_ID) {
    return { token: __ENV.TOKEN, productoId: __ENV.PRODUCTO_ID };
  }

  const email = `k6_pos_owner_${Date.now()}@bi0a100.test`;
  const signupRes = http.post(
    `${BASE_URL}/auth/signup`,
    JSON.stringify({
      nombre: 'K6 POS Owner',
      email: email,
      password: 'Password123!',
      acepta_terminos: true,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const signupData = JSON.parse(signupRes.body);
  const token = signupData.token || signupData.accessToken;
  const userId = signupData.user?.id || signupData.usuario?.id;

  // Crear producto base
  const prodRes = http.post(
    `${BASE_URL}/productos`,
    JSON.stringify({
      nombre: 'K6 POS Store',
      pais: 'MX',
      tipo: 'producto',
      precio: 85,
      presupuesto: 5000,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const prodData = JSON.parse(prodRes.body);
  const productoId = prodData.id;

  return { token, productoId, userId };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
    'x-bypass-rate-limit': 'bi0a100-qa-bypass',
  };

  // 1. Escritura: Crear venta POS
  const ventaPayload = JSON.stringify({
    producto_id: data.productoId,
    cliente_nombre: `Cliente Mostrador ${__VU}-${__ITER}`,
    lineas: [
      { nombre: 'Café Espresso', precio_unitario: 35, cantidad: 1 },
      { nombre: 'Croissant Mantequilla', precio_unitario: 45, cantidad: 1 },
    ],
    metodo_pago: 'efectivo',
  });

  const ventaRes = http.post(`${BASE_URL}/pos/ventas`, ventaPayload, { headers });
  check(ventaRes, {
    'venta created 201': (r) => r.status === 201,
    'ticket exists': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.venta?.numero_ticket;
      } catch (e) {
        return false;
      }
    },
  });

  // 2. Lectura: Consultar últimas ventas
  const listRes = http.get(`${BASE_URL}/pos/ventas?producto_id=${data.productoId}`, { headers });
  check(listRes, {
    'list ventas 200': (r) => r.status === 200,
  });

  sleep(0.3);
}
