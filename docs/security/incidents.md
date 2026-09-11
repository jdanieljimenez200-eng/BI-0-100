# Security — Incident Reports

Reportes y resolución de incidentes de seguridad.

## Último Incidente Resuelto

**Fecha**: 2026-08-17  
**Severidad**: 🔴 Crítica  
**Status**: ✅ Resuelto

### Problemas Identificados

1. **JWT Storage** — Tokens en localStorage (vulnerable a XSS)
   - **Fix**: Implementar warnings en documentación, validación de CSP
   - **Status**: ✅ Documentado

2. **Password Reset** — Tokens sin rate limiting
   - **Fix**: Rate limiting + 1 hora TTL
   - **Status**: ✅ Implementado

3. **SQL Injection** — Vectores potenciales
   - **Fix**: TypeORM parameterized queries
   - **Status**: ✅ Verificado

4. **CORS** — Demasiado permisivo
   - **Fix**: Restringir a dominio frontend
   - **Status**: ✅ Configurado

5. **Rate Limiting** — Sin límites en login
   - **Fix**: 5 intentos/15min por IP
   - **Status**: ✅ Implementado

### Recomendaciones Futuras

- [ ] 2FA (Two-Factor Authentication)
- [ ] Penetration testing antes de release
- [ ] Auditoría de seguridad trimestral
- [ ] Monitoreo de anomalías en accesos

---

## Mejores Prácticas

### Gestión de Secrets

- ✅ JWT_SECRET en .env (no en código)
- ✅ DB_PASSWORD en .env
- ✅ STRIPE_SECRET_KEY en env var
- ✅ Nunca loguear secretos

### Password Storage

- ✅ bcrypt con cost factor 10
- ✅ Random salt por password
- ✅ No reversible

### HTTPS

- ✅ Enforced en producción
- ✅ SSL certificates (Let's Encrypt)
- ✅ Redirección 80→443

---

Para más: Lee [authentication.md](authentication.md).