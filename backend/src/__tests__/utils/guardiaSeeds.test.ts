import { motivoParaAbortar, hostDeBaseDeDatos } from '../../scripts/guardiaSeeds';

/** Los seeds crean cuentas con contraseñas del repositorio: nunca contra producción. */
describe('guardiaSeeds', () => {
  it('permite la base local y la del docker-compose', () => {
    expect(motivoParaAbortar({ DATABASE_URL: 'postgresql://u:p@localhost:5432/bi0a100_db' })).toBeNull();
    expect(motivoParaAbortar({ DATABASE_URL: 'postgresql://u:p@postgres:5432/bi0a100_db' })).toBeNull();
    expect(motivoParaAbortar({})).toBeNull(); // sin variables: host 'postgres' del compose
  });

  it('aborta con NODE_ENV=production aunque la base sea local', () => {
    expect(motivoParaAbortar({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost/x' })).toMatch(/production/);
  });

  it('aborta si la base está en un host remoto, aunque NODE_ENV no lo diga', () => {
    expect(motivoParaAbortar({ DATABASE_URL: 'postgresql://u:p@ep-cool-1.neon.tech/bi0a100?sslmode=require' })).toMatch(
      /remoto \(ep-cool-1\.neon\.tech\)/
    );
    expect(motivoParaAbortar({ DB_HOST: 'db.prod.internal' })).toMatch(/remoto/);
  });

  it('SEED_PERMITIR_REMOTO=true permite un entorno de pruebas remoto, nunca producción', () => {
    expect(motivoParaAbortar({ SEED_PERMITIR_REMOTO: 'true', DATABASE_URL: 'postgresql://u:p@staging.host/x' })).toBeNull();
    expect(motivoParaAbortar({ SEED_PERMITIR_REMOTO: 'true', NODE_ENV: 'production' })).toMatch(/production/);
  });

  it('interpreta hosts IPv6', () => {
    expect(hostDeBaseDeDatos({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/x' })).toBe('::1');
  });
});
