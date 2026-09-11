import { describe, it, expect } from '@jest/globals';
import { construirRegistroAuditoria } from '../../services/billing/auditoriaHerramientaService';

describe('auditoriaHerramientaService', () => {
  it('construirRegistroAuditoria genera registro con campos correctos', () => {
    const usuario_id = '550e8400-e29b-41d4-a716-446655440000';
    const herramienta_key = 'pos';
    const accion = 'activada' as const;
    const plan_snapshot = 'pro';
    const razon = 'usuario_manual';

    const registro = construirRegistroAuditoria(
      usuario_id,
      herramienta_key,
      accion,
      plan_snapshot,
      razon,
    );

    expect(registro.usuario_id).toBe(usuario_id);
    expect(registro.herramienta_key).toBe(herramienta_key);
    expect(registro.accion).toBe(accion);
    expect(registro.plan_snapshot).toBe(plan_snapshot);
    expect(registro.razon).toBe(razon);
  });

  it('construirRegistroAuditoria sin razon establece razon como null', () => {
    const registro = construirRegistroAuditoria(
      'user-id',
      'pos',
      'desactivada',
      'pro_plus',
    );

    expect(registro.razon).toBeNull();
  });

  it('Acepta diferentes acciones', () => {
    const acciones: Array<'activada' | 'desactivada' | 'seleccion_cambiada'> = [
      'activada',
      'desactivada',
      'seleccion_cambiada',
    ];

    acciones.forEach((accion) => {
      const registro = construirRegistroAuditoria(
        'user-id',
        'pos',
        accion,
        'freemium',
      );
      expect(registro.accion).toBe(accion);
    });
  });
});