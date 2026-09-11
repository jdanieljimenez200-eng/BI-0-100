/**
 * Configuración centralizada de URLs del cliente Frontend.
 * Evita divergencias y duplicación en múltiples módulos.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Origen del backend sin el sufijo /api (para recursos estáticos como /uploads en dev). */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
