const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  AppDataSource: { isInitialized: true, query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock('../../events/sse', () => ({ emitAnalysisUpdate: jest.fn() }));
jest.mock('../../services/billing/creditosIA', () => ({ reembolsarCreditos: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../workers/analysisWorker', () => ({ procesarAnalisis: jest.fn() }));

import { emitAnalysisUpdate } from '../../events/sse';
import { reembolsarCreditos } from '../../services/billing/creditosIA';
import { limpiarAnalisisColgados, MENSAJE_TIMEOUT_ANALISIS } from '../../workers/analysisQueue';

const emitir = emitAnalysisUpdate as jest.Mock;
const reembolsar = reembolsarCreditos as jest.Mock;

/**
 * Un análisis que se queda en 'procesando' porque el proceso murió (deploy, OOM)
 * debe acabar igual que un fallo normal: en error, con los créditos devueltos y
 * con aviso a la pantalla. Antes solo se marcaba como error y el cliente pagaba.
 */
describe('limpiarAnalisisColgados', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reembolsa y avisa por cada análisis recuperado', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE analisis_legal')
        ? [[{ id: 'a-1', usuario_id: 'u-1', producto_id: 'p-1' }, { id: 'a-2', usuario_id: null, producto_id: null }], 2]
        : [[], 0]
    );

    const total = await limpiarAnalisisColgados(15);

    expect(total).toBe(2);
    expect(reembolsar.mock.calls).toEqual([[{ referenciaId: 'a-1' }], [{ referenciaId: 'a-2' }]]);
    // Sin usuario no hay a quién avisar, pero el reembolso se hace igual.
    expect(emitir).toHaveBeenCalledTimes(1);
    expect(emitir).toHaveBeenCalledWith('u-1', {
      tipo: 'legal',
      estado: 'error',
      productoId: 'p-1',
      id: 'a-1',
      errorMessage: MENSAJE_TIMEOUT_ANALISIS,
    });
  });

  it('recorre las seis tablas y devuelve las filas afectadas', async () => {
    mockQuery.mockResolvedValue([[], 0]);

    expect(await limpiarAnalisisColgados(15)).toBe(0);

    const tablas = mockQuery.mock.calls.map(([sql]) => /UPDATE (\w+)/.exec(sql)?.[1]);
    expect(tablas).toEqual([
      'analisis_mercado',
      'analisis_marketing',
      'analisis_finanzas',
      'analisis_legal',
      'analisis_brief',
      'analisis_ventas',
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('RETURNING id, usuario_id, producto_id');
    expect(reembolsar).not.toHaveBeenCalled();
  });

  it('un fallo en una tabla no impide limpiar las demás', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE analisis_mercado')) throw new Error('timeout');
      return sql.includes('UPDATE analisis_ventas') ? [[{ id: 'v-1', usuario_id: 'u-9', producto_id: 'p-9' }], 1] : [[], 0];
    });

    expect(await limpiarAnalisisColgados(15)).toBe(1);
    expect(reembolsar).toHaveBeenCalledWith({ referenciaId: 'v-1' });
  });
});
