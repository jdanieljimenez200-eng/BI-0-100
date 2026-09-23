import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6-auth.js
 * Prueba de carga para concurrencia de autenticación y generación de tokens JWT.
 * 
 * Target: 20 VUs simultáneos durante 30 segundos.
 * Umbral: p95 < 500ms, tasa de error 0%.
 */

export const options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '20s', target: 20 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate==0'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api';

export default function () {
  const email = `k6_user_${__VU}_${__ITER}_${Date.now()}@bi0a100.test`;
  const payload = JSON.stringify({
    nombre: `K6 User ${__VU}`,
    email: email,
    password: 'Password123!',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-bypass-rate-limit': 'bi0a100-qa-bypass',
    },
  };

  // 1. Registro
  const signupRes = http.post(`${BASE_URL}/auth/signup`, payload, params);
  check(signupRes, {
    'signup status is 201': (r) => r.status === 201,
    'signup has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body.token || body.accessToken);
      } catch (e) {
        return false;
      }
    },
  });

  // 2. Login
  const loginPayload = JSON.stringify({
    email: email,
    password: 'Password123!',
  });

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, params);
  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body.token || body.accessToken);
      } catch (e) {
        return false;
      }
    },
  });

  sleep(0.5);
}
