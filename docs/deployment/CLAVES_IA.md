# Claves de IA: dónde viven y cómo protegerlas

Aplica a `ANTHROPIC_API_KEY` (análisis) y `OPENAI_API_KEY` (transcripción de voz).
Las mismas reglas sirven para `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.

## Qué hace ya el código

| Protección | Dónde |
|---|---|
| La clave solo se lee en el servidor, en un único archivo | `backend/src/config/anthropic.ts` |
| El frontend nunca la recibe: todas las llamadas a Claude pasan por el backend | rutas `/api/*` |
| En producción el backend **no arranca** sin una clave `sk-ant-…` válida | `verificarClaveAnthropic()` en `app.ts` |
| Los logs redactan `sk-ant-…`, `sk-…`, `sk_live_…`, `whsec_…` y `Bearer …` | `backend/src/utils/logger.ts` |
| `.env` y `.env.*` fuera de git y fuera de las imágenes Docker | `.gitignore`, `.dockerignore` |
| El pre-deploy falla si encuentra una clave real en el repo, en una variable `NEXT_PUBLIC_` o en el bundle del frontend; usa gitleaks si está instalado | `scripts/pre-deploy-check.sh` |
| Cada llamada queda registrada con tokens y costo, para detectar gasto anómalo | tabla `uso_ia` |

## Lo que tienes que hacer tú (una vez)

### 1. Consola de Anthropic (console.anthropic.com)

1. Crea **dos workspaces**: `bi0a100-produccion` y `bi0a100-desarrollo`.
2. En cada uno, **Limits → Spend limit**: pon un tope mensual. Referencia para
   empezar: desarrollo $20, producción según clientes (ver
   `docs/pricing/PROPUESTA_PLANES_2026-09.md`). Si se alcanza el tope, la API
   responde error y los análisis salen con plantilla: no se pierde dinero.
3. Crea **una API key por workspace**, con nombre (`backend-prod`, `backend-dev`).
   Nunca uses la de producción en tu máquina.
4. Activa las **alertas de gasto por email** al 50 % y 80 % del tope.

### 2. Hosting (Railway, Render o similar)

- Pega la clave en **Variables / Secrets** del servicio backend. No en el
  Dockerfile, no en `docker-compose.prod.yml`, no en el repositorio.
- El servicio frontend **no** debe tener `ANTHROPIC_API_KEY` ni `OPENAI_API_KEY`.
- Nunca crees una variable `NEXT_PUBLIC_…` con una clave: Next.js la mete en el
  JavaScript que descarga el navegador.

### 3. Desarrollo local

- Pon `ANTHROPIC_API_KEY=sk-ant-…` (la de desarrollo) en el `.env` de la raíz.
  `docker-compose.yml` la pasa al backend.
- Sin clave, todo funciona igual pero los análisis salen de plantillas.

## Rotación

- **Cada 3 meses**, o de inmediato si: la clave aparece en un log, un commit, un
  chat o una captura; se va alguien con acceso; o hay gasto que no cuadra en
  `uso_ia`.
- Pasos: crear clave nueva → actualizar la variable en el hosting → redeploy →
  comprobar en `/health` y en un análisis → **borrar la clave vieja** en la
  Consola.

## Si una clave se filtra

1. Bórrala en la Consola (deja de funcionar al instante).
2. Crea otra y despliega.
3. Revisa el gasto del día en la Consola y en `uso_ia`.
4. Si llegó a git: borrar el commit no basta, la clave ya es pública. Rotarla es
   lo que la invalida.
