/**
 * Paridad de los archivos gemelos backend ↔ frontend.
 *
 * Varias reglas viven dos veces: en el servidor (lo que se guarda) y en el
 * navegador (lo que se anuncia antes de guardar). Si se desalinean, la pantalla
 * dice una cosa y la base otra: así nació «las comisiones cambian» (el POS
 * anunciaba una comisión 100 veces menor que la que se registraba). Esta prueba
 * corre los dos lados con los mismos datos y exige el mismo resultado.
 *
 * Quedan fuera las fechas: `hoyEnZona(zona)` del servidor y `hoyLocal()` del
 * navegador tienen firmas distintas a propósito (la zona del navegador es la del
 * propio navegador).
 */
import * as dineroBack from '../../utils/dinero';
import * as dineroFront from '../../../../frontend/lib/dinero';
import { calcularDesgloseComision as desgloseBack, calcularPrecioObjetivo as objetivoBack, PRESETS_CANALES_DEFAULT } from '../../services/contabilidad/comisionesService';
import { calcularDesgloseComision as desgloseFront, calcularPrecioObjetivo as objetivoFront } from '../../../../frontend/lib/comisiones';
import { getTaxConfig as taxBack, impuestoIncluido } from '../../utils/taxConfig';
import { getTaxConfig as taxFront } from '../../../../frontend/lib/taxConfig';
import { telefonoWhatsApp as waBack } from '../../utils/whatsapp';
import { telefonoWhatsApp as waFront } from '../../../../frontend/lib/whatsapp';
import { normalizarEstatus as estatusBack } from '../../utils/estatusProyecto';
import { normalizarEstatus as estatusFront } from '../../../../frontend/lib/estatusProyecto';
import { SECTORES_REGULADOS as sectoresBack } from '../../services/ia/perfilNegocio';
import { SECTORES_REGULADOS as sectoresFront } from '../../../../frontend/lib/perfilNegocio';
import { DOCUMENTOS_LEGALES as documentosBack } from '../../config/documentosLegales';
import { DOCUMENTOS_LEGALES as documentosFront } from '../../../../frontend/lib/documentosLegales';

const PAISES = ['MX', 'BR', 'CO', 'AR', 'CL', 'PE', 'EC', 'GT', 'PA', 'CR', 'HN', 'SV', 'NI', 'BZ', 'VE', 'BO', 'UY', 'PY'];

describe('gemelos backend ↔ frontend', () => {
  it('dinero: r2 y r3 redondean igual (incluidos los casos de coma flotante)', () => {
    const valores = [1.005, 2.675, 0.1 + 0.2, 1.255, -1.005, 87.125, 10.345, 1234567.895, 0, 0.0049, 99.995, 3.3333];
    for (const v of valores) {
      expect(dineroFront.r2(v)).toBe(dineroBack.r2(v));
      expect(dineroFront.r3(v)).toBe(dineroBack.r3(v));
    }
  });

  it('comisiones: el desglose del POS es el que registra el servidor', () => {
    const canales = [
      ...PRESETS_CANALES_DEFAULT,
      { institucion: 'Sin IVA', comision_porcentaje: 0.03, comision_fija: 2.5, aplica_iva_comision: false, retencion_isr_porcentaje: 0, retencion_iva_porcentaje: 0 },
    ];
    const montos = [0, 1, 99.99, 116, 1160, 2475.5];
    for (const canal of canales) {
      for (const pais of ['MX', 'CO', 'AR', 'PE']) {
        const tasa = taxBack(pais).consumo.tasa;
        for (const monto of montos) {
          for (const dentro of [0, impuestoIncluido(monto, tasa)]) {
            const b = desgloseBack(monto, canal, tasa, dentro);
            const f = desgloseFront(monto, canal, tasa, dentro);
            expect(f).toEqual({
              comisionBase: b.comisionBase,
              comisionIva: b.comisionIva,
              retencionIsr: b.retencionIsr,
              retencionIva: b.retencionIva,
              totalDeducciones: b.totalDeducciones,
              montoNeto: b.montoNeto,
            });
          }
        }
      }
    }
  });

  it('comisiones: el simulador sugiere el mismo precio', () => {
    for (const canal of PRESETS_CANALES_DEFAULT) {
      for (const incluye of [false, true]) {
        for (const neto of [100, 500, 1000]) {
          const b = objetivoBack(neto, canal, 0.16, incluye);
          const f = objetivoFront(neto, canal, 0.16, incluye);
          expect(f.precioSugerido).toBe(b.precioSugerido);
          expect(f.desglose.montoNeto).toBe(b.desglose.montoNeto);
        }
      }
    }
  });

  it('impuestos por país: misma moneda, nombre y tasa en los 18 países', () => {
    for (const pais of PAISES) {
      const b = taxBack(pais);
      const f = taxFront(pais);
      expect({ pais, moneda: f.moneda, locale: f.locale, nombre: f.consumo.nombre, tasa: f.consumo.tasa })
        .toEqual({ pais, moneda: b.moneda, locale: b.locale, nombre: b.consumo.nombre, tasa: b.consumo.tasa });
    }
    // El nombre del impuesto cabe en cotizaciones.impuesto_nombre (varchar 20):
    // «ICMS + ISS + PIS/COFINS» (23) hacía que una cotización en Brasil respondiera 400.
    for (const pais of PAISES) expect(taxFront(pais).consumo.nombre.length).toBeLessThanOrEqual(20);
    // País desconocido: los dos caen al mismo respaldo.
    expect(taxFront('ZZ').moneda).toBe(taxBack('ZZ').moneda);
  });

  it('WhatsApp: el mismo número sale con la misma lada', () => {
    const telefonos = ['3312345678', '33 1234 5678', '+52 33 1234 5678', '0052 33 1234 5678', '523312345678', '5213312345678',
      '3001234567', '1123456789', '987654321', '0987654321', '', '12', null];
    for (const pais of [...PAISES, null, 'zz']) {
      for (const tel of telefonos) {
        expect(waFront(tel, pais)).toBe(waBack(tel, pais));
      }
    }
  });

  it('idea o negocio en marcha: los mismos textos se leen igual', () => {
    const valores = ['negocio_en_marcha', 'Negocio en Marcha', 'en_operacion', 'Operando', 'nueva_idea', 'Nueva idea', 'idea',
      'en_planificacion', 'Planificación', '', 'otra cosa', null, 3];
    for (const v of valores) expect(estatusFront(v)).toBe(estatusBack(v));
  });

  it('perfil del negocio: los mismos sectores regulados', () => {
    // El frontend los lleva con su etiqueta ({ value, label }); el backend, solo el valor.
    expect(sectoresFront.map((s) => s.value)).toEqual([...sectoresBack]);
  });

  it('documentos legales: el registro muestra la versión que el servidor guarda como aceptada', () => {
    // Si se desalinean, el servidor rechaza (409) todas las altas.
    expect(documentosFront).toEqual(documentosBack);
  });
});
