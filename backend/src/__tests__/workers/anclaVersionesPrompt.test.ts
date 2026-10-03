import type { Job } from 'bullmq';
import { anclarVersionesPrompt } from '../../workers/analysisWorker';
import { versionesAAnclar } from '../../services/ia/registroPrompts';

jest.mock('../../services/ia/registroPrompts', () => ({
  versionesAAnclar: jest.fn(),
}));
jest.mock('../../config/database', () => ({
  AppDataSource: {
    isInitialized: true,
    getRepository: () => ({ findOne: jest.fn().mockResolvedValue({ id: 'p1', pais: 'CO' }) }),
  },
}));

const mockAnclar = versionesAAnclar as jest.Mock;

function trabajo(data: Record<string, unknown>) {
  return { id: 'j1', data, updateData: jest.fn().mockResolvedValue(undefined) } as unknown as Job & {
    updateData: jest.Mock;
  };
}

beforeEach(() => mockAnclar.mockReset());

/**
 * Publicar una versión de prompt no debe cambiar un análisis que ya empezó, ni
 * sus reintentos: las versiones se fijan una vez y viajan dentro del trabajo.
 */
describe('anclaje de versiones de prompt en el worker', () => {
  it('en el primer intento resuelve las del módulo y el país, y las guarda en el trabajo', async () => {
    mockAnclar.mockResolvedValue({ 'legal.modo': 'v3', 'legal.pais.CO': null });
    const job = trabajo({ moduleName: 'legal', productoId: 'p1', analisisId: 'a1', usuarioId: 'u1' });

    const versiones = await anclarVersionesPrompt(job);

    expect(mockAnclar).toHaveBeenCalledWith(['legal.modo', 'legal.pais.CO']);
    expect(versiones).toEqual({ 'legal.modo': 'v3', 'legal.pais.CO': null });
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ versionesPrompt: versiones }));
  });

  it('un reintento reutiliza las ya ancladas', async () => {
    const job = trabajo({ moduleName: 'legal', productoId: 'p1', versionesPrompt: { 'legal.modo': 'v3' } });
    expect(await anclarVersionesPrompt(job)).toEqual({ 'legal.modo': 'v3' });
    expect(mockAnclar).not.toHaveBeenCalled();
    expect(job.updateData).not.toHaveBeenCalled();
  });

  it('Mercado ancla su modo (no tiene fichas por país)', async () => {
    mockAnclar.mockResolvedValue({ 'mercado.modo': 'v2' });
    const job = trabajo({ moduleName: 'mercado', productoId: 'p1' });
    expect(await anclarVersionesPrompt(job)).toEqual({ 'mercado.modo': 'v2' });
    expect(mockAnclar).toHaveBeenCalledWith(['mercado.modo']);
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ versionesPrompt: { 'mercado.modo': 'v2' } }));
  });

  it('un módulo sin prompts versionados no ancla nada', async () => {
    const job = trabajo({ moduleName: 'ventas', productoId: 'p1' });
    expect(await anclarVersionesPrompt(job)).toBeUndefined();
    expect(job.updateData).not.toHaveBeenCalled();
  });

  it('si anclar falla, el análisis sigue (sin ancla)', async () => {
    mockAnclar.mockRejectedValue(new Error('redis caído'));
    const job = trabajo({ moduleName: 'legal', productoId: 'p1' });
    await expect(anclarVersionesPrompt(job)).resolves.toBeUndefined();
  });
});
