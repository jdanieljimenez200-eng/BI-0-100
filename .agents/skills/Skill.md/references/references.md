# Checklist de auditoría

## Flujos
- [ ] Todos los caminos de error tienen manejo (try/catch, Result, etc.)
- [ ] Promesas/async siempre await o .catch; sin promesas colgantes
- [ ] Casos límite: vacío, null/undefined, cero, negativos, listas grandes
- [ ] Recursos liberados (conexiones, ficheros, locks, timers)
- [ ] Sin condiciones de carrera ni estados intermedios inconsistentes

## Seguridad
- [ ] Entradas validadas y saneadas (allowlist, no blocklist)
- [ ] Consultas parametrizadas; sin concatenación SQL/command
- [ ] Salida escapada en HTML/JSON para evitar XSS
- [ ] Sin secretos hardcodeados (claves, tokens, contraseñas)
- [ ] Autenticación y autorización en cada endpoint sensible
- [ ] Dependencias sin CVEs conocidos
- [ ] CORS, cabeceras de seguridad y cookies (HttpOnly, Secure, SameSite)
- [ ] Datos sensibles cifrados en tránsito y reposo; logs sin PII

## Calidad / optimización
- [ ] Sin duplicación significativa (DRY)
- [ ] Complejidad ciclomática razonable por función
- [ ] Sin N+1 ni consultas en bucles; índices adecuados
- [ ] Estructuras de datos y algoritmos apropiados
- [ ] Sin trabajo bloqueante en el hilo principal

## Implementación correcta
- [ ] Cada función hace lo que su nombre/contrato indica
- [ ] Sin TODO/FIXME/funciones a medias en rutas críticas
- [ ] Returns y valores por defecto correctos
- [ ] Contratos de API coherentes (tipos, códigos de estado)
- [ ] Tests existen, pasan y cubren la lógica clave

## Archivos huérfanos / código muerto
- [ ] Módulos sin importadores
- [ ] Exports/funciones/variables sin uso
- [ ] Dependencias declaradas y no usadas (y usadas no declaradas)
- [ ] Assets (imágenes, estilos) no referenciados
- [ ] Código inalcanzable o tras returns