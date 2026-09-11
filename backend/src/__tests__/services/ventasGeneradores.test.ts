import {
  generarTipsMock,
  generarHistoriaMock,
  generarPorqueFallanMock,
  generarRebatidasMock,
  generarFollowUpsMock,
  generarPalabrasClaveAdsMock,
  evaluarGuionConVideo,
  evaluarGuionMock,
  analizarCompetidorFoto,
} from '../../services/ventas/ventasService';
import type { VentasAnalisisInput, PerfilClienteIdeal } from '../../services/ventas/types';

const inputBase: VentasAnalisisInput = {
  tipo_venta: 'B2C_directo',
  canal_principal: 'marketplace',
  ticket_promedio: 350,
  tamano_equipo: '1_2_personas',
  objetivo_ventas: 'Duplicar ventas en 6 meses',
  pais: 'MX',
  nombre_producto: 'Lámpara artesanal',
  categoria: 'decoración',
  precio: 400,
};

describe('ventasService — generadores deterministas (mock sin IA)', () => {
  describe('generarTipsMock', () => {
    it('devuelve tips con la estructura completa', () => {
      const tips = generarTipsMock(inputBase);
      expect(tips.length).toBeGreaterThanOrEqual(3);
      for (const tip of tips) {
        expect(tip.titulo.length).toBeGreaterThan(0);
        expect(tip.descripcion.length).toBeGreaterThan(0);
        expect(tip.ejemplo_practico.length).toBeGreaterThan(0);
        expect(tip.error_comun.length).toBeGreaterThan(0);
      }
    });

    it('usa el ticket promedio del input en los ejemplos', () => {
      const tips = generarTipsMock(inputBase);
      const conNumero = tips.some((t) => t.ejemplo_practico.includes('350'));
      expect(conNumero).toBe(true);
    });
  });

  describe('generarHistoriaMock', () => {
    it('rota por fecha: días distintos producen historias distintas', () => {
      const a = generarHistoriaMock(inputBase, '2026-08-25');
      const b = generarHistoriaMock(inputBase, '2026-08-26');
      // Con semilla de fecha distinta cambia al menos el personaje o las métricas
      const diferente =
        a.nombre !== b.nombre ||
        a.como_lo_logro !== b.como_lo_logro ||
        a.metricas !== b.metricas;
      expect(diferente).toBe(true);
    });

    it('mismo día produce la misma historia (determinista para caché)', () => {
      const a = generarHistoriaMock(inputBase, '2026-08-25');
      const b = generarHistoriaMock(inputBase, '2026-08-25');
      expect(a.nombre).toBe(b.nombre);
      expect(a.fecha).toBe('2026-08-25');
    });

    it('incluye todos los campos de la noticia diaria', () => {
      const h = generarHistoriaMock(inputBase, '2026-08-25');
      expect(h.nombre).toBeTruthy();
      expect(h.industria).toBe('decoración');
      expect(h.como_lo_logro).toBeTruthy();
      expect(h.mentalidad_clave).toBeTruthy();
      expect(h.obstaculo_principal).toBeTruthy();
      expect(h.estrategia_marketing).toBeTruthy();
      expect(h.metricas).toContain('$');
      expect(h.leccion_aplicable).toBeTruthy();
    });
  });

  describe('generarPorqueFallanMock', () => {
    it('estructura completa con razones ordenadas y señales', () => {
      const pf = generarPorqueFallanMock(inputBase);
      expect(pf.patron_comun.length).toBeGreaterThan(20);
      expect(pf.razones.length).toBeGreaterThanOrEqual(3);
      for (const r of pf.razones) {
        expect(r.titulo).toBeTruthy();
        expect(r.descripcion).toBeTruthy();
        expect(r.senales_alerta.length).toBeGreaterThanOrEqual(2);
        expect(r.como_evitarlo).toBeTruthy();
      }
    });

    it('personaliza el patrón con la categoría del producto', () => {
      const pf = generarPorqueFallanMock({ ...inputBase, categoria: 'cafetería' });
      expect(pf.patron_comun).toContain('cafetería');
    });
  });

  describe('generarRebatidasMock', () => {
    const perfilBase: PerfilClienteIdeal = {
      demograficos: { edad_rango: '25-40', genero_predominante: 'Mixto', nivel_socioeconomico: 'C+', ubicacion_tipica: 'Urbana' },
      psicografia: {
        miedos_principales: ['Perder dinero', 'Que no funcione'],
        deseos_clave: ['Ahorrar tiempo', 'Sentirse seguro'],
        objeciones_tipicas: ['Es muy caro', 'No tengo tiempo de aprenderlo'],
        valores_compra: ['Confianza', 'Rapidez'],
      },
      canales_preferidos: ['redes_sociales'],
      disparadores_compra: ['Recomendación'],
      frenos_compra: ['Precio'],
      lenguaje_tipico: 'quiero algo que funcione ya',
      queries_tipicas: ['mejor opción para X'],
      score_afinidad: 75,
      score_razon: 'Buen match',
    };

    it('devuelve una rebatida por cada objeción del ICP', () => {
      const rebatidas = generarRebatidasMock(perfilBase);
      expect(rebatidas.length).toBe(perfilBase.psicografia.objeciones_tipicas.length);
      for (const r of rebatidas) {
        expect(r.objecion).toBeTruthy();
        expect(r.rebatida.length).toBeGreaterThan(10);
      }
    });

    it('conserva el texto exacto de cada objeción', () => {
      const rebatidas = generarRebatidasMock(perfilBase);
      expect(rebatidas.map((r) => r.objecion)).toEqual(perfilBase.psicografia.objeciones_tipicas);
    });
  });

  describe('generarFollowUpsMock', () => {
    it('devuelve 3 mensajes en 3 momentos distintos', () => {
      const mensajes = generarFollowUpsMock(inputBase);
      expect(mensajes.length).toBe(3);
      const momentos = mensajes.map((m) => m.momento);
      expect(new Set(momentos).size).toBe(3);
      for (const m of mensajes) {
        expect(m.mensaje.length).toBeGreaterThan(10);
      }
    });

    it('menciona el nombre del producto en los mensajes', () => {
      const mensajes = generarFollowUpsMock({ ...inputBase, nombre_producto: 'Lámpara artesanal' });
      expect(mensajes.some((m) => m.mensaje.includes('Lámpara artesanal'))).toBe(true);
    });
  });

  describe('generarPalabrasClaveAdsMock', () => {
    const perfilBase: PerfilClienteIdeal = {
      demograficos: { edad_rango: '25-40', genero_predominante: 'Mixto', nivel_socioeconomico: 'C+', ubicacion_tipica: 'Urbana' },
      psicografia: {
        miedos_principales: ['Perder dinero', 'Que no funcione'],
        deseos_clave: ['Ahorrar tiempo', 'Sentirse seguro'],
        objeciones_tipicas: ['Es muy caro', 'No tengo tiempo de aprenderlo'],
        valores_compra: ['Confianza', 'Rapidez'],
      },
      canales_preferidos: ['redes_sociales', 'recomendaciones'],
      disparadores_compra: ['Recomendación', 'Descuento por tiempo limitado'],
      frenos_compra: ['Precio'],
      lenguaje_tipico: 'quiero algo que funcione ya',
      queries_tipicas: ['mejor opción para X', 'dónde comprar X barato'],
      score_afinidad: 75,
      score_razon: 'Buen match',
    };

    it('devuelve como máximo 10 keywords de búsqueda y de interés, sin duplicados', () => {
      const palabras = generarPalabrasClaveAdsMock(perfilBase);
      expect(palabras.keywords_busqueda.length).toBeGreaterThan(0);
      expect(palabras.keywords_busqueda.length).toBeLessThanOrEqual(10);
      expect(new Set(palabras.keywords_busqueda).size).toBe(palabras.keywords_busqueda.length);
      expect(palabras.intereses_meta.length).toBeGreaterThan(0);
      expect(palabras.intereses_meta.length).toBeLessThanOrEqual(10);
      expect(new Set(palabras.intereses_meta).size).toBe(palabras.intereses_meta.length);
    });

    it('deriva las keywords de búsqueda de las queries_tipicas del ICP', () => {
      const palabras = generarPalabrasClaveAdsMock(perfilBase);
      expect(palabras.keywords_busqueda).toEqual(expect.arrayContaining(perfilBase.queries_tipicas));
    });

    it('deriva los intereses de Meta de canales, valores y disparadores del ICP', () => {
      const palabras = generarPalabrasClaveAdsMock(perfilBase);
      expect(palabras.intereses_meta).toEqual(
        expect.arrayContaining(['redes_sociales', 'Confianza', 'Recomendación']),
      );
    });
  });

  describe('evaluarGuionConVideo (sin ANTHROPIC_API_KEY)', () => {
    const guion = 'Compra hoy mismo y llévate un descuento especial, escríbenos ahora.';

    it('cae a la evaluación de solo texto y no agrega metricas_visuales', async () => {
      const conVideo = await evaluarGuionConVideo(guion, [{ base64: 'ZmFrZQ==', media_type: 'image/jpeg' }], inputBase);
      const soloTexto = evaluarGuionMock(guion, inputBase);

      expect(conVideo.metricas_visuales).toBeUndefined();
      expect(conVideo.score_general).toBe(soloTexto.score_general);
      expect(conVideo.metricas.length).toBe(soloTexto.metricas.length);
    });

    it('con frames vacíos también cae a solo texto (sin llamar a la API)', async () => {
      const resultado = await evaluarGuionConVideo(guion, [], inputBase);
      expect(resultado.metricas_visuales).toBeUndefined();
    });
  });

  describe('analizarCompetidorFoto (sin ANTHROPIC_API_KEY)', () => {
    it('cae al mock determinista sin romper, aunque no haya cliente configurado', async () => {
      const resultado = await analizarCompetidorFoto(
        'Competidor de prueba',
        { base64: 'ZmFrZQ==', media_type: 'image/png' },
        inputBase,
        { redes_sociales: '@competidor', pagina_web: 'https://competidor.example.com' },
      );

      expect(resultado.nombre).toBe('Competidor de prueba');
      expect(resultado.puntos_fuertes.length).toBeGreaterThan(0);
      expect(resultado.puntos_debiles.length).toBeGreaterThan(0);
    });
  });
});
