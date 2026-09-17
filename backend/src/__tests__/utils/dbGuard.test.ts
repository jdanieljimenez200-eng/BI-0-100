import { esBaseDeTest, nombreBaseDeDatos } from '../helpers/dbGuard';

describe('dbGuard — los tests de integración solo escriben en bases de test', () => {
  it('lee el nombre de la base desde DATABASE_URL', () => {
    expect(nombreBaseDeDatos({ DATABASE_URL: 'postgresql://u:p@localhost:5432/bi0a100_test' })).toBe('bi0a100_test');
    expect(nombreBaseDeDatos({ DATABASE_URL: 'postgres://u:p@db.neon.tech/bi0a100?sslmode=require' })).toBe('bi0a100');
  });

  it('usa DB_NAME cuando la conexión va por variables separadas', () => {
    expect(nombreBaseDeDatos({ DB_HOST: 'localhost', DB_NAME: 'app_test' })).toBe('app_test');
    expect(nombreBaseDeDatos({ DB_HOST: 'localhost' })).toBe('bi0a100');
  });

  it('sin configuración no hay base', () => {
    expect(nombreBaseDeDatos({})).toBeNull();
  });

  it('solo acepta bases cuyo nombre contiene "test"', () => {
    expect(esBaseDeTest('bi0a100_test')).toBe(true);
    expect(esBaseDeTest('bi0a100_db')).toBe(false);
    expect(esBaseDeTest('bi0a100')).toBe(false);
    expect(esBaseDeTest(null)).toBe(false);
  });
});
