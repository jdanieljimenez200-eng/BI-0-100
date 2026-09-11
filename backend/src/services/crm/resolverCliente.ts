import { EntityManager } from 'typeorm';
import { Cliente } from '../../models/Cliente';

export interface DatosClienteNuevo {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
}

export interface ArgsResolverCliente {
  usuarioId: string;
  trabajadorId: string | null;
  negocioId?: string | null;
  productoId?: string | null;
  /** Cliente ya existente en el CRM. */
  clienteId?: string | null;
  /** Alta rápida desde el propio cobro. */
  crearCliente?: DatosClienteNuevo | null;
  /** Nombre escrito a mano cuando no se vincula a ningún cliente del CRM. */
  nombreLibre?: string | null;
  telefonoLibre?: string | null;
}

export type ResultadoCliente =
  | { ok: true; cliente_id: string | null; cliente_nombre: string | null; cliente_telefono: string | null }
  | { ok: false; status: number; error: string };

/**
 * Resuelve a qué cliente del CRM pertenece una venta o cotización.
 *
 * Tres caminos, en este orden:
 *   1. `clienteId` — se valida que sea del usuario y se toma su nombre/teléfono.
 *   2. `crearCliente` — alta rápida sin salir del cobro.
 *   3. Texto libre — comportamiento anterior, sin vínculo al CRM.
 *
 * Siempre devuelve además el nombre y el teléfono para guardarlos como snapshot
 * en la venta: la FK sirve para agregar, el snapshot para que el ticket siga
 * siendo legible si el cliente se borra después.
 *
 * Se ejecuta DENTRO de la transacción de la venta a propósito. La validación de
 * pertenencia tiene que ocurrir con el mismo manager: comprobarla fuera dejaría
 * una ventana para asociar la venta a un cliente ajeno (IDOR).
 */
export async function resolverClienteParaVenta(
  manager: EntityManager,
  args: ArgsResolverCliente,
): Promise<ResultadoCliente> {
  const { usuarioId, trabajadorId, negocioId, productoId, clienteId, crearCliente } = args;

  if (clienteId && crearCliente) {
    return { ok: false, status: 400, error: 'Envía cliente_id o crear_cliente, no ambos' };
  }

  // ── 1. Cliente existente ────────────────────────────────────────────────
  if (clienteId) {
    const cliente = await manager.findOne(Cliente, {
      where: { id: clienteId, usuario_id: usuarioId },
    });
    if (!cliente) {
      return { ok: false, status: 404, error: 'Cliente no encontrado' };
    }

    // El CRM se mantiene solo: comprar es la señal de contacto más fuerte que
    // existe, y un lead que ya pagó dejó de ser un lead.
    cliente.fecha_ultimo_contacto = new Date().toISOString().slice(0, 10);
    if (cliente.estado === 'lead' || cliente.estado === 'inactivo') {
      cliente.estado = 'cliente';
    }
    await manager.save(Cliente, cliente);

    return {
      ok: true,
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      cliente_telefono: cliente.telefono ?? null,
    };
  }

  // ── 2. Alta rápida ──────────────────────────────────────────────────────
  if (crearCliente) {
    const nombre = crearCliente.nombre?.trim();
    if (!nombre) {
      return { ok: false, status: 400, error: 'El nombre del cliente es requerido' };
    }

    const nuevo = manager.create(Cliente, {
      usuario_id:            usuarioId,
      creado_por_id:         trabajadorId,
      negocio_id:            negocioId ?? null,
      producto_id:           productoId ?? null,
      nombre,
      telefono:              crearCliente.telefono?.trim() || null,
      email:                 crearCliente.email?.trim() || null,
      tipo_contacto:         'cliente',
      estado:                'cliente',
      fecha_ultimo_contacto: new Date().toISOString().slice(0, 10),
    });
    await manager.save(Cliente, nuevo);

    return {
      ok: true,
      cliente_id: nuevo.id,
      cliente_nombre: nuevo.nombre,
      cliente_telefono: nuevo.telefono ?? null,
    };
  }

  // ── 3. Texto libre / público general ────────────────────────────────────
  return {
    ok: true,
    cliente_id: null,
    cliente_nombre: args.nombreLibre?.trim() || null,
    cliente_telefono: args.telefonoLibre?.trim() || null,
  };
}
