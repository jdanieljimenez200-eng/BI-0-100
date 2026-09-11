/**
 * Interruptor de la red de expertos.
 *
 * La red todavía no existe: no hay tablas, ni rutas, ni un solo experto real.
 * Lo que había en pantalla era una maqueta con despachos inventados
 * ("García & Asociados", "Lic. Ana Morales") que se mostraban con insignia de
 * verificado, rating 4.9 y "63 reseñas", sin ningún aviso de que eran ejemplos.
 * Cualquiera podía intentar contratar a alguien que no existe creyendo que la
 * plataforma lo había comprobado.
 *
 * Mientras no haya expertos aprobados de verdad, la sección no se muestra. El
 * diseño se conserva íntegro detrás de este interruptor.
 *
 * Para encenderlo: `NEXT_PUBLIC_NETWORK_ENABLED=true` en el entorno.
 */
export const NETWORK_ENABLED = process.env.NEXT_PUBLIC_NETWORK_ENABLED === 'true';

/**
 * Los datos de ejemplo solo pueden usarse en desarrollo y con la red encendida.
 *
 * En producción nunca: un catálogo inventado es peor que no enseñar nada.
 */
export const PUEDE_USAR_EJEMPLOS =
  NETWORK_ENABLED && process.env.NODE_ENV !== 'production';
