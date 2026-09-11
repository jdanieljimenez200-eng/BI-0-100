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
  return config;
});

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

    // Si el error es 401 y no hemos reintentado
    if (error.response?.status === 401 && !originalRequest._retry) {
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