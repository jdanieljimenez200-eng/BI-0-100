import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '@/lib/config';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token de acceso
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Token del panel de admin (verificación en dos pasos). Solo viaja a /admin/:
  // no hay razón para enviarlo al resto de la API. Vive en sessionStorage para
  // que muera al cerrar la pestaña.
  if (typeof window !== 'undefined' && config.url?.startsWith('/admin/')) {
    const tokenAdmin = sessionStorage.getItem(CLAVE_TOKEN_ADMIN);
    if (tokenAdmin) config.headers['X-Admin-Token'] = tokenAdmin;
  }
  return config;
});

/** Donde se guarda el token del panel de admin (ver `lib/admin.ts`). */
export const CLAVE_TOKEN_ADMIN = 'adminToken';
/** Evento que avisa al panel de que hay que volver a pedir el código. */
export const EVENTO_ADMIN_MFA = 'admin-mfa-requerido';

/**
 * ¿Es un 401 de la verificación en dos pasos, y no de una sesión caducada?
 *
 * Importa porque el interceptor de abajo, ante un 401, renueva la sesión y
 * REINTENTA la petición. Con un código incorrecto, ese reintento contaría dos
 * fallos contra el límite de cinco, y si la renovación fallara cerraría la
 * sesión del admin por haber tecleado mal un código.
 */
function esFalloDeVerificacion(error: { config?: { url?: string }; response?: { data?: { codigo?: string } } }) {
  return (
    error.response?.data?.codigo === 'TOTP_REQUERIDO' || Boolean(error.config?.url?.startsWith('/admin/sesion/'))
  );
}

// El refresh token rota una sola vez en el backend (one-time use, ver
// POST /auth/refresh): si dos peticiones en paralelo reciben 401 y cada una
// dispara su propio refresh, la segunda manda un refreshToken ya consumido
// por la primera y falla, cerrando la sesión aunque la primera sí funcionó.
// Se comparte una única promesa de refresh entre todos los 401 concurrentes.
let refreshEnCurso: Promise<string> | null = null;

function limpiarSesionYRedirigir() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('usuario');
  // Evita un loop de redirect si la petición que falló ocurrió en una página
  // pública o en la propia pantalla de login.
  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login';
  }
}

async function refrescarToken(): Promise<string> {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  if (!refreshToken) throw new Error('No hay refresh token disponible');

  const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;
  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', newAccessToken);
    localStorage.setItem('refreshToken', newRefreshToken);
  }
  return newAccessToken;
}

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // El panel de admin rechazó el token de admin (caducado o cerrado): se borra
    // y se avisa para que el panel vuelva a pedir el código, sin sacar al usuario
    // de su sesión normal.
    if (
      typeof window !== 'undefined' &&
      error.response?.status === 403 &&
      error.response?.data?.codigo === 'ADMIN_MFA_REQUERIDO'
    ) {
      sessionStorage.removeItem(CLAVE_TOKEN_ADMIN);
      window.dispatchEvent(new Event(EVENTO_ADMIN_MFA));
      return Promise.reject(error);
    }

    // Si el error es 401 y no hemos reintentado
    if (error.response?.status === 401 && !originalRequest._retry && !esFalloDeVerificacion(error)) {
      originalRequest._retry = true;

      try {
        if (!refreshEnCurso) {
          refreshEnCurso = refrescarToken().finally(() => {
            refreshEnCurso = null;
          });
        }
        const newAccessToken = await refreshEnCurso;

        // Reintentar la solicitud original
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        limpiarSesionYRedirigir();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;