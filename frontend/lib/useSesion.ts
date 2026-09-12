'use client';

import { useSyncExternalStore } from 'react';

/** Nadie se suscribe: el token no cambia sin recargar la página. */
const sinSuscripcion = () => () => {};
const enCliente = () => Boolean(localStorage.getItem('accessToken'));
/** En el servidor no hay localStorage: se asume visitante anónimo. */
const enServidor = () => false;

/**
 * ¿Hay una sesión abierta en este navegador?
 *
 * Se lee con `useSyncExternalStore` y no con un `useEffect` que llame a
 * `setState`: el efecto provocaría un render en cascada en cada página que
 * pregunte por la sesión, y React avisa de ello. Este hook devuelve `false`
 * durante el render del servidor y el valor real en el cliente, sin desajuste de
 * hidratación.
 *
 * Solo sirve para decidir QUÉ ENSEÑAR —un formulario o una invitación a entrar—.
 * No autoriza nada: quien decide si puedes leer o escribir es el backend.
 */
export function useHaySesion(): boolean {
  return useSyncExternalStore(sinSuscripcion, enCliente, enServidor);
}
