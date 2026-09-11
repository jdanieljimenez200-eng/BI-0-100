# Workflow de Desarrollo

Convenciones, flujo de trabajo y estándares para desarrolladores.

## Git Workflow

### Ramas

- `main` — Producción (protegida, solo PR merges)
- `develop` — Integración (rama base para features)
- `feature/*` — Features nuevas
- `fix/*` — Bug fixes
- `hotfix/*` — Fixes urgentes en producción

### Flujo de Feature

bash
# 1. Desde develop, crear rama
git checkout develop
git pull origin develop
git checkout -b feature/nombre-descriptivo