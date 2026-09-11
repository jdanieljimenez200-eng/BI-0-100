# 🔐 Credenciales de Acceso — BI 0 A 100

## ✅ Cuenta Auditoría & Prueba

| Campo | Valor |
|-------|-------|
| **Email** | `jorge@bi0a100.com` |
| **Contraseña** | `<CONFIGURADA_EN_SEEDS>` (establecida vía `npm run seed:demo`) |
| **Plan** | Free |
| **Productos** | 29 |
| **Análisis Completados** | 120+ |
| **Status** | ✅ FUNCIONAL |

---

## 📊 Datos de la Cuenta Jorge

### Análisis Completados por Módulo

| Módulo | Cantidad | Estado |
|--------|----------|--------|
| Mercado | 20 | ✅ Completado |
| Marketing | 20 | ✅ Completado |
| Finanzas | 20 | ✅ Completado |
| Proveedores | 20 | ✅ Completado |
| Legal | 20 | ✅ Completado |
| Brief | 1 | ✅ Completado |
| **TOTAL** | **121** | **✅ LISTO** |

### Producto Principal (Para Demo)

- **Nombre**: Pizza Margherita
- **ID**: 1
- **Estado**: Todos los análisis completados
- **Disponible en**: Dashboard

---

## 🔐 Otras Cuentas de Prueba

| Email | Password | Plan | Productos | Análisis |
|-------|----------|------|-----------|----------|
| test@example.com | `<CONFIGURADA_EN_SEEDS>` | free | 1 | ✅ |
| carlos@bi0a100.com | `<CONFIGURADA_EN_SEEDS>` | free | 1 | ✅ |
| demoteam@bi0a100.com | `<CONFIGURADA_EN_SEEDS>` | pro | 8 | ✅ |
| admin@bi0a100.com | `<CONFIGURADA_EN_SEEDS>` | admin | 1 | ✅ |

---

## 🌐 URLs de Acceso

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| **Frontend** | http://localhost:3000 | Email + Password configurado |
| **Backend API** | http://localhost:3001 | JWT (obtenido en login) |
| **Prometheus** | http://localhost:9090 | N/A |
| **Grafana** | http://localhost:3002 | admin / admin |

---

## ✅ Auditoría de Login — Validaciones

### Seguridad Confirmada

- ✅ JWT con expiración (15 min access, 7d refresh)
- ✅ Refresh tokens en cookies httpOnly
- ✅ CORS configurado
- ✅ Contraseñas hasheadas con bcrypt (12 rounds)
- ✅ Rate limiting activo
- ✅ Validación de email y contraseña

### Login Flow Validado

1. POST /api/auth/login
   - Email lowercase
   - Contraseña trimmed
   - Validación bcrypt
   
2. Respuesta exitosa
   - accessToken JWT
   - Refresh token en cookie
   - User data

3. Refresh token flow
   - POST /api/auth/refresh
   - Extrae token de cookie
   - Emite nuevo accessToken

---

## 🚀 Próximos Pasos

1. Abre http://localhost:3000
2. Ingresa la cuenta de demo sembrada localmente (`jorge@bi0a100.com` o `demo@bi0a100.com`) y su contraseña establecida
3. Verás el dashboard con los análisis completados
4. Haz clic en "Pizza Margherita" para ver los análisis (Mercado, Marketing, Finanzas, Proveedores, Legal, Brief)

---

## ⚠️ Notas de Seguridad

- Nunca almacenes contraseñas en texto plano en la documentación ni en el repositorio de control de versiones.
- Las cuentas de demo locales se generan con `npm run seed:demo`.
- En producción, utilizar contraseñas seguras y gestión estricta de variables de entorno.
- El token JWT expira en 15 minutos (refresh automático en frontend).

---

**Auditoría completada**: ✅ 2026-08-17  
**Estado**: TODO LISTO PARA DEMOSTRACIÓN