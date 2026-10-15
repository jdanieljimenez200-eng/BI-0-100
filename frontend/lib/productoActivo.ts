'use client';

import { useCallback, useEffect, useState } from 'react';
import api from './api';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ProductoActivo {
  id: string;
  nombre: string;
  pais: string;
  negocio_id: string | null;
  negocio_nombre?: string | null;
  /**
   * false = excede el límite de productos del plan (p. ej. tras un downgrade):
   * visible pero NO operable hasta subir de plan o archivar otros. Lo calcula
   * el backend (fuente de verdad). undefined se trata como operable.
   */
  dentro_del_plan?: boolean;
  /**
   * false = su régimen no traslada el impuesto al consumo (monotributo, Nuevo
   * RUS, no responsable de IVA): el POS no lo desglosa y una cotización nueva
   * arranca sin impuesto. Lo cambia el dueño en el Punto de Venta.
   */
  cobra_impuesto_consumo?: boolean;
}

// Clave única y compartida por TODAS las herramientas: al elegir el
// producto/servicio en una herramienta, el resto lo recuerda. Coherente con
// "solo un objeto o servicio según el plan y lo comprado".
const STORAGE_KEY = 'producto_activo_id';

function leerGuardado(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function guardar(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible (modo privado) — se ignora */
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseProductoActivo {
  productos: ProductoActivo[];
  loading: boolean;
  error: boolean;
  /** id del producto activo; '' si aún no se elige o no hay productos */
  activoId: string;
  /** objeto del producto activo (o null) */
  activo: ProductoActivo | null;
  /** fija el producto activo y lo persiste */
  setActivoId: (id: string) => void;
  /** vuelve a mostrar el menú (olvida la selección) */
  limpiarSeleccion: () => void;
  /** recarga la lista de productos desde el backend */
  recargar: () => Promise<void>;
}

/**
 * Carga los productos de la cuenta y gestiona cuál está ACTIVO.
 * Regla de autoselección:
 *  - Si hay exactamente 1 producto, se elige solo (sin menú).
 *  - Si el id guardado ya no existe (producto borrado), se descarta.
 */
export function useProductoActivo(): UseProductoActivo {
  const [productos, setProductos] = useState<ProductoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activoId, setActivoIdState] = useState<string>('');

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get<ProductoActivo[]>('/productos');
      const lista = Array.isArray(data) ? data : [];
      setProductos(lista);

      // Solo los productos dentro del plan pueden quedar activos. Tras un
      // downgrade, un id guardado que ahora excede el plan se descarta.
      const operables = lista.filter((p) => p.dentro_del_plan !== false);

      setActivoIdState((prev) => {
        const guardado = prev || leerGuardado();
        const existeGuardado = guardado && operables.some((p) => p.id === guardado);
        // Si hay un producto guardado válido se usa; si no, se auto-selecciona el primer operable
        const siguiente = existeGuardado
          ? guardado
          : operables.length > 0
            ? operables[0].id
            : '';
        guardar(siguiente);
        return siguiente;
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const setActivoId = useCallback((id: string) => {
    guardar(id);
    setActivoIdState(id);
  }, []);

  const limpiarSeleccion = useCallback(() => {
    guardar('');
    setActivoIdState('');
  }, []);

  // Nunca exponer como activo un producto fuera del plan (defensa extra a la
  // autoselección): evita que una herramienta opere sobre un excedente.
  const activo =
    productos.find((p) => p.id === activoId && p.dentro_del_plan !== false) ?? null;

  return {
    productos,
    loading,
    error,
    activoId,
    activo,
    setActivoId,
    limpiarSeleccion,
    recargar,
  };
}