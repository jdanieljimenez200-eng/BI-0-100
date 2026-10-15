# Deployment — Railway + Vercel

> [!WARNING]
> **Histórico.** Desde el 2026-10-14 el despliegue es todo en Railway, frontend incluido: ver [`docs/deployment/RAILWAY.md`](../deployment/RAILWAY.md). Lo de Vercel de este documento ya no aplica.

Guía de deploy a producción.

## Backend (Railway)

### Prerequisitos

- Railway account (railway.app)
- GitHub repo conectado
- Environment variables configuradas

### Steps

1. **Crear Proyecto en Railway**

   - Ir a railway.app/new
   - Conectar GitHub repo
   - Railway detecta Dockerfile automáticamente

2. **Configurar Variables de Entorno**

   Railway dashboard → Environment → Agregar:
