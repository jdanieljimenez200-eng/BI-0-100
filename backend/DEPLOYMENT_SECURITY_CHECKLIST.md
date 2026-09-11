# 🚀 Checklist de Seguridad para Deploy

## Pre-Deploy (Desarrollo)

- [ ] Ejecutar `npm run typecheck` sin errores
- [ ] Ejecutar `npm test` - Todos los tests pasan
- [ ] Verificar que `express-rate-limit` está en package.json
- [ ] Verificar que Redis está corriendo localmente

## Antes de Enviar a Producción

### Variables de Entorno

- [ ] JWT_SECRET configurado (mínimo 32 caracteres, único por ambiente)
- [ ] REDIS_HOST y REDIS_PORT configurados
- [ ] NODE_ENV=production
- [ ] No hay variables de entorno hardcodeadas

bash
# Verificar JWT_SECRET
grep -r "your-secret" backend/src/  # Debe retornar 0 resultados