// Tests de INTEGRACIÓN: requieren Postgres real (en CI se levanta como servicio).
// Sin BD configurada localmente, se saltan en lugar de fallar.
export const describeWithDb =
  process.env.DATABASE_URL || process.env.DB_HOST || process.env.CI ? describe : describe.skip;
