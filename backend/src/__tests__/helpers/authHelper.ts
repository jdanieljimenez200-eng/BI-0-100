import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { app } from './testApp';

export interface TestUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  password: string;
}

/**
 * Crea un usuario real vía POST /api/auth/signup y devuelve sus tokens.
 * Usa un email aleatorio por llamada para no colisionar con el constraint
 * único de `email` entre ejecuciones/tests distintos.
 */
export async function signupTestUser(
  overrides: Partial<{ email: string; password: string; name: string }> = {}
): Promise<TestUser> {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  const password = overrides.password ?? 'Testpassword123!';
  const name = overrides.name ?? 'Test User';

  const response = await request.default(app).post('/api/auth/signup').send({ email, password, name });

  if (response.status !== 201) {
    throw new Error(
      `signupTestUser: signup falló con status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
    userId: response.body.user.id,
    email,
    password,
  };
}
