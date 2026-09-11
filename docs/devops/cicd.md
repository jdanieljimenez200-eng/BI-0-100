# CI/CD — GitHub Actions

Pipeline de integración continua y deploy.

## Workflow

### Trigger

- Push a `main` o `develop`
- PR creation
- Manual trigger

### Steps

1. **Checkout** — Clone repo
2. **Setup Node** — Node.js 18
3. **Install deps** — npm install
4. **Typecheck** — tsc --noEmit
5. **Lint** — npm run lint (si existe)
6. **Tests** — npm test
7. **Build** — npm run build
8. **Docker Build** — Build image
9. **Push Docker** — To Docker registry
10. **Deploy** — Railway/Vercel auto-redeploy

## Archivos

### .github/workflows/ci.yml

yaml
name: CI