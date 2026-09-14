/**
 * Filas de un `UPDATE … RETURNING` o `DELETE … RETURNING` ejecutado con
 * `query()` de TypeORM.
 *
 * En Postgres, TypeORM devuelve `[filas, afectadas]` para UPDATE y DELETE, pero
 * solo `filas` para SELECT e INSERT. Desestructurar `const [fila] = …` sobre un
 * UPDATE da el array entero, y `filas.length` vale siempre 2.
 */
export function filasSql<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado) && resultado.length === 2 && Array.isArray(resultado[0]) && typeof resultado[1] === 'number') {
    return resultado[0] as T[];
  }
  return (resultado as T[]) ?? [];
}
