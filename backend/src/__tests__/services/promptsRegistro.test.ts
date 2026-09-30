import { conSeguimientoIA } from '../../utils/seguimientoIA';
import {
  _reiniciarCachePrompts,
  invalidarCachePrompts,
  resolverPrompt,
  versionesAAnclar,
} from '../../services/ia/registroPrompts';
import { componerSistema, PRECEDENCIA } from '../../services/ia/componerSistema';
import { LEGAL_MODO } from '../../services/ia/prompts/legal.modo';
import { AppDataSource } from '../../config/database';

jest.mock('../../config/database', () => {
  const repo = { findOne: jest.fn(), findOneBy: jest.fn() };
  return { AppDataSource: { isInitialized: true, getRepository: () => repo, __repo: repo } };
});

const repo = (AppDataSource as unknown as { __repo: { findOne: jest.Mock; findOneBy: jest.Mock } }).__repo;

function fila(parcial: Record<string, unknown> = {}) {
  return {
    id: 'v-publicada',
    clave: 'legal.modo',
    version: 3,
    estado: 'publicado',
    contenido: 'Modo publicado de prueba',
    secciones_extra: [],
    secciones_ocultas: [],
    ...parcial,
  };
}

beforeEach(() => {
  _reiniciarCachePrompts();
  repo.findOne.mockReset();
  repo.findOneBy.mockReset();
});

/**
 * De dónde sale el prompt de cada llamada. Lo importante no es que «devuelva
 * texto», sino tres garantías: la IA nunca se queda sin prompt, un análisis
 * anclado no cambia aunque se publique otra versión, y un borrador (que se sigue
 * editando) nunca se sirve desde caché.
 */
describe('registro de prompts', () => {
  it('sin versión publicada usa el texto del repositorio', async () => {
    repo.findOne.mockResolvedValue(null);
    const v = await resolverPrompt('legal.modo');
    expect(v).toMatchObject({ origen: 'repositorio', id: null, version: 0, contenido: LEGAL_MODO });
  });

  it('usa la versión publicada y la cachea hasta que se invalida', async () => {
    repo.findOne.mockResolvedValue(fila());
    expect((await resolverPrompt('legal.modo')).origen).toBe('publicado');
    await resolverPrompt('legal.modo');
    expect(repo.findOne).toHaveBeenCalledTimes(1);

    invalidarCachePrompts('legal.modo');
    await resolverPrompt('legal.modo');
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('una versión anclada gana a la publicada', async () => {
    repo.findOneBy.mockResolvedValue(fila({ id: 'v2', version: 2, estado: 'archivado', contenido: 'Versión 2' }));
    const v = await resolverPrompt('legal.modo', 'v2');
    expect(v).toMatchObject({ origen: 'anclado', version: 2, contenido: 'Versión 2' });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('anclar `null` fija el repositorio aunque luego se publique otra versión', async () => {
    repo.findOne.mockResolvedValue(fila());
    const v = await resolverPrompt('legal.modo', null);
    expect(v.origen).toBe('repositorio');
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('un borrador nunca se sirve desde caché', async () => {
    repo.findOneBy.mockResolvedValue(fila({ id: 'b1', estado: 'borrador' }));
    await resolverPrompt('legal.modo', 'b1');
    await resolverPrompt('legal.modo', 'b1');
    expect(repo.findOneBy).toHaveBeenCalledTimes(2);
  });

  it('una versión anclada de otra clave se ignora', async () => {
    repo.findOneBy.mockResolvedValue(fila({ id: 'x', clave: 'legal.pais.CO' }));
    repo.findOne.mockResolvedValue(null);
    expect((await resolverPrompt('legal.modo', 'x')).origen).toBe('repositorio');
  });

  it('si la base falla, se usa el repositorio y no se cachea el error', async () => {
    repo.findOne.mockRejectedValueOnce(new Error('sin conexión')).mockResolvedValueOnce(fila());
    expect((await resolverPrompt('legal.modo')).origen).toBe('repositorio');
    expect((await resolverPrompt('legal.modo')).origen).toBe('publicado');
  });

  it('un país sin ficha queda como ausente', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await resolverPrompt('legal.pais.GT')).toMatchObject({ origen: 'ausente', contenido: null });
  });

  it('ancla la publicada de cada clave, o el repositorio', async () => {
    repo.findOne.mockImplementation(({ where }: { where: { clave: string } }) =>
      Promise.resolve(where.clave === 'legal.modo' ? fila() : null)
    );
    expect(await versionesAAnclar(['legal.modo', 'legal.pais.CO'])).toEqual({
      'legal.modo': 'v-publicada',
      'legal.pais.CO': null,
    });
  });
});

describe('componerSistema', () => {
  const extra = { slug: 'riesgos_temporada', titulo: 'Riesgos de temporada', instrucciones: 'Analiza la estacionalidad del giro.' };

  it('modo editable primero, ficha después y contrato del código al final', async () => {
    repo.findOneBy.mockResolvedValue(fila({ id: 'v2', version: 2, estado: 'archivado', secciones_extra: [extra] }));
    repo.findOne.mockResolvedValue(null);
    const contrato = jest.fn((secciones: unknown[]) => `CONTRATO con ${secciones.length} extra`);

    const s = await conSeguimientoIA(
      () =>
        componerSistema({
          modo: 'legal.modo',
          contexto: [{ clave: 'legal.pais.CO', siAusente: 'SIN FICHA' }],
          contrato,
        }),
      { versionesPrompt: { 'legal.modo': 'v2' } }
    );

    expect(s.system).toHaveLength(3);
    expect(s.system[0].text).toContain('Modo publicado de prueba');
    expect(s.system[0].text).toContain('[riesgos_temporada] Riesgos de temporada');
    expect(s.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(s.system[1].text).toContain('FICHA DE PAÍS — Colombia');
    expect(s.system[2].text.startsWith(PRECEDENCIA)).toBe(true);
    expect(s.system[2].text).toContain('CONTRATO con 1 extra');
    expect(s.system[2].cache_control).toEqual({ type: 'ephemeral' });
    expect(contrato).toHaveBeenCalledWith([extra]);
    expect(s.versiones['legal.modo']).toEqual({ id: 'v2', version: 2, origen: 'anclado' });
    expect(s.versiones['legal.pais.CO'].origen).toBe('repositorio');
  });

  it('un país sin ficha usa el texto alterno y lo informa', async () => {
    repo.findOne.mockResolvedValue(null);
    const s = await componerSistema({
      modo: 'legal.modo',
      contexto: [{ clave: 'legal.pais.GT', siAusente: 'SIN FICHA GT' }],
      contrato: 'CONTRATO',
    });
    expect(s.system[1].text).toBe('SIN FICHA GT');
    expect(s.ausentes).toEqual(['legal.pais.GT']);
  });
});
